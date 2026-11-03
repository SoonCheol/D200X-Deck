'use strict';

/* global $, ACTION_LABELS, activePage, addOpenKeyForPage, addPage, addSubpage, api, autoIconFor, backgroundFor, capturePageImage, COLS, commit, confirmAction, downscaleBackground, downscaleImage, drawIndex, drawSystemPanel, effectiveKey, ensureKey, esc, isPinnedSlot, KEY_COUNT, keyIndexToSlot, lastCleared, lastPageCleared, LEGACY_DEFAULT_EMOJI, loadSiteIcon, navigate, openAppPicker, openHotkeyModal, openIconLibrary, openStoreModal, pickImageData, pinnedFor, pluginImages, pluginStateImages, prettyHotkey, readFileAsDataUrl, refreshWideStats, renderAll, renderGrid, renderPageList, scheduleAutoExit, scheduleSave, setKeyIconFromLibrary, state, syncCommandOutputs, syncPlugins, toast, uniquePageName, uuid, WIDE_KEY_INDEX, wideOptions */

// --------------------------------------------------------------- inspector

const DEFAULT_KEY_COLOR = '#1b2130';

// Preserve the user's manual collapse choice per key across inspector renders.
const triggerSectionOpen = new WeakMap();

// At narrow widths the inspector is a fixed drawer. Its open state is explicit
// so Page settings stays reachable without a selected key.
function inspectorDrawerOpen() {
  return Boolean($('#inspector')?.classList.contains('open'));
}

function openInspectorDrawer() {
  $('#deck-settings')?.classList.add('hidden');
  if (window.innerWidth > 1179) return;
  $('#inspector')?.classList.add('open');
  $('#drawer-scrim')?.classList.remove('hidden');
}

function closeInspectorDrawer() {
  $('#inspector')?.classList.remove('open');
  $('#drawer-scrim')?.classList.add('hidden');
}

function closeInspector() {
  state.selected = null;
  closeInspectorDrawer();
  renderGrid();
  renderInspector();
}

function syncPageSettingsButton() {
  const button = $('#page-settings-btn');
  if (button) button.classList.toggle('active', state.selected === null);
}

// Shown in the Icon tab when a key intentionally has no image.
const NO_ICON_GLYPH = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="3" y="4" width="18" height="16" rx="3" />
  <path d="M3.5 16.5l5-5 3.5 3.5 2-2 5.5 5.5" />
  <circle cx="15.5" cy="8.5" r="1.4" />
  <path d="M4 4l16 16" />
</svg>`;

const ACTION_GROUPS = window.DeckActions.ACTION_GROUPS;

function actionGroups(selected) {
  return ACTION_GROUPS.map(([label, types]) => {
    const options = types
      .filter((type) => ACTION_LABELS[type])
      .map(
        (type) =>
          `<option value="${type}" ${type === selected ? 'selected' : ''}>${esc(ACTION_LABELS[type])}</option>`
      )
      .join('');
    return options ? `<optgroup label="${esc(label)}">${options}</optgroup>` : '';
  }).join('');
}

// The compact trigger editor only supports value-based actions. Complex
// editors (Plugin, Multi, POP, Timer, ...) live on the main key action.
const TRIGGER_GROUPS = window.DeckActions.TRIGGER_GROUPS;

function triggerGroups(selected) {
  return TRIGGER_GROUPS.map(([label, types]) => {
    const options = types
      .map(
        (type) =>
          `<option value="${type}" ${type === selected ? 'selected' : ''}>${
            type === 'none' ? 'Nothing' : esc(ACTION_LABELS[type] || type)
          }</option>`
      )
      .join('');
    return `<optgroup label="${esc(label)}">${options}</optgroup>`;
  }).join('');
}

const MEDIA_LABELS = window.DeckActions.MEDIA_LABELS;

function basename(target) {
  const value = String(target || '').trim();
  if (!value) return '';
  const name = value.split('/').filter(Boolean).pop() || value;
  return name.replace(/\.app$/i, '');
}

function pageName(id) {
  return state.config.pages.find((p) => p.id === id)?.name || 'Page';
}

/** Pages a key can navigate to: same profile only. */
function pagesFor(profileId = state.config.activeProfileId) {
  return state.config.pages.filter((page) => page.profileId === profileId);
}

/** Emoji/caption the app suggests for an action (only applied to untouched keys). */
function actionMeta(action) {
  if (!action) return {};
  switch (action.type) {
    case 'media':
      return { label: MEDIA_LABELS[action.op] };
    case 'text': {
      const text = String(action.value || '').trim();
      return text ? { emoji: text } : { label: 'Type text' };
    }
    case 'hotkey':
      return { label: action.value || 'Hotkey' };
    case 'close':
      return { label: action.value ? `Quit ${basename(action.value)}` : 'Close app' };
    case 'command':
      return { label: 'Command' };
    case 'app':
      return { label: basename(action.value) };
    case 'url':
      return { label: action.value ? action.value.replace(/^https?:\/\//i, '').replace(/\/$/, '') : 'URL' };
    case 'page':
      if (action.op === 'next') return { label: 'Next page' };
      if (action.op === 'prev') return { label: 'Previous page' };
      if (action.op === 'back') return { label: 'Back' };
      return { label: action.value ? pageName(action.value) : 'Page' };
    case 'timer':
      return { label: 'Timer' };
    case 'brightness':
      return { label: action.op === 'down' ? 'Dimmer' : 'Brighter' };
    case 'pop':
      return { label: 'POP menu' };
    case 'sound':
      return { label: action.op === 'stop' ? 'Stop audio' : 'Play audio' };
    default:
      return {};
  }
}

/**
 * Keep the tile in sync with the action: fill the emoji/caption with the suggested
 * value unless the user already customised them.
 */
function syncActionMeta(key) {
  const meta = actionMeta(key.action);
  const legacy = LEGACY_DEFAULT_EMOJI[key.action.type];
  const emojiIsAuto =
    !key.emoji || key.emoji === key.emojiAuto || Boolean(legacy?.has(key.emoji));
  const labelIsAuto = !key.label || key.label === key.labelAuto;
  if (key.action.type === 'text') {
    const text = String(key.action.value || '').trim();
    if (emojiIsAuto) {
      key.emoji = text || '';
      key.emojiAuto = text || '';
    }
    if (labelIsAuto) {
      key.label = text ? '' : 'Type text';
      if (text) delete key.labelAuto;
      else key.labelAuto = 'Type text';
    }
    return;
  }
  if (emojiIsAuto) {
    const nextEmoji = meta.emoji || '';
    if (key.emoji !== nextEmoji) key.emoji = nextEmoji;
    if (nextEmoji) key.emojiAuto = nextEmoji;
    else delete key.emojiAuto;
  }
  if (meta.label && labelIsAuto) {
    key.label = meta.label;
    key.labelAuto = meta.label;
  }
}

const MULTI_STEP_TYPES = window.DeckActions.MULTI_STEP_TYPES;
const MULTI_STEP_GROUPS = window.DeckActions.MULTI_STEP_GROUPS;

const VALUE_LABELS = {
  hotkey: 'Combination',
  page: 'Navigation',
  app: 'Application',
  url: 'URL',
  multi: 'Steps',
  toggle: 'Actions',
  pop: 'Actions',
  indicator: 'About',
  text: 'Text to type',
  command: 'Command',
  sound: 'Sound file',
  close: 'Application',
  timer: 'Duration (seconds)',
  media: 'Media key',
  brightness: 'Step (%)',
};

const MEDIA_STEP_OPTIONS = [
  ['playpause', 'Play / pause'],
  ['next', 'Next track'],
  ['prev', 'Previous track'],
  ['volumeup', 'Volume up'],
  ['volumedown', 'Volume down'],
  ['mute', 'Mute'],
];

function stepPluginList() {
  return state.plugins.filter((p) => p.compatible);
}

function stepPlugin(act) {
  const compatible = stepPluginList();
  return (
    compatible.find(
      (p) => p.uuid === act.plugin && (p.sdk || 'ulanzi') === (act.sdk || 'ulanzi')
    ) ||
    compatible.find((p) => p.uuid === act.plugin) ||
    null
  );
}

function defaultStepAction(type) {
  if (type === 'media') return { type, op: 'playpause' };
  if (type === 'timer') return { type, seconds: 300, sound: true };
  if (type === 'brightness') return { type, op: 'up', step: 5 };
  if (type === 'sound') return { type, op: 'play', value: '', volume: 1 };
  if (type === 'plugin') {
    const plugin = stepPluginList()[0] || null;
    return {
      type,
      sdk: plugin?.sdk || 'ulanzi',
      plugin: plugin?.uuid || '',
      action: plugin?.actions?.[0]?.uuid || '',
      actionid: uuid(),
      settings: {},
    };
  }
  return { type, value: '' };
}

function multiStepControls(act, index) {
  if (!act.type) {
    return '<span class="field-hint" style="margin:0">Choose an action type.</span>';
  }
  if (act.type === 'hotkey') {
    return `<button class="btn hotkey-value" data-hotkey="${index}">${esc(
      prettyHotkey(act.value) || act.value || 'Set hotkey…'
    )}</button>`;
  }
  if (act.type === 'media') {
    return `<select class="select" data-field="op" aria-label="Media key">${MEDIA_STEP_OPTIONS.map(
      ([value, label]) =>
        `<option value="${value}" ${act.op === value ? 'selected' : ''}>${label}</option>`
    ).join('')}</select>`;
  }
  if (act.type === 'page') {
    return `<select class="select" data-field="value" aria-label="Target page">${pagesFor()
      .map(
        (p) =>
          `<option value="${esc(p.id)}" ${p.id === act.value ? 'selected' : ''}>${esc(p.name)}</option>`
      )
      .join('')}</select>`;
  }
  if (act.type === 'timer') {
    return `<div class="multi-inline">
      <input class="input multi-small" type="number" min="1" max="86400" step="1" data-field="seconds"
        value="${Math.max(1, Number(act.seconds) || 300)}" aria-label="Timer seconds" />
      <span class="multi-unit">sec</span>
      <label class="check-row multi-check"><input type="checkbox" data-field="sound" ${
        act.sound !== false ? 'checked' : ''
      } /> Sound</label>
    </div>`;
  }
  if (act.type === 'brightness') {
    return `<div class="multi-inline">
      <select class="select multi-small multi-direction" data-field="op" aria-label="Brightness direction">
        <option value="up" ${(act.op || 'up') === 'up' ? 'selected' : ''}>Brighter</option>
        <option value="down" ${act.op === 'down' ? 'selected' : ''}>Dimmer</option>
      </select>
      <input class="input multi-small" type="number" min="1" max="50" step="1" data-field="step"
        value="${Math.min(50, Math.max(1, Number(act.step) || 5))}" aria-label="Brightness step percent" />
      <span class="multi-unit">%</span>
    </div>`;
  }
  if (act.type === 'sound') {
    const op = act.op === 'stop' ? 'stop' : 'play';
    return `<div class="multi-inline">
      <select class="select multi-small" data-field="op" aria-label="Audio action">
        <option value="play" ${op === 'play' ? 'selected' : ''}>Play</option>
        <option value="stop" ${op === 'stop' ? 'selected' : ''}>Stop</option>
      </select>
      ${
        op === 'play'
          ? `<input class="input multi-value" data-field="value" value="${esc(act.value || '')}"
               placeholder="/path/to/sound.mp3" aria-label="Sound file" />
             <button class="btn small" data-pick-audio="${index}">Choose…</button>`
          : '<span class="field-hint" style="margin:0">Stops audio started by this key.</span>'
      }
    </div>`;
  }
  if (act.type === 'plugin') {
    const plugin = stepPlugin(act);
    return `<div class="multi-plugin">
      <select class="select" data-plugin="${index}" aria-label="Step plugin">
        <option value="">Choose a plugin…</option>
        ${stepPluginList()
          .map(
            (p) =>
              `<option value="${esc(p.uuid)}" ${p.uuid === act.plugin ? 'selected' : ''}>${esc(p.name)}</option>`
          )
          .join('')}
      </select>
      <select class="select" data-plugin-action="${index}" aria-label="Step plugin action" ${
        plugin ? '' : 'disabled'
      }>
        <option value="">Choose an action…</option>
        ${(plugin?.actions || [])
          .map(
            (a) =>
              `<option value="${esc(a.uuid)}" ${a.uuid === act.action ? 'selected' : ''}>${esc(a.name)}</option>`
          )
          .join('')}
      </select>
    </div>`;
  }
  const placeholders = {
    text: 'Text to type',
    app: 'Safari or /Applications/Safari.app',
    url: 'https://example.com',
    command: "osascript -e '…'",
    close: 'Safari',
  };
  const placeholder = placeholders[act.type] || 'Value';
  if (act.type === 'app' || act.type === 'close') {
    return `<div class="multi-inline">
      <input class="input multi-value" data-field="value" value="${esc(act.value || '')}"
        placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" />
      <button class="btn small" data-pick-app="${index}">Choose…</button>
    </div>`;
  }
  if (act.type === 'command') {
    return `<textarea class="textarea multi-textarea" data-field="value" rows="2"
      placeholder="${esc(placeholder)}" aria-label="Command">${esc(act.value || '')}</textarea>`;
  }
  return `<input class="input" data-field="value" value="${esc(act.value || '')}"
    placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" />`;
}

function multiEditor(action, page) {
  const steps = Array.isArray(action.steps) ? action.steps : [];
  const rows = steps.map((step, index) => multiStepRow(step, index, steps.length, page)).join('');
  const mode = action.type === 'multi' ? `
    <select class="select" id="insp-multi-mode">
      ${[['sequence', 'Run in order'], ['alternate', 'Alternate'], ['random', 'Random']]
        .map(([v, l]) => `<option value="${v}" ${(action.mode || 'sequence') === v ? 'selected' : ''}>${l}</option>`)
        .join('')}
    </select>` : '';
  const limit = action.type === 'pop' ? 9 : action.type === 'toggle' ? 2 : 12;
  const atLimit = steps.length >= limit;
  const addTip = atLimit
    ? `<span class="hover-tip left" role="tooltip">${
        action.type === 'pop'
          ? 'A POP menu can hold up to 9 actions.'
          : action.type === 'toggle'
            ? 'A Toggle can hold exactly 2 actions.'
            : 'A multi action can hold up to 12 steps.'
      }</span>`
    : '';
  const delayAtLimit = steps.length >= 12;
  const delayTip = delayAtLimit
    ? '<span class="hover-tip left" role="tooltip">A multi action can hold up to 12 steps.</span>'
    : '';
  return `
    ${mode}
    <div class="multi-steps">${rows || '<div class="insp-empty" style="padding:0">No steps yet.</div>'}</div>
    <div class="row">
      <span class="tip-wrap">
        <button class="btn small" id="insp-multi-add" ${atLimit ? 'aria-disabled="true"' : ''}>Add action</button>
        ${addTip}
      </span>
      ${
        action.type === 'pop' || action.type === 'toggle'
          ? ''
          : `<span class="tip-wrap">
               <button class="btn small" id="insp-multi-delay" ${delayAtLimit ? 'aria-disabled="true"' : ''}>Add delay</button>
               ${delayTip}
             </span>`
      }
    </div>`;
}

function multiStepRow(step, index, total, page) {
  const isDelay = step.delay !== undefined;
  const act = isDelay ? null : step.action || { type: '' };
  const knownType = Boolean(act?.type) && MULTI_STEP_TYPES.some(([value]) => value === act.type);
  const unknownType =
    act?.type && !knownType
      ? `<option value="${esc(act.type)}" selected>${esc(
          window.DeckActions.ACTION_LABELS?.[act.type] || act.type
        )}</option>`
      : '';
  const typeGroups = MULTI_STEP_GROUPS.map(
    ([label, types]) =>
      `<optgroup label="${esc(label)}">${types
        .map(
          ([value, text]) =>
            `<option value="${esc(value)}" ${act?.type === value ? 'selected' : ''}>${esc(text)}</option>`
        )
        .join('')}</optgroup>`
  ).join('');
  const placeholder = act && !act.type ? '<option value="" selected disabled>Select…</option>' : '';
  const typeField = act
    ? `<select class="select multi-type" data-type="${index}" aria-label="Step ${index + 1} type">${placeholder}${unknownType}${typeGroups}</select>`
    : '<span class="multi-type multi-delay">Wait</span>';
  const controls = act
    ? multiStepControls(act, index)
    : `<div class="multi-inline">
         <input class="input multi-small" type="number" min="0" step="50" data-delay="${index}"
           value="${Number(step.delay) || 0}" aria-label="Delay milliseconds" />
         <span class="multi-unit">ms</span>
       </div>`;
  return `<div class="multi-row${act ? '' : ' multi-row-delay'}" data-step="${index}">
    <span class="multi-grip" data-grip="${index}" draggable="true" title="Drag to reorder" aria-hidden="true">⠿</span>
    <span class="multi-index">${index + 1}</span>
    ${typeField}
    <div class="multi-buttons">
      <button class="icon-btn" data-move="up" data-step="${index}" title="Move up" aria-label="Move step ${index + 1} up" ${index === 0 ? 'disabled' : ''}>↑</button>
      <button class="icon-btn" data-move="down" data-step="${index}" title="Move down" aria-label="Move step ${index + 1} down" ${index === total - 1 ? 'disabled' : ''}>↓</button>
      <button class="icon-btn" data-remove="${index}" title="Remove" aria-label="Remove step ${index + 1}">×</button>
    </div>
    <div class="multi-controls">${controls}</div>
  </div>`;
}

function focusStep(index, preferred = 'up') {
  requestAnimationFrame(() => {
    const row = document.querySelector(`#inspector .multi-row[data-step="${index}"]`);
    if (!row) return;
    const button =
      row.querySelector(`[data-move="${preferred}"]:not(:disabled)`) ||
      row.querySelector('[data-move]:not(:disabled)');
    (button || row.querySelector('.multi-type'))?.focus?.();
  });
}

function bindMultiEditor(key) {
  const action = key.action;
  if (!Array.isArray(action.steps)) action.steps = [];
  const steps = action.steps;

  const mode = $('#insp-multi-mode');
  if (mode) {
    mode.addEventListener('change', () => {
      action.mode = mode.value;
      commit(false);
    });
  }
  $('#insp-multi-add')?.addEventListener('click', () => {
    if (action.type === 'pop' && steps.length >= 9) {
      return toast('A POP menu can hold up to 9 actions', true);
    }
    if (action.type === 'toggle' && steps.length >= 2) {
      return toast('A Toggle can hold exactly 2 actions', true);
    }
    if (action.type !== 'pop' && action.type !== 'toggle' && steps.length >= 12) {
      return toast('A multi action can hold up to 12 steps', true);
    }
    steps.push({ action: { type: '' } });
    commit();
    renderInspector();
    requestAnimationFrame(() => {
      document
        .querySelector(`#inspector .multi-row[data-step="${steps.length - 1}"] [data-type]`)
        ?.focus();
    });
  });
  $('#insp-multi-delay')?.addEventListener('click', () => {
    if (action.type === 'toggle') return;
    if (steps.length >= 12) return toast('A multi action can hold up to 12 steps', true);
    steps.push({ delay: 250 });
    commit();
    renderInspector();
    focusStep(steps.length - 1, 'down');
  });
  document.querySelectorAll('#inspector [data-type]').forEach((select) => {
    select.addEventListener('change', () => {
      const index = Number(select.dataset.type);
      steps[index] = { action: defaultStepAction(select.value) };
      commit();
      renderInspector();
      focusStep(index, 'down');
    });
  });
  document.querySelectorAll('#inspector [data-hotkey]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.hotkey);
      const act = steps[index]?.action || { type: 'hotkey', value: '' };
      openHotkeyModal({ action: { ...act } }, (next) => {
        steps[index] = { action: { ...act, value: next.value } };
        commit();
        renderInspector();
      });
    });
  });
  document.querySelectorAll('#inspector .multi-row [data-field]').forEach((input) => {
    const row = input.closest('.multi-row');
    const index = Number(row?.dataset.step);
    const field = input.dataset.field;
    const apply = () => {
      const act = steps[index]?.action;
      if (!act) return;
      if (field === 'sound') {
        steps[index] = { action: { ...act, sound: input.checked } };
      } else if (field === 'seconds') {
        const seconds = Math.min(86_400, Math.max(1, Math.round(Number(input.value) || 300)));
        input.value = String(seconds);
        steps[index] = { action: { ...act, seconds } };
      } else if (field === 'step') {
        const step = Math.min(50, Math.max(1, Math.round(Number(input.value) || 5)));
        input.value = String(step);
        steps[index] = { action: { ...act, step } };
      } else if (field === 'op') {
        steps[index] = { action: { ...act, op: input.value } };
        if (act.type === 'sound') {
          commit();
          renderInspector();
          return;
        }
      } else {
        steps[index] = { action: { ...act, value: input.value } };
      }
      commit(false);
    };
    if (input.tagName === 'SELECT' || input.type === 'checkbox' || input.type === 'number') {
      input.addEventListener('change', apply);
    } else {
      input.addEventListener('input', apply);
    }
  });
  document.querySelectorAll('#inspector [data-plugin]').forEach((select) => {
    select.addEventListener('change', () => {
      const index = Number(select.closest('.multi-row')?.dataset.step);
      const plugin = stepPluginList().find((p) => p.uuid === select.value);
      if (!plugin) return;
      steps[index] = {
        action: {
          type: 'plugin',
          sdk: plugin.sdk || 'ulanzi',
          plugin: plugin.uuid,
          action: plugin.actions?.[0]?.uuid || '',
          actionid: uuid(),
          settings: {},
        },
      };
      commit();
      renderInspector();
      focusStep(index, 'down');
    });
  });
  document.querySelectorAll('#inspector [data-plugin-action]').forEach((select) => {
    select.addEventListener('change', () => {
      const index = Number(select.closest('.multi-row')?.dataset.step);
      const act = steps[index]?.action;
      if (!act || act.type !== 'plugin') return;
      steps[index] = { action: { ...act, action: select.value, actionid: uuid(), settings: {} } };
      commit();
      renderInspector();
      focusStep(index, 'down');
    });
  });
  document.querySelectorAll('#inspector [data-pick-audio]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const index = Number(btn.closest('.multi-row')?.dataset.step);
      const act = steps[index]?.action;
      if (!act) return;
      const file = await api.pickAudio();
      if (!file) return;
      steps[index] = { action: { ...act, value: file } };
      commit();
      renderInspector();
      focusStep(index, 'down');
    });
  });
  document.querySelectorAll('#inspector [data-pick-app]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = Number(btn.closest('.multi-row')?.dataset.step);
      const act = steps[index]?.action;
      if (!act) return;
      openAppPicker('trigger', (app) => {
        const current = steps[index]?.action || act;
        steps[index] = {
          action: {
            ...current,
            type: current.type === 'close' ? 'close' : 'app',
            value: app.path,
          },
        };
        commit();
        renderInspector();
        focusStep(index, 'down');
      });
    });
  });
  document.querySelectorAll('#inspector [data-delay]').forEach((input) => {
    input.addEventListener('change', () => {
      const index = Number(input.dataset.delay);
      steps[index] = { delay: Math.max(0, Number(input.value) || 0) };
      commit(false);
    });
  });
  document.querySelectorAll('#inspector [data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.remove);
      steps.splice(index, 1);
      commit();
      renderInspector();
      focusStep(Math.min(index, steps.length - 1), 'down');
    });
  });
  document.querySelectorAll('#inspector [data-move]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const from = Number(btn.closest('.multi-row')?.dataset.step);
      const direction = btn.dataset.move === 'up' ? -1 : 1;
      const to = from + direction;
      if (from < 0 || to < 0 || to >= steps.length) return;
      const [step] = steps.splice(from, 1);
      steps.splice(to, 0, step);
      commit();
      renderInspector();
      focusStep(to, btn.dataset.move);
    });
  });

  let dragFrom = null;
  document.querySelectorAll('#inspector [data-grip]').forEach((grip) => {
    grip.addEventListener('dragstart', (event) => {
      dragFrom = Number(grip.dataset.grip);
      event.dataTransfer.setData('application/x-ulanzi-step', String(dragFrom));
      event.dataTransfer.effectAllowed = 'move';
      grip.closest('.multi-row')?.classList.add('dragging');
    });
    grip.addEventListener('dragend', () => {
      dragFrom = null;
      document
        .querySelectorAll('#inspector .multi-row.dragging, #inspector .multi-row.drop-target')
        .forEach((row) => row.classList.remove('dragging', 'drop-target'));
    });
  });
  document.querySelectorAll('#inspector .multi-row').forEach((row) => {
    row.addEventListener('dragover', (event) => {
      const carriesStep = Array.from(event.dataTransfer.types).includes('application/x-ulanzi-step');
      if (dragFrom === null && !carriesStep) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      row.classList.add('drop-target');
    });
    row.addEventListener('dragleave', (event) => {
      if (event.relatedTarget && row.contains(event.relatedTarget)) return;
      row.classList.remove('drop-target');
    });
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      const from = dragFrom ?? Number(event.dataTransfer.getData('application/x-ulanzi-step'));
      const to = Number(row.dataset.step);
      row.classList.remove('drop-target');
      dragFrom = null;
      if (!Number.isInteger(from) || from === to || from < 0 || from >= steps.length) return;
      const [step] = steps.splice(from, 1);
      steps.splice(to, 0, step);
      commit();
      renderInspector();
      focusStep(to, 'down');
    });
  });
}

function triggerField(key, field, label, page, disabled = false) {
  const action = key[field] || { type: 'none' };
  const disabledAttr = disabled ? 'disabled' : '';
  const pageOptions = pagesFor(page.profileId)
    .map(
      (p) =>
        `<option value="${esc(p.id)}" ${p.id === action.value ? 'selected' : ''}>${esc(p.name)}</option>`
    )
    .join('');
  let control = '';
  if (action.type === 'hotkey') {
    control = `<button class="btn hotkey-value" data-trigger-hotkey="${field}" ${disabledAttr}>${esc(
      action.value || 'Set hotkey…'
    )}</button>`;
  } else if (action.type === 'media') {
    const ops = [
      ['playpause', 'Play / pause'],
      ['next', 'Next track'],
      ['prev', 'Previous track'],
      ['volumeup', 'Volume up'],
      ['volumedown', 'Volume down'],
      ['mute', 'Mute'],
    ];
    control = `<select class="select" data-trigger-value="${field}" ${disabledAttr}>${ops
      .map(([v, l]) => `<option value="${v}" ${v === action.op ? 'selected' : ''}>${l}</option>`)
      .join('')}</select>`;
  } else if (action.type === 'page') {
    control = `<select class="select" data-trigger-value="${field}" ${disabledAttr}>${pageOptions}</select>`;
  } else if (action.type === 'app' || action.type === 'close') {
    control = `<div class="row">
      <input class="input" data-trigger-value="${field}" value="${esc(action.value || '')}" placeholder="Safari" ${disabledAttr} />
      <button class="btn small" data-trigger-app="${field}" ${disabledAttr}>Choose…</button>
    </div>`;
  } else if (action.type !== 'none') {
    control = `<input class="input" data-trigger-value="${field}" value="${esc(
      action.value || ''
    )}" placeholder="${action.type === 'url' ? 'https://…' : ''}" ${disabledAttr} />`;
  }
  return `<div class="field trigger-field">
    <label>${label}</label>
    <select class="select" data-trigger-type="${field}" ${disabledAttr}>
      ${triggerGroups(action.type)}
    </select>
    ${control}
  </div>`;
}

function bindTriggerFields(key) {
  const el = $('#inspector');
  el.querySelectorAll('[data-trigger-type]').forEach((select) => {
    select.addEventListener('change', () => {
      const field = select.dataset.triggerType;
      const type = select.value;
      if (type === 'none') delete key[field];
      else if (type === 'media') key[field] = { type: 'media', op: 'playpause' };
      else if (type === 'hotkey') key[field] = { type: 'hotkey', value: '' };
      else if (type === 'page') {
        // Seed the target: the select would otherwise display the first page
        // while the action kept an empty value, so the press did nothing.
        const current = activePage();
        const options = pagesFor(current?.profileId);
        const target = options.find((p) => p.id !== current?.id) || options[0];
        key[field] = { type: 'page', op: 'goto', value: target ? target.id : '' };
      } else key[field] = { type, value: '' };
      commit();
      renderInspector();
    });
  });
  el.querySelectorAll('[data-trigger-value]').forEach((input) => {
    const field = input.dataset.triggerValue;
    const apply = (raw) => {
      if (!key[field]) return;
      if (key[field].type === 'media') key[field] = { ...key[field], op: raw };
      else key[field] = { ...key[field], value: raw };
      commit(false);
    };
    input.addEventListener('input', (e) => apply(e.target.value));
    input.addEventListener('change', (e) => apply(e.target.value));
  });
  el.querySelectorAll('[data-trigger-app]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.triggerApp;
      openAppPicker('trigger', (app) => {
        const type = key[field]?.type === 'close' ? 'close' : 'app';
        key[field] = { ...(key[field] || {}), type, value: app.path };
        commit();
        renderInspector();
      });
    });
  });
  el.querySelectorAll('[data-trigger-hotkey]').forEach((btn) => {
    const field = btn.dataset.triggerHotkey;
    btn.addEventListener('click', () => {
      const holder = { action: key[field] || { type: 'hotkey', value: '' } };
      openHotkeyModal(holder, (next) => {
        key[field] = { type: 'hotkey', value: next.value };
        commit();
        renderInspector();
      });
    });
  });
  const holdMs = el.querySelector('#insp-hold-ms');
  if (holdMs) {
    holdMs.addEventListener('change', () => {
      key.holdMs = Math.max(150, Math.min(2000, Number(holdMs.value) || 500));
      commit(false);
    });
  }
  const triggerSection = el.querySelector('#trigger-section');
  if (triggerSection) {
    triggerSection.addEventListener('toggle', () => {
      triggerSectionOpen.set(key, triggerSection.open);
    });
  }
}

/** Parent choices: same profile only, never the page itself or its descendants. */
function parentPageOptions(page) {
  const pages = state.config.pages.filter((p) => p.profileId === page.profileId && p.id !== page.id);
  const byId = new Map(state.config.pages.map((p) => [p.id, p]));
  const isDescendant = (candidate) => {
    let current = candidate;
    const seen = new Set();
    while (current?.parentId && !seen.has(current.id)) {
      if (current.parentId === page.id) return true;
      seen.add(current.id);
      current = byId.get(current.parentId);
    }
    return false;
  };
  return pages
    .filter((p) => !isDescendant(p))
    .map((p) => `<option value="${esc(p.id)}" ${p.id === page.parentId ? 'selected' : ''}>${esc(p.name)}</option>`)
    .join('');
}

function renderWideInspector(el, page) {
  const mode = page.wideMode === 'stats' || page.wideMode === 'blank' ? page.wideMode : 'clock';
  const options = [
    ['clock', 'Clock', 'Time and date, rendered by the Deck.'],
    ['stats', 'System stats', 'Live CPU, memory and GPU usage from this Mac.'],
    ['blank', 'Page wallpaper', 'No clock or stats — just the page wallpaper.'],
  ];
  el.innerHTML = `
    <div class="insp-head">
      <h2>Wide key</h2>
      <span class="index">row 3 · col 4–5 (2×1)</span>
      <button class="icon-btn drawer-close" id="insp-drawer-close" title="Close">×</button>
    </div>
    <div class="field">
      <label>Panel</label>
      <div class="face-tabs wide-mode" role="tablist" aria-label="Wide key panel">
        ${options
          .map(
            ([value, label]) =>
              `<button class="tab ${mode === value ? 'active' : ''}" data-wide-mode="${value}" role="tab" aria-selected="${mode === value ? 'true' : 'false'}">${label}</button>`
          )
          .join('')}
      </div>
      <div class="field-hint">${options.find(([value]) => value === mode)[2]}</div>
    </div>
    <div class="wide-preview"><canvas id="wide-preview" width="402" height="196"></canvas></div>
    <div class="field-hint">The 2×1 key is drawn by the Deck firmware, so it has no action of its own. The preview matches the panel you choose here.</div>
  `;

  el.querySelectorAll('[data-wide-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.wideMode;
      page.wideMode = next === 'clock' ? undefined : next;
      if (!page.wideMode) delete page.wideMode;
      scheduleSave();
      drawIndex(WIDE_KEY_INDEX);
      renderInspector();
      refreshWideStats();
      api.setWideMode(next);
    });
  });
  const preview = $('#wide-preview');
  if (preview && typeof drawSystemPanel === 'function') drawSystemPanel(preview, wideOptions(page));
}

function renderInspector() {
  const el = $('#inspector');
  const page = activePage();
  if (!page) {
    el.innerHTML = '<div class="insp-empty" style="padding:24px">No page in this profile. Create one to start editing.</div>';
    syncPageSettingsButton();
    return;
  }
  syncPageSettingsButton();
  if (state.selected !== null) openInspectorDrawer();
  if (state.selected === WIDE_KEY_INDEX) return renderWideInspector(el, page);

  if (state.selected === null) {
    const configured = Object.entries(page.keys).filter(
      ([index, k]) => Number(index) !== WIDE_KEY_INDEX && k &&
        (k.label || k.emoji || k.icon || (k.action && k.action.type !== 'none'))
    ).length;
    const pins = Object.entries(pinnedFor(page.profileId));
    const children = state.config.pages.filter(
      (p) => p.parentId === page.id && p.profileId === page.profileId
    );
    el.innerHTML = `
      <div class="insp-head"><h2>Page settings</h2><span class="index">${configured}/${KEY_COUNT - 1} keys</span>
        <button class="icon-btn drawer-close" id="insp-drawer-close" title="Close">×</button>
      </div>
      <div class="insp-actions">
        <button class="btn primary" id="insp-add-page">New page</button>
        <button class="btn" id="insp-duplicate-page">Duplicate</button>
        <button class="btn danger insp-clear-btn" id="insp-clear-page" ${configured ? '' : 'disabled'}>${
          configured ? `Clear ${configured} ${configured === 1 ? 'key' : 'keys'}` : 'Clear page'
        }</button>
      </div>
      <div class="insp-separator"></div>
      <div class="field">
        <label>Page name</label>
        <input class="input" id="insp-page-name" value="${esc(page.name)}" maxlength="40" />
      </div>
      <div class="field">
        <label>Parent page</label>
        <select class="select" id="insp-page-parent">
          <option value="">None</option>
          ${parentPageOptions(page)}
        </select>
        <div class="field-hint">
          ${
            page.parentId
              ? `Subpage of “${esc(pageName(page.parentId))}”.`
              : 'This page is top-level. Set a parent to make it a subpage.'
          }
        </div>
        ${page.parentId ? `<div class="row" style="margin-top:8px">
          <button class="btn small" id="insp-page-back">← Back to ${esc(pageName(page.parentId))}</button>
          <button class="btn small" id="insp-add-back">Add Back key</button>
        </div>` : ''}
      </div>
      <div class="settings-block">
        <h3>Subpages</h3>
        ${
          children.length
            ? `<div class="subpage-list">
                ${children
                  .map(
                    (child) => `<div class="subpage-row">
                      <span class="subpage-name">↳ ${esc(child.name)}</span>
                      <span class="subpage-note">${Object.keys(child.keys || {}).length} keys</span>
                      <button class="btn small" data-open-subpage="${esc(child.id)}">Add key</button>
                    </div>`
                  )
                  .join('')}
              </div>`
            : '<div class="field-hint" style="margin:0">No subpages yet.</div>'
        }
        <div class="row" style="margin-top:8px">
          <button class="btn small" id="insp-add-subpage">New subpage</button>
        </div>
        <div class="field-hint">A subpage is a page whose Parent page is this one. “Add key” creates a key here that opens it.</div>
      </div>
      ${page.parentId ? `<div class="field">
        <label>Auto exit</label>
        <div class="row">
          <input class="input" id="insp-auto-exit" type="number" min="0" max="86400" step="1" value="${Number(page.autoExitSeconds) || 0}" />
          <span class="field-hint" style="flex:0 0 auto">seconds (0 = never)</span>
        </div>
        <div class="field-hint">Return to “${esc(pageName(page.parentId))}” after this idle time.</div>
      </div>` : ''}
      <div class="field">
        <label>Background</label>
        <div class="row">
          <button class="btn small" id="insp-page-bg">Choose image…</button>
          <button class="btn small" id="insp-page-snapshot">Snapshot page</button>
          ${page.background ? '<button class="btn small danger" id="insp-page-bg-clear">Clear</button>' : ''}
        </div>
        <div class="field-hint">
          ${
            page.background
              ? 'Custom background for this page.'
              : backgroundFor(page)
                ? 'Using the profile background. Choose an image to override it here.'
                : 'One image is sliced across every key. “Snapshot” captures the current page.'
          }
        </div>
      </div>
      ${pins.length ? `<div class="settings-block">
        <h3>Pinned keys</h3>
        <div class="pinned-list">
          ${pins.map(([slot, key]) => `<div class="pinned-row">
            <span class="pinned-slot">${Number(slot) + 1}</span>
            <span class="pinned-name">${esc(key.label || key.emoji || 'Pinned key')}</span>
            <span class="pinned-note">${page.keys[slot] ? 'overridden here' : 'on every page'}</span>
            <button class="btn small danger" data-unpin="${slot}">Unpin</button>
          </div>`).join('')}
        </div>
        <div class="field-hint">A key placed on a page overrides the pinned key in that slot.</div>
      </div>` : ''}
      <div class="settings-block">
        <h3>Tips</h3>
        <div class="insp-empty" style="padding:0">
          Click a key to edit it. Drag any image onto a key to use it as the icon (it is scaled to 196×196).
          Drag a page in the sidebar to reorder it, or press ⌥↑ / ⌥↓.
          Use New subpage in Page settings to create a child page with its open and Back keys.
          Labels are rendered into the image, so the Deck shows exactly what you see here.
          Select a key and press ⌘C / ⌘V to duplicate it, Delete to clear it (⌘Z undoes).
        </div>
      </div>
    `;

    $('#insp-page-parent')?.addEventListener('change', (e) => {
      if (e.target.value) page.parentId = e.target.value;
      else delete page.parentId;
      commit();
    });
    $('#insp-auto-exit')?.addEventListener('change', (event) => {
      const seconds = Math.max(0, Math.min(86_400, Math.round(Number(event.target.value) || 0)));
      event.target.value = String(seconds);
      if (seconds) page.autoExitSeconds = seconds;
      else delete page.autoExitSeconds;
      scheduleAutoExit(page);
      commit(false);
    });
    $('#insp-page-back')?.addEventListener('click', () => {
      if (page.parentId) navigate(page.parentId);
    });
    $('#insp-add-back')?.addEventListener('click', () => {
      const slot = nextFreeIndex(page);
      if (slot < 0) return toast('No free key slot for a Back key', true);
      page.keys[slot] = {
        emoji: '',
        label: 'Back',
        color: '#1b2130',
        icon: null,
        action: { type: 'page', op: 'back' },
      };
      state.selected = slot;
      renderAll();
      commit();
      toast(`Back key added at key ${slot + 1}`);
    });
    document.querySelectorAll('#inspector [data-unpin]').forEach((button) => {
      button.addEventListener('click', () => {
        const slot = Number(button.dataset.unpin);
        const profile = state.config.profiles.find((entry) => entry.id === page.profileId);
        if (!profile?.pinned?.[slot]) return;
        delete profile.pinned[slot];
        if (!Object.keys(profile.pinned).length) delete profile.pinned;
        commit();
        renderAll();
        toast('Unpinned from all pages');
      });
    });
    $('#insp-page-bg').addEventListener('click', async () => {
      const picked = await pickImageData();
      if (!picked) return;
      page.background = await downscaleBackground(picked);
      renderAll();
      commit();
      renderInspector();
    });
    $('#insp-page-snapshot').addEventListener('click', async () => {
      const shot = await capturePageImage();
      if (!shot) return toast('Could not capture the page', true);
      page.background = shot;
      renderAll();
      commit();
      renderInspector();
      toast('Snapshot saved as the page background');
    });
    const clearPageBg = $('#insp-page-bg-clear');
    if (clearPageBg) {
      clearPageBg.addEventListener('click', () => {
        delete page.background;
        renderAll();
        commit();
        renderInspector();
      });
    }
    $('#insp-page-name').addEventListener('change', (e) => {
      const next = uniquePageName(e.target.value, page.profileId, page.id);
      if (next !== e.target.value.trim()) {
        toast(`Page names must be unique — renamed to “${next}”`);
        e.target.value = next;
      }
      page.name = next;
      renderPageList();
      if (document.activeElement !== $('#page-title')) $('#page-title').value = page.name;
      commit(false);
    });
    $('#insp-page-name').addEventListener('input', (e) => {
      page.name = e.target.value;
      renderPageList();
      if (document.activeElement !== $('#page-title')) $('#page-title').value = page.name;
      scheduleSave();
    });
    $('#insp-clear-page').addEventListener('click', async () => {
      if (!configured) return;
      const snapshot = JSON.parse(JSON.stringify(page.keys || {}));
      const ok = await confirmAction({
        title: `Clear “${page.name}”?`,
        message: `This removes all ${configured} keys from “${page.name}”. You can undo with ⌘Z.`,
        confirmLabel: `Clear ${configured} ${configured === 1 ? 'key' : 'keys'}`,
      });
      if (!ok) return;
      lastCleared = null;
      lastPageCleared = { pageId: page.id, keys: snapshot, selected: state.selected };
      page.keys = {};
      state.selected = null;
      renderAll();
      commit();
      toast('Page cleared — ⌘Z to undo');
    });
    $('#insp-add-page').addEventListener('click', addPage);
    $('#insp-add-subpage')?.addEventListener('click', () => addSubpage(page));
    document.querySelectorAll('#inspector [data-open-subpage]').forEach((button) => {
      button.addEventListener('click', () => addOpenKeyForPage(page, button.dataset.openSubpage));
    });
    $('#insp-duplicate-page').addEventListener('click', () => {
      const copy = JSON.parse(JSON.stringify(page));
      copy.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      const baseName = page.name.replace(/ \(\d+\)$/, '');
      copy.name = uniquePageName(baseName, copy.profileId || page.profileId);
      for (const key of Object.values(copy.keys || {})) {
        for (const field of ['action', 'holdAction', 'doubleAction']) {
          if (key[field] && key[field].type === 'plugin') key[field].actionid = crypto.randomUUID();
        }
      }
      state.config.pages.push(copy);
      state.config.activePageId = copy.id;
      state.selected = null;
      renderAll();
      commit();
      toast(`Created “${copy.name}”`);
    });
    return;
  }

  const pinned = isPinnedSlot(page, state.selected);
  const key = pinned ? pinnedFor(page.profileId)[state.selected] : ensureKey(page, state.selected);
  const liveKey = effectiveKey(key);
  const action = key.action || { type: 'none', value: '' };
  const hasHold = Boolean(key.holdAction && key.holdAction.type !== 'none');
  const hasDouble = Boolean(key.doubleAction && key.doubleAction.type !== 'none');
  const triggersActive = hasHold || hasDouble;
  const triggersEnabled = action.type !== 'none' || triggersActive;
  const triggersOpen = triggerSectionOpen.has(key) ? triggerSectionOpen.get(key) : triggersActive;
  const pageOptions = pagesFor(page.profileId)
    .map(
      (p) =>
        `<option value="${esc(p.id)}" ${p.id === action.value ? 'selected' : ''}>${p.parentId ? '↳ ' : ''}${esc(p.name)}${p.id === page.id ? ' (this page)' : ''}</option>`
    )
    .join('');

  let valueField = '';
  if (action.type === 'app') {
    valueField = `<div class="row">
      <input class="input" id="insp-value" placeholder="Safari or /Applications/Safari.app" value="${esc(action.value)}" />
      <button class="btn" id="insp-pick-app">Choose…</button>
    </div>`;
  } else if (action.type === 'url') {
    valueField = `<div class="row">
      <input class="input" id="insp-value" placeholder="https://example.com" value="${esc(action.value)}" />
      <button class="btn" id="insp-fetch-icon">Favicon</button>
    </div>
    <div class="field-hint">Custom links such as <code>slack://</code> or <code>zoommtg://</code> open the other app. Only use links you trust.</div>`;
  } else if (action.type === 'command') {
    const importedNote = action.imported
      ? '<div class="field-hint insp-warning">This command came from an imported profile. Check what it does before pressing the key.</div>'
      : '';
    const outputOn = action.showOutput === true;
    const interval = Math.min(86_400, Math.max(5, Math.round(Number(action.outputInterval) || 30)));
    valueField = `${importedNote}<textarea class="textarea" id="insp-value" placeholder="osascript -e 'set volume output muted'">${esc(action.value)}</textarea>
      <label class="check-row"><input type="checkbox" id="insp-command-output" ${
        outputOn ? 'checked' : ''
      } /> Show command output on this key</label>
      <div class="row${outputOn ? '' : ' hidden'}" id="insp-command-output-options">
        <span class="field-hint">Refresh every</span>
        <input class="input" id="insp-command-interval" type="number" min="5" max="86400" value="${interval}" />
        <span class="field-hint">seconds</span>
      </div>
      <div class="field-hint">Text is shown as the key caption. A data URL, raw SVG, or PNG/JPG/SVG file path is shown as the key image.</div>`;
  } else if (action.type === 'hotkey') {
    valueField = `<div class="row">
      <button class="btn hotkey-value" id="insp-hotkey-open">${esc(prettyHotkey(action.value) || 'Set hotkey…')}</button>
      <button class="btn ghost" id="insp-hotkey-test">Test</button>
      <button class="btn ghost" id="insp-hotkey-clear">Clear</button>
    </div>`;
  } else if (action.type === 'page') {
    const op = action.op || 'goto';
    const ops = [
      ['goto', 'Go to page'],
      ['next', 'Next page'],
      ['prev', 'Previous page'],
      ...(page.parentId || op === 'back' ? [['back', 'Back to parent page']] : []),
      ['profile', 'Switch profile'],
    ];
    const profileOptions = (state.config.profiles || [])
      .map((p) => `<option value="${esc(p.id)}" ${p.id === action.value ? 'selected' : ''}>${esc(p.name)}</option>`)
      .join('');
    valueField = `<div class="row">
      <select class="select" id="insp-page-op">${ops
        .map(([v, l]) => `<option value="${v}" ${v === op ? 'selected' : ''}>${l}</option>`)
        .join('')}</select>
      ${
        op === 'goto'
          ? `<select class="select" id="insp-value">${pageOptions}</select>`
          : op === 'profile'
            ? `<select class="select" id="insp-value">${profileOptions}</select>`
            : ''
      }
    </div>`;
  } else if (action.type === 'text') {
    valueField = `<input class="input" id="insp-value" placeholder="Text to type into the frontmost app" value="${esc(action.value || '')}" />`;
  } else if (action.type === 'media') {
    const ops = [
      ['playpause', 'Play / pause'],
      ['next', 'Next track'],
      ['prev', 'Previous track'],
      ['volumeup', 'Volume up'],
      ['volumedown', 'Volume down'],
      ['mute', 'Mute'],
    ];
    valueField = `<select class="select" id="insp-value">${ops
      .map(([v, l]) => `<option value="${v}" ${v === action.op ? 'selected' : ''}>${l}</option>`)
      .join('')}</select>`;
  } else if (action.type === 'sound') {
    const op = action.op || 'play';
    valueField = `<div class="row">
      <select class="select" id="insp-sound-op" style="flex:0 0 96px">
        <option value="play" ${op === 'play' ? 'selected' : ''}>Play</option>
        <option value="stop" ${op === 'stop' ? 'selected' : ''}>Stop</option>
      </select>
      ${
        op === 'play'
          ? `<input class="input" id="insp-value" value="${esc(action.value || '')}" placeholder="/path/to/sound.mp3" />
             <button class="btn" id="insp-pick-audio">Choose…</button>`
          : '<span class="field-hint">Stops the audio started by this key.</span>'
      }
    </div>`;
  } else if (action.type === 'indicator') {
    valueField = '<div class="field-hint">Shows the current page position. It cannot be pressed.</div>';
  } else if (action.type === 'timer') {
    valueField = `<div class="row">
      <input class="input" id="insp-timer-seconds" type="number" min="1" max="86400" step="1" value="${Number(action.seconds) || 300}" />
      <span class="field-hint" style="flex:0 0 auto">seconds</span>
    </div>
    <label class="check-row"><input type="checkbox" id="insp-timer-sound" ${action.sound !== false ? 'checked' : ''} /> Play a sound when it finishes</label>
    <div class="field-hint">Press to start, press again to cancel. The countdown is shown on the key.</div>`;
  } else if (action.type === 'brightness') {
    valueField = `<div class="row">
      <select class="select" id="insp-brightness-op">
        <option value="up" ${(action.op || 'up') === 'up' ? 'selected' : ''}>Brighter</option>
        <option value="down" ${action.op === 'down' ? 'selected' : ''}>Dimmer</option>
      </select>
      <input class="input" id="insp-brightness-step" type="number" min="1" max="50" step="1" value="${Number(action.step) || 5}" />
      <span class="field-hint" style="flex:0 0 auto">%</span>
    </div>`;
  } else if (action.type === 'multi' || action.type === 'toggle') {
    valueField = multiEditor(action, page);
  } else if (action.type === 'pop') {
    valueField = `${multiEditor(action, page)}<div class="field-hint">Pressing the key opens these actions in a popup at the pointer.</div>`;
  } else if (action.type === 'close') {
    valueField = `<div class="row">
      <input class="input" id="insp-value" placeholder="Safari" value="${esc(action.value || '')}" />
      <button class="btn" id="insp-pick-app">Choose…</button>
    </div>`;
  }

  let pluginFields = '';
  if (action.type === 'plugin') {
    const compatible = state.plugins.filter((p) => p.compatible);
    const plugin =
      compatible.find((p) => p.uuid === action.plugin && (p.sdk || 'ulanzi') === (action.sdk || 'ulanzi')) ||
      compatible.find((p) => p.uuid === action.plugin) ||
      null;
    const pluginActions = plugin ? plugin.actions : [];
    const pluginAction = pluginActions.find((a) => a.uuid === action.action) || null;
    const knownPlugin = state.plugins.find((p) => p.uuid === action.plugin) || null;
    const missingPlugin = Boolean(action.plugin) && !plugin;
    const missingWarning = missingPlugin
      ? `<div class="field">
           <div class="insp-missing" role="status">
             <div class="insp-missing-title">${
               knownPlugin
                 ? `“${esc(knownPlugin.name)}” is installed but can’t be used here.`
                 : `“${esc(action.plugin)}” isn’t installed.`
             }</div>
             <div class="field-hint" style="margin:4px 0 8px">Its stored settings are kept until you clear the action.</div>
             <div class="row">
               <button class="btn small" id="insp-plugin-store">Open Store</button>
               <button class="btn small danger" id="insp-plugin-clear">Clear action</button>
             </div>
           </div>
         </div>`
      : '';
    if (!compatible.length) {
      pluginFields = `<div class="field"><div class="insp-empty" style="padding:0">
        No compatible JavaScript plugins found. Install Ulanzi plugins in
        <code>~/Library/Application Support/Ulanzi/UlanziDeck/Plugins</code> and restart.
      </div></div>`;
    } else {
      pluginFields = `
        ${missingWarning}
        <div class="field">
          <label>Plugin</label>
          <select class="select" id="insp-plugin">
            <option value="">Choose a plugin…</option>
            ${[
              ['Stream Deck / OpenAction', compatible.filter((p) => p.sdk === 'streamdeck')],
              ['Ulanzi', compatible.filter((p) => (p.sdk || 'ulanzi') !== 'streamdeck')],
            ]
              .filter(([, list]) => list.length)
              .map(
                ([label, list]) =>
                  `<optgroup label="${esc(label)}">${list
                    .map(
                      (p) =>
                        `<option value="${esc(p.uuid)}" ${p.uuid === action.plugin && (p.sdk || 'ulanzi') === (action.sdk || 'ulanzi') ? 'selected' : ''}>${esc(p.name)}</option>`
                    )
                    .join('')}</optgroup>`
              )
              .join('')}
          </select>
        </div>
        <div class="field">
          <label>Action</label>
          <select class="select" id="insp-plugin-action" ${plugin ? '' : 'disabled'}>
            <option value="">Choose an action…</option>
            ${pluginActions
              .map(
                (a) =>
                  `<option value="${esc(a.uuid)}" ${a.uuid === action.action ? 'selected' : ''}>${esc(a.name)}</option>`
              )
              .join('')}
          </select>
        </div>
        ${
          !pluginAction
            ? `<div class="insp-empty" style="padding:0;font-size:11px">
                 ${plugin ? 'Choose an action to configure its settings.' : 'Choose a plugin and an action to configure its settings.'}
               </div>`
            : pluginAction.propertyInspector
              ? `<div class="field">
                   <label>Settings</label>
                   <div id="pi-host" class="pi-host"><div class="insp-empty" style="padding:0">Loading settings…</div></div>
                 </div>`
              : `<div class="field">
                   <div class="field-hint" style="margin:0 0 8px">
                     This action has no settings page. Live images come from <b>${esc(plugin.name)}</b>.
                   </div>
                   <details class="insp-advanced" ${Object.keys(action.settings || {}).length ? 'open' : ''}>
                     <summary>Advanced: edit settings JSON</summary>
                     <textarea class="textarea" id="insp-plugin-settings" placeholder="{}">${esc(
                       JSON.stringify(action.settings || {}, null, 2)
                     )}</textarea>
                     <div class="field-hint">Only needed for plugins that document their settings keys.</div>
                   </details>
                 </div>`
        }
      `;
    }
  }

  const face =
    key.face === 'tile'
      ? 'tile'
      : key.face === 'text'
        ? 'text'
        : key.face === 'icon'
          ? 'icon'
          : key.icon || autoIconFor(key)
            ? 'icon'
            : 'text';
  const isDefaultColor = String(key.color || DEFAULT_KEY_COLOR).toLowerCase() === DEFAULT_KEY_COLOR;
  const captionVisible =
    key.font?.showLabel !== false && (!liveKey.liveImage || key.font?.captionExplicit === true);
  const autoIcon = autoIconFor(key);
  // A plugin that pushes an image owns the key face: effectiveKey() replaces the
  // stored icon, so offering the icon controls would silently do nothing.
  const pluginActionId = action.type === 'plugin' ? action.actionid : null;
  const stateIndex = Math.max(0, Number(key.stateIndex) || 0);
  const liveImageActive = Boolean(
    pluginActionId &&
      (pluginImages.has(pluginActionId) || pluginStateImages.has(`${pluginActionId}:${stateIndex}`))
  );
  const iconSrc = liveImageActive ? liveKey.icon : key.icon || liveKey.icon || autoIcon;
  const disabledAttr = liveImageActive ? 'disabled' : '';
  const backgroundControl =
    action.type === 'indicator'
      ? ''
      : `<div class="field-inline-color">
        <span class="field-inline-label" id="insp-color-label">Background</span>
        <input class="color-input" id="insp-color" type="color" value="${esc(key.color || DEFAULT_KEY_COLOR)}" title="Key background" aria-labelledby="insp-color-label" />
        <button class="link-btn" id="insp-color-reset" ${isDefaultColor ? 'hidden' : ''} title="Reset background to default">Reset</button>
      </div>`;
  const iconField = `
    <div class="field insp-icon-field">
      <div class="field-head">
        <label>Icon</label>
        ${backgroundControl}
      </div>
      <div class="icon-row">
        <div class="icon-drop compact ${liveImageActive ? 'disabled' : ''}" id="insp-icon-drop"
             ${liveImageActive ? 'aria-disabled="true"' : ''}>
          ${
            iconSrc
              ? `<img src="${esc(iconSrc)}" alt="" />`
              : `<div class="icon-plus icon-none" title="No icon">${NO_ICON_GLYPH}</div>`
          }
          <div class="meta">
            <div class="file-name">${
              liveImageActive
                ? 'Live image from plugin'
                : key.icon
                  ? 'Custom'
                  : liveKey.icon
                    ? 'Live image'
                    : autoIcon
                      ? 'Action icon'
                      : 'No icon'
            }</div>
            <div>${liveImageActive ? 'The plugin controls this image' : 'Drop or click to change'}</div>
          </div>
        </div>
        <div class="icon-buttons">
          <button class="btn small" id="insp-icon-library" ${disabledAttr}>Library</button>
          <button class="btn small" id="insp-icon-file" title="Choose an image file" ${disabledAttr}>File</button>
          ${action.type === 'app' && action.value ? `<button class="btn small" id="insp-use-app-icon" ${disabledAttr}>App icon</button>` : ''}
          ${action.type === 'url' ? `<button class="btn small" id="insp-use-favicon" ${disabledAttr}>Favicon</button>` : ''}
          ${key.icon ? `<button class="btn small danger" id="insp-icon-remove" ${disabledAttr}>Remove</button>` : ''}
        </div>
      </div>
      ${
        liveImageActive
          ? '<div class="field-hint">This plugin draws the key image. A custom icon is kept but hidden while the plugin is active.</div>'
          : ''
      }
    </div>`;
  const textStyle = key.textStyle && typeof key.textStyle === 'object' ? key.textStyle : {};
  const textWeight = DeckTextStyle.weightPreset(textStyle.weight ?? 700);
  const textField = `
    <div class="field">
      <div class="field-head">
        <label for="insp-emoji">Key text</label>
        ${backgroundControl}
      </div>
      <input class="input" id="insp-emoji" maxlength="12" value="${esc(key.emoji)}" placeholder="Text or emoji" />
      <div class="field-hint">Shrinks to fit · 12 characters max</div>
      ${liveKey.liveImage ? `<div class="field-hint">${key.action?.type === 'command' ? 'This command draws the key image; key text is hidden while it is active.' : 'This plugin draws the key image; key text is hidden while it is active.'}</div>` : ''}
      <div class="font-row text-style" style="margin-top:8px">
        <select class="select" id="insp-text-family" title="Font">
          ${DeckTextStyle.FAMILY_IDS.map((id) => `<option value="${id}" ${(textStyle.family || 'system') === id ? 'selected' : ''}>${DeckTextStyle.FAMILY_LABELS[id]}</option>`).join('')}
        </select>
        <select class="select" id="insp-text-weight" title="Weight">
          ${['light', 'regular', 'bold'].map((preset) => `<option value="${preset}" ${textWeight === preset ? 'selected' : ''}>${preset[0].toUpperCase()}${preset.slice(1)}</option>`).join('')}
        </select>
        <input class="color-input" id="insp-text-color" type="color" value="${esc(textStyle.color || '#ffffff')}" title="Key text colour" />
      </div>
      <div class="style-reset">
        <button class="link-btn" id="insp-text-reset" type="button">Reset style</button>
      </div>
    </div>`;

  const tileField = `
    <div class="field">
      <div class="field-head">
        <label for="insp-tile-title">Tile</label>
        ${backgroundControl}
      </div>
      <div class="tile-colors">
        <label class="tile-color" for="insp-tile-accent">
          <input class="color-input" id="insp-tile-accent" type="color" value="${esc(key.tile?.accent || '#4f8cff')}" title="Accent bar colour" />
          Accent bar
        </label>
        <label class="tile-color" for="insp-tile-glyph-color">
          <input class="color-input" id="insp-tile-glyph-color" type="color" value="${esc(key.tile?.glyphColor || '#f4f7ff')}" title="Glyph colour" />
          Glyph colour
        </label>
      </div>
      <div class="row">
        <input class="input" id="insp-tile-glyph" maxlength="40" value="${esc(key.tile?.glyph || (key.icon ? '' : key.emoji))}" placeholder="Glyph" />
        <input class="input tile-size" id="insp-tile-glyph-size" type="number" min="8" max="80" value="${key.tile?.glyphSize || ''}" placeholder="Size" title="Glyph size (blank = auto)" />
      </div>
      <div class="row" style="margin-top:8px">
        <input class="input" id="insp-tile-title" maxlength="80" value="${esc(key.tile?.title || key.label)}" placeholder="Title" />
        <input class="input tile-size" id="insp-tile-title-size" type="number" min="7" max="48" value="${key.tile?.titleSize || ''}" placeholder="Size" title="Title size (blank = auto)" />
      </div>
      <div class="row" style="margin-top:6px">
        <input class="input" id="insp-tile-subtitle" maxlength="80" value="${esc(key.tile?.subtitle || '')}" placeholder="Subtitle" />
        <input class="input tile-size" id="insp-tile-subtitle-size" type="number" min="6" max="40" value="${key.tile?.subtitleSize || ''}" placeholder="Size" title="Subtitle size (blank = auto)" />
      </div>
      <div class="field-hint">A native tile: accent bar, glyph, title and subtitle. Text is stored in config.json, not as an image. Leave a size blank for automatic sizing, and leave the glyph empty to show the key's image from the Icon tab instead.</div>
      <div class="style-reset">
        <button class="link-btn" id="insp-tile-glyph-color-reset" type="button" ${key.tile?.glyphColor ? '' : 'hidden'}>Reset glyph colour</button>
      </div>
    </div>`;

  el.innerHTML = `
    <div class="insp-head">
      <h2>${state.selected === WIDE_KEY_INDEX ? 'Wide key' : `Key ${state.selected + 1}`}</h2>
      <span class="index">${state.selected === WIDE_KEY_INDEX ? 'row 3 · col 4–5 (2×1)' : `row ${Math.floor(state.selected / COLS) + 1} · col ${(state.selected % COLS) + 1}`}</span>
      <button class="icon-btn drawer-close" id="insp-drawer-close" title="Close">×</button>
    </div>

    <div class="insp-actions">
      <button class="btn" id="insp-duplicate">Duplicate</button>
      ${pinned
        ? '<button class="btn" id="insp-unpin">Unpin</button>'
        : '<button class="btn" id="insp-pin">Pin to all pages</button>'}
      <button class="btn danger" id="insp-clear-key">Clear key</button>
    </div>

    ${
      pinned
        ? `<div class="pinned-banner"><span>Pinned — shown on every page</span></div>`
        : ''
    }

    <div class="insp-separator"></div>

    <div class="field">
      <label>Action</label>
      <select class="select" id="insp-action-type">
        ${actionGroups(action.type)}
      </select>
    </div>

    ${valueField && action.type !== 'plugin' ? `<div class="field"><label>${VALUE_LABELS[action.type] || 'Value'}</label>${valueField}</div>` : ''}
    ${pluginFields}

    ${
      action.type === 'indicator'
        ? ''
        : `<details class="trigger-section" id="trigger-section" ${triggersOpen ? 'open' : ''}>
      <summary>
        <span>Press triggers</span>
        ${
          triggersActive
            ? `<span class="trigger-badges">${hasHold ? '<span>Hold</span>' : ''}${hasDouble ? '<span>2×</span>' : ''}</span>`
            : ''
        }
      </summary>
      <div class="trigger-body">
        ${triggerField(key, 'holdAction', 'On hold', page, !triggersEnabled)}
        ${hasHold ? `<div class="field"><label>Hold time (ms)</label><input class="input" id="insp-hold-ms" type="number" min="150" max="2000" step="50" value="${Number(key.holdMs) || 500}" /></div>` : ''}
        ${triggerField(key, 'doubleAction', 'On double press', page, !triggersEnabled)}
        ${
          triggersEnabled
            ? `<div class="field-hint">
                ${hasHold ? `Hold for ${Number(key.holdMs) || 500} ms. ` : ''}
                ${hasDouble ? 'Double-press within 300 ms. ' : ''}
                ${action.type === 'none' ? 'The tap action is empty; only hold/double triggers run.' : 'A tap still runs the action above.'}
              </div>`
            : '<div class="field-hint trigger-disabled">Choose an action above to set press triggers.</div>'
        }
      </div>
    </details>`
    }

    <div class="insp-section">Appearance</div>
    ${
      action.type === 'indicator'
        ? '<div class="field-hint">The page indicator draws the current page number and dots. Icon/text settings are ignored.</div>'
        : `<div class="face-tabs" role="tablist" aria-label="Key face">
      <button class="tab ${face === 'icon' ? 'active' : ''}" data-key-face="icon" role="tab" aria-selected="${face === 'icon' ? 'true' : 'false'}">Icon</button>
      <button class="tab ${face === 'text' ? 'active' : ''}" data-key-face="text" role="tab" aria-selected="${face === 'text' ? 'true' : 'false'}">Text</button>
      <button class="tab ${face === 'tile' ? 'active' : ''}" data-key-face="tile" role="tab" aria-selected="${face === 'tile' ? 'true' : 'false'}">Tile</button>
    </div>
    ${face === 'icon' ? iconField : face === 'text' ? textField : tileField}`
    }
    ${
      action.type === 'indicator'
        ? ''
        : `<div class="field">
      <label for="insp-label">Caption</label>
      <label class="check-row caption-toggle"><input type="checkbox" id="insp-font-show" ${captionVisible ? 'checked' : ''} /> Show caption</label>
      ${liveKey.liveImage && !key.font?.captionExplicit ? '<div class="field-hint">This plugin draws its own label. Turn on Show caption to add one over it.</div>' : ''}
      <input class="input" id="insp-label" maxlength="40" value="${esc(key.label)}" placeholder="Optional small text under the key" ${captionVisible ? '' : 'disabled'} />
      <div class="font-row text-style" style="margin-top:8px">
        <select class="select" id="insp-font-family" title="Font" ${captionVisible ? '' : 'disabled'}>
          ${DeckTextStyle.FAMILY_IDS.map((id) => `<option value="${id}" ${(key.font?.family || 'system') === id ? 'selected' : ''}>${DeckTextStyle.FAMILY_LABELS[id]}</option>`).join('')}
        </select>
        <select class="select" id="insp-font-weight" title="Weight" ${captionVisible ? '' : 'disabled'}>
          ${['light', 'regular', 'bold'].map((preset) => {
            const selected = DeckTextStyle.weightPreset(key.font?.weight) === preset;
            return `<option value="${preset}" ${selected ? 'selected' : ''}>${preset[0].toUpperCase()}${preset.slice(1)}</option>`;
          }).join('')}
        </select>
        <input class="color-input" id="insp-font-color" type="color" value="${esc(key.font?.color || '#ffffff')}" title="Caption colour" ${captionVisible ? '' : 'disabled'} />
      </div>
      <div class="font-row caption-extra" style="margin-top:6px">
        <input class="input" id="insp-font-size" type="number" min="10" max="40" step="1" value="${Number(key.font?.size) || 17}" title="Size" ${captionVisible ? '' : 'disabled'} />
        <select class="select" id="insp-font-align" title="Alignment" ${captionVisible ? '' : 'disabled'}>
          ${['left', 'center', 'right'].map((a) => `<option value="${a}" ${(key.font?.align || 'left') === a ? 'selected' : ''}>${a[0].toUpperCase()}${a.slice(1)}</option>`).join('')}
        </select>
        <select class="select" id="insp-font-background" title="Caption background" ${captionVisible ? '' : 'disabled'}>
          ${['gradient', 'solid', 'none'].map((background) => `<option value="${background}" ${(key.font?.background || 'gradient') === background ? 'selected' : ''}>${background[0].toUpperCase()}${background.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div class="style-reset">
        <button class="link-btn" id="insp-font-reset" type="button" ${captionVisible ? '' : 'disabled'}>Reset style</button>
      </div>
    </div>`
    }


  `;

  // appearance tabs: a key shows either an image, its text, or a native tile
  el.querySelectorAll('[data-key-face]').forEach((btn) => {
    btn.addEventListener('click', () => {
      key.face = btn.dataset.keyFace;
      drawIndex(state.selected);
      commit();
      renderInspector();
    });
  });

  const updateTile = (field, value) => {
    key.face = 'tile';
    key.tile = { ...(key.tile || {}), [field]: value };
    drawIndex(state.selected);
    commit(false);
  };
  const updateTileSize = (field, raw) => {
    const value = Math.round(Number(raw) || 0);
    key.face = 'tile';
    key.tile = { ...(key.tile || {}) };
    if (value) key.tile[field] = value;
    else delete key.tile[field];
    drawIndex(state.selected);
    commit(false);
  };
  const tileAccent = $('#insp-tile-accent');
  if (tileAccent) tileAccent.addEventListener('input', (e) => updateTile('accent', e.target.value));
  const tileGlyph = $('#insp-tile-glyph');
  if (tileGlyph) tileGlyph.addEventListener('input', (e) => updateTile('glyph', e.target.value));
  const tileGlyphColor = $('#insp-tile-glyph-color');
  if (tileGlyphColor) {
    tileGlyphColor.addEventListener('input', (e) => {
      updateTile('glyphColor', e.target.value);
      $('#insp-tile-glyph-color-reset')?.removeAttribute('hidden');
    });
  }
  $('#insp-tile-glyph-color-reset')?.addEventListener('click', () => {
    key.tile = { ...(key.tile || {}) };
    delete key.tile.glyphColor;
    drawIndex(state.selected);
    commit(false);
    renderInspector();
  });
  const tileTitle = $('#insp-tile-title');
  if (tileTitle) tileTitle.addEventListener('input', (e) => updateTile('title', e.target.value));
  const tileSubtitle = $('#insp-tile-subtitle');
  if (tileSubtitle) tileSubtitle.addEventListener('input', (e) => updateTile('subtitle', e.target.value));
  const tileGlyphSize = $('#insp-tile-glyph-size');
  if (tileGlyphSize) tileGlyphSize.addEventListener('input', (e) => updateTileSize('glyphSize', e.target.value));
  const tileTitleSize = $('#insp-tile-title-size');
  if (tileTitleSize) tileTitleSize.addEventListener('input', (e) => updateTileSize('titleSize', e.target.value));
  const tileSubtitleSize = $('#insp-tile-subtitle-size');
  if (tileSubtitleSize) tileSubtitleSize.addEventListener('input', (e) => updateTileSize('subtitleSize', e.target.value));

  // icon drop / choose
  const applyIcon = (dataUrl, source) => {
    key.icon = dataUrl;
    key.iconSource = source;
    key.face = 'icon';
    delete key.iconCleared;
    drawIndex(state.selected);
    commit();
    renderInspector();
  };
  const chooseIconFile = async () => {
    const picked = await pickImageData();
    if (!picked) return;
    applyIcon(await downscaleImage(picked), 'custom');
  };
  const drop = $('#insp-icon-drop');
  if (drop && !liveImageActive) {
    drop.addEventListener('click', chooseIconFile);
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('drag');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', async (e) => {
      e.preventDefault();
      drop.classList.remove('drag');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file || !file.type.startsWith('image/')) return toast('Drop an image file', true);
      applyIcon(await downscaleImage(await readFileAsDataUrl(file)), 'custom');
    });
  }

  const hotkeyOpen = $('#insp-hotkey-open');
  if (hotkeyOpen) {
    hotkeyOpen.addEventListener('click', () => openHotkeyModal(key));
  }
  const hotkeyTest = $('#insp-hotkey-test');
  if (hotkeyTest) {
    hotkeyTest.addEventListener('click', async () => {
      const res = await api.runAction(key.action);
      toast(res.ok ? 'Shortcut sent' : res.error || 'Hotkey failed', !res.ok);
    });
  }
  const hotkeyClear = $('#insp-hotkey-clear');
  if (hotkeyClear) {
    hotkeyClear.addEventListener('click', () => {
      key.action = { ...key.action, value: '' };
      commit();
      renderInspector();
    });
  }

  const iconFileBtn = $('#insp-icon-file');
  if (iconFileBtn) iconFileBtn.addEventListener('click', chooseIconFile);

  const libraryBtn = $('#insp-icon-library');
  if (libraryBtn) {
    libraryBtn.addEventListener('click', () => openIconLibrary((src) => setKeyIconFromLibrary(src)));
  }

  const useAppIcon = $('#insp-use-app-icon');
  if (useAppIcon) {
    useAppIcon.addEventListener('click', async () => {
      const icon = await api.appIcon(String(key.action.value || ''));
      if (!icon) return toast('No app icon found', true);
      key.icon = icon;
      key.iconSource = 'app';
      key.face = 'icon';
      delete key.iconCleared;
      drawIndex(state.selected);
      commit();
      renderInspector();
      toast('App icon applied');
    });
  }

  const removeImage = $('#insp-icon-remove');
  if (removeImage) {
    removeImage.addEventListener('click', () => {
      key.icon = null;
      delete key.iconSource;
      key.iconCleared = true;
      key.face = 'icon';
      drawIndex(state.selected);
      commit();
      renderInspector();
    });
  }

  $('#insp-emoji')?.addEventListener('input', (e) => {
    key.emoji = e.target.value;
    delete key.emojiAuto;
    drawIndex(state.selected);
    commit(false);
  });
  const updateTextStyle = (patch) => {
    key.textStyle = {
      family: 'system',
      weight: 700,
      color: '#ffffff',
      ...(key.textStyle || {}),
      ...patch,
    };
    drawIndex(state.selected);
    commit(false);
  };
  $('#insp-text-family')?.addEventListener('change', (e) => updateTextStyle({ family: e.target.value }));
  $('#insp-text-weight')?.addEventListener('change', (e) =>
    updateTextStyle({ weight: DeckTextStyle.weightValue(e.target.value) })
  );
  $('#insp-text-color')?.addEventListener('input', (e) => updateTextStyle({ color: e.target.value }));
  $('#insp-text-reset')?.addEventListener('click', () => {
    updateTextStyle({ family: 'system', weight: 700, color: '#ffffff' });
    renderInspector();
  });
  const colorReset = $('#insp-color-reset');
  colorReset?.addEventListener('click', () => {
    key.color = DEFAULT_KEY_COLOR;
    const input = $('#insp-color');
    if (input) input.value = DEFAULT_KEY_COLOR;
    if (colorReset) colorReset.hidden = true;
    drawIndex(state.selected);
    commit();
  });
  $('#insp-color')?.addEventListener('input', (e) => {
    key.color = e.target.value;
    if (colorReset) colorReset.hidden = String(e.target.value).toLowerCase() === DEFAULT_KEY_COLOR;
    drawIndex(state.selected);
    commit(false);
  });
  $('#insp-label')?.addEventListener('input', (e) => {
    key.label = e.target.value;
    delete key.labelAuto;
    drawIndex(state.selected);
    commit(false);
  });
  const updateFont = (patch) => {
    key.font = {
      size: 17,
      weight: 400,
      align: 'left',
      color: '#ffffff',
      showLabel: true,
      family: 'system',
      background: 'gradient',
      ...(key.font || {}),
      ...patch,
    };
    drawIndex(state.selected);
    commit(false);
  };
  $('#insp-font-size')?.addEventListener('change', (e) => {
    const size = Math.max(10, Math.min(40, Math.round(Number(e.target.value) || 17)));
    e.target.value = String(size);
    updateFont({ size });
  });
  $('#insp-font-weight')?.addEventListener('change', (e) =>
    updateFont({ weight: DeckTextStyle.weightValue(e.target.value) })
  );
  $('#insp-font-align')?.addEventListener('change', (e) => updateFont({ align: e.target.value }));
  $('#insp-font-color')?.addEventListener('input', (e) => updateFont({ color: e.target.value }));
  $('#insp-font-family')?.addEventListener('change', (e) => updateFont({ family: e.target.value }));
  $('#insp-font-background')?.addEventListener('change', (e) => updateFont({ background: e.target.value }));
  $('#insp-font-reset')?.addEventListener('click', () => {
    updateFont({
      size: 17,
      weight: 400,
      align: 'left',
      color: '#ffffff',
      family: 'system',
      background: 'gradient',
    });
    renderInspector();
  });
  $('#insp-font-show')?.addEventListener('change', (e) => {
    updateFont({ showLabel: e.target.checked, captionExplicit: e.target.checked });
    [
      '#insp-label',
      '#insp-font-size',
      '#insp-font-weight',
      '#insp-font-align',
      '#insp-font-color',
      '#insp-font-family',
      '#insp-font-background',
      '#insp-font-reset',
    ].forEach((sel) => {
      const el = $(sel);
      if (el) el.disabled = !e.target.checked;
    });
  });
  $('#insp-action-type').addEventListener('change', (e) => {
    const type = e.target.value;
    if (type === 'app' || type === 'url' || type === 'text' || type === 'close') {
      key.action = { type, value: '' };
      syncActionMeta(key);
      commit();
      renderInspector();
      return;
    }
    if (type === 'media') {
      key.action = { type: 'media', op: 'playpause' };
      syncActionMeta(key);
    } else if (type === 'timer') {
      key.action = { type: 'timer', seconds: 300, sound: true };
      syncActionMeta(key);
    } else if (type === 'pop') {
      key.action = { type: 'pop', steps: [] };
      syncActionMeta(key);
    } else if (type === 'brightness') {
      key.action = { type: 'brightness', op: 'up', step: 5 };
      syncActionMeta(key);
    } else if (type === 'plugin') {
      // Start blank so the user chooses the plugin deliberately.
      key.action = {
        type: 'plugin',
        sdk: 'streamdeck',
        plugin: '',
        action: '',
        actionid: uuid(),
        settings: {},
      };
      key.emoji = '';
      key.label = '';
      delete key.emojiAuto;
      delete key.labelAuto;
    } else {
      let value = '';
      if (type === 'page') {
        value = pagesFor(page.profileId).find((p) => p.id !== page.id)?.id || page.id;
        key.action = { type, op: 'goto', value };
      } else {
        key.action = { type, value };
      }
      syncActionMeta(key);
    }
    commit();
    renderInspector();
  });

  if (action.type === 'plugin' && $('#pi-host')) {
    const host = $('#pi-host');
    const slot = keyIndexToSlot(state.selected);
    // The host can only hand out the inspector's connection details once it
    // knows the action. A freshly chosen plugin action is synced on a timer,
    // so sync it now — otherwise the iframe loads with no connection info and
    // the inspector never talks to the app.
    Promise.resolve(syncPlugins())
      .catch(() => {})
      .then(() =>
        api.pluginInspectorUrl({
          sdk: action.sdk || 'ulanzi',
          plugin: action.plugin,
          action: action.action,
          actionid: action.actionid,
          key: slot,
        })
      )
      .then((url) => {
        if (!host.isConnected) return;
        if (!url) {
          host.innerHTML = '<div class="insp-empty" style="padding:0">No property inspector for this action.</div>';
          return;
        }
        host.innerHTML = `<iframe class="pi-frame" data-actionid="${esc(action.actionid)}" src="${esc(url)}" sandbox="allow-scripts allow-forms allow-modals allow-same-origin"></iframe>`;
        // Keep the 120px placeholder instead of collapsing the panel. If the
        // inspector never reports, offer a retry rather than leaving a blank.
        setTimeout(() => {
          const frame = host.querySelector('.pi-frame');
          if (!frame || frame.dataset.sized || !host.isConnected) return;
          const note = document.createElement('div');
          note.className = 'field-hint pi-error';
          note.textContent = 'Plugin settings didn’t load. ';
          const retry = document.createElement('button');
          retry.className = 'link-btn';
          retry.type = 'button';
          retry.textContent = 'Retry';
          retry.addEventListener('click', () => {
            note.remove();
            frame.setAttribute('src', frame.getAttribute('src') || '');
          });
          note.appendChild(retry);
          host.after(note);
        }, 5000);
      })
      .catch(() => {
        if (host.isConnected) host.innerHTML = '<div class="insp-empty" style="padding:0">Could not load the property inspector.</div>';
      });
  }

  const timerSeconds = $('#insp-timer-seconds');
  if (timerSeconds) {
    timerSeconds.addEventListener('change', () => {
      const seconds = Math.max(1, Math.min(86_400, Math.round(Number(timerSeconds.value) || 300)));
      timerSeconds.value = String(seconds);
      key.action = { ...key.action, seconds };
      commit(false);
    });
  }
  const timerSound = $('#insp-timer-sound');
  if (timerSound) {
    timerSound.addEventListener('change', () => {
      key.action = { ...key.action, sound: timerSound.checked };
      commit(false);
    });
  }
  const brightnessOp = $('#insp-brightness-op');
  if (brightnessOp) {
    brightnessOp.addEventListener('change', () => {
      key.action = { ...key.action, op: brightnessOp.value };
      syncActionMeta(key);
      commit();
      renderInspector();
    });
  }
  const brightnessStep = $('#insp-brightness-step');
  if (brightnessStep) {
    brightnessStep.addEventListener('change', () => {
      const step = Math.max(1, Math.min(50, Math.round(Number(brightnessStep.value) || 5)));
      brightnessStep.value = String(step);
      key.action = { ...key.action, step };
      commit(false);
    });
  }

  const soundOp = $('#insp-sound-op');
  if (soundOp) {
    soundOp.addEventListener('change', () => {
      key.action = { ...key.action, op: soundOp.value };
      commit();
      renderInspector();
    });
  }
  const pickAudio = $('#insp-pick-audio');
  if (pickAudio) {
    pickAudio.addEventListener('click', async () => {
      const file = await api.pickAudio();
      if (!file) return;
      key.action = { ...key.action, value: file };
      commit();
      renderInspector();
    });
  }

  const pageOp = $('#insp-page-op');
  if (pageOp) {
    pageOp.addEventListener('change', () => {
      const op = pageOp.value;
      if (op === 'profile') {
        key.action = {
          type: 'page',
          op: 'profile',
          value: (state.config.profiles || [])[0]?.id || '',
        };
        syncActionMeta(key);
        commit();
        renderInspector();
        return;
      }
      if (op === 'goto') {
        key.action = {
          type: 'page',
          op: 'goto',
          value: pagesFor(page.profileId).find((p) => p.id !== key.action.value)?.id || page.id,
        };
      } else {
        key.action = { type: 'page', op };
      }
      syncActionMeta(key);
      commit();
      renderInspector();
    });
  }

  if (action.type === 'plugin') {
    const pluginSel = $('#insp-plugin');
    if (pluginSel) {
      pluginSel.addEventListener('change', (e) => {
        const p = state.plugins.find((x) => x.uuid === e.target.value);
        if (!p) return;
        const a = p.actions[0];
        key.action = {
          type: 'plugin',
          sdk: p.sdk || 'ulanzi',
          plugin: p.uuid,
          action: a?.uuid || '',
          actionid: uuid(),
          settings: {},
        };
        commit(false);
        renderInspector();
      });
    }
    $('#insp-plugin-store')?.addEventListener('click', () => openStoreModal('sd-plugins'));
    $('#insp-plugin-clear')?.addEventListener('click', () => {
      key.action = { type: 'none' };
      commit();
      renderInspector();
      toast('Action cleared — the key face is kept');
    });
    const actionSel = $('#insp-plugin-action');
    if (actionSel) {
      actionSel.addEventListener('change', (e) => {
        key.action = { ...key.action, action: e.target.value, actionid: uuid(), settings: {} };
        commit(false);
        renderInspector();
      });
    }
    const settingsEl = $('#insp-plugin-settings');
    if (settingsEl) {
      settingsEl.addEventListener('change', (e) => {
        try {
          const parsed = JSON.parse(e.target.value || '{}');
          key.action = { ...key.action, settings: parsed };
          commit(false);
        } catch {
          toast('Invalid JSON in plugin settings', true);
        }
      });
    }
  }

  const valueEl = $('#insp-value');
  if (valueEl) {
    const applyValue = (raw) => {
      if (key.action.type === 'media') {
        key.action = { ...key.action, op: raw };
      } else {
        const next = { ...key.action, value: raw };
        // Editing the command counts as reviewing it: drop the import warning.
        if (next.type === 'command') delete next.imported;
        key.action = next;
      }
      syncActionMeta(key);
      drawIndex(state.selected);
      commit(false);
    };
    valueEl.addEventListener('input', (e) => applyValue(e.target.value));
    valueEl.addEventListener('change', (e) => {
      applyValue(e.target.value);
      if (key.action.type === 'url' && !key.icon) loadSiteIcon(key);
    });
  }

  const commandOutput = $('#insp-command-output');
  if (commandOutput) {
    commandOutput.addEventListener('change', (e) => {
      const next = { ...key.action, showOutput: e.target.checked };
      if (!e.target.checked) delete next.showOutput;
      key.action = next;
      commit(false);
      renderInspector();
      syncCommandOutputs();
    });
  }
  const commandInterval = $('#insp-command-interval');
  if (commandInterval) {
    commandInterval.addEventListener('change', (e) => {
      const value = Math.min(86_400, Math.max(5, Math.round(Number(e.target.value) || 30)));
      e.target.value = String(value);
      key.action = { ...key.action, outputInterval: value };
      commit(false);
      syncCommandOutputs();
    });
  }

  const pickApp = $('#insp-pick-app');
  if (pickApp) {
    pickApp.addEventListener('click', () => openAppPicker());
  }

  const fetchIcon = $('#insp-fetch-icon');
  if (fetchIcon) {
    fetchIcon.addEventListener('click', async () => {
      const url = String(key.action.value || '').trim();
      if (!url) return toast('Enter a URL first', true);
      fetchIcon.disabled = true;
      fetchIcon.textContent = 'Loading…';
      const ok = await loadSiteIcon(key, true);
      fetchIcon.disabled = false;
      fetchIcon.textContent = 'Favicon';
      if (!ok) return;
      renderInspector();
    });
  }

  const useFavicon = $('#insp-use-favicon');
  if (useFavicon) {
    useFavicon.addEventListener('click', async () => {
      if (!String(key.action.value || '').trim()) return toast('Enter a URL first', true);
      useFavicon.disabled = true;
      useFavicon.textContent = 'Loading…';
      const ok = await loadSiteIcon(key, true);
      useFavicon.disabled = false;
      useFavicon.textContent = 'Favicon';
      if (ok) renderInspector();
    });
  }

  // Fill in a real app icon for "Open app" keys that do not have one yet.
  if (action.type === 'app' && action.value && !key.icon && !key.iconCleared) {
    const selected = state.selected;
    const actionId = action.actionid || null;
    api.appIcon(String(action.value)).then((icon) => {
      if (!icon) return;
      const current = state.selected === selected ? activePage().keys[selected] : null;
      if (!current || current.icon) return;
      if ((current.action.actionid || null) !== actionId) return;
      current.icon = icon;
      current.iconSource = 'app';
      drawIndex(selected);
      commit(false);
      renderInspector();
    });
  }

  if (action.type === 'multi' || action.type === 'toggle' || action.type === 'pop') bindMultiEditor(key);
  bindTriggerFields(key);

  $('#insp-duplicate').addEventListener('click', () => {
    const target = nextFreeIndex(page);
    if (target < 0) return toast('No free key slots', true);
    const copy = JSON.parse(JSON.stringify(key));
    // Two keys must never share one plugin action instance.
    if (copy.action && copy.action.type === 'plugin') copy.action.actionid = uuid();
    if (copy.holdAction && copy.holdAction.type === 'plugin') copy.holdAction.actionid = uuid();
    if (copy.doubleAction && copy.doubleAction.type === 'plugin') copy.doubleAction.actionid = uuid();
    page.keys[target] = copy;
    state.selected = target;
    commit();
    renderGrid();
    renderInspector();
  });

  $('#insp-clear-key').addEventListener('click', () => {
    if (pinned) return toast('This key is pinned — unpin it first', true);
    delete page.keys[state.selected];
    commit();
    renderGrid();
    renderInspector();
  });

  const pinBtn = $('#insp-pin');
  if (pinBtn) {
    pinBtn.addEventListener('click', () => {
      const index = state.selected;
      const source = page.keys[index];
      if (!source) return;
      const profile = state.config.profiles.find((p) => p.id === page.profileId);
      if (!profile) return;
      profile.pinned = profile.pinned || {};
      profile.pinned[index] = source;
      delete page.keys[index];
      commit();
      renderGrid();
      renderInspector();
      toast('Pinned on all pages');
    });
  }
  const unpinBtn = $('#insp-unpin');
  if (unpinBtn) {
    unpinBtn.addEventListener('click', () => {
      const index = state.selected;
      const profile = state.config.profiles.find((p) => p.id === page.profileId);
      const pin = profile?.pinned?.[index];
      if (!pin) return;
      page.keys[index] = pin;
      delete profile.pinned[index];
      if (!Object.keys(profile.pinned).length) delete profile.pinned;
      commit();
      renderGrid();
      renderInspector();
      toast('Unpinned — kept on this page');
    });
  }
}

function nextFreeIndex(page) {
  for (let i = 0; i < WIDE_KEY_INDEX; i++) {
    const k = page.keys[i];
    if (!k || (!k.label && !k.emoji && !k.icon && (!k.action || k.action.type === 'none'))) return i;
  }
  return -1;
}

