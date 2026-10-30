'use strict';

// --------------------------------------------------------------- inspector

const TRIGGER_TYPES = [
  ['none', 'Nothing'],
  ['hotkey', 'Send hotkey'],
  ['media', 'Media key'],
  ['text', 'Type text'],
  ['app', 'Open app'],
  ['url', 'Open URL'],
  ['command', 'Shell command'],
  ['page', 'Switch to page'],
];

const MEDIA_LABELS = {
  playpause: 'Play / pause',
  next: 'Next track',
  prev: 'Previous track',
  volumeup: 'Volume up',
  volumedown: 'Volume down',
  mute: 'Mute',
};

function basename(target) {
  const value = String(target || '').trim();
  if (!value) return '';
  const name = value.split('/').filter(Boolean).pop() || value;
  return name.replace(/\.app$/i, '');
}

function pageName(id) {
  return state.config.pages.find((p) => p.id === id)?.name || 'Page';
}

/** Emoji/caption the app suggests for an action (only applied to untouched keys). */
function actionMeta(action) {
  if (!action) return {};
  switch (action.type) {
    case 'media':
      return { emoji: MEDIA_EMOJI[action.op], label: MEDIA_LABELS[action.op] };
    case 'text':
      return { emoji: '⌨️', label: 'Type text' };
    case 'hotkey':
      return { emoji: '⌨️', label: action.value || 'Hotkey' };
    case 'close':
      return { emoji: '✖️', label: action.value ? `Quit ${basename(action.value)}` : 'Close app' };
    case 'command':
      return { emoji: '💻', label: 'Command' };
    case 'app':
      return { label: basename(action.value) };
    case 'url':
      return { label: action.value ? action.value.replace(/^https?:\/\//i, '').replace(/\/$/, '') : 'URL' };
    case 'page':
      if (action.op === 'next') return { emoji: '➡️', label: 'Next page' };
      if (action.op === 'prev') return { emoji: '⬅️', label: 'Previous page' };
      return { emoji: '📄', label: action.value ? pageName(action.value) : 'Page' };
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
  const emojiIsAuto = !key.emoji || key.emoji === key.emojiAuto;
  const labelIsAuto = !key.label || key.label === key.labelAuto;
  if (meta.emoji && emojiIsAuto) {
    key.emoji = meta.emoji;
    key.emojiAuto = meta.emoji;
  }
  if (meta.label && labelIsAuto) {
    key.label = meta.label;
    key.labelAuto = meta.label;
  }
}

function triggerField(key, field, label, page) {
  const action = key[field] || { type: 'none' };
  const pageOptions = state.config.pages
    .map(
      (p) =>
        `<option value="${esc(p.id)}" ${p.id === action.value ? 'selected' : ''}>${esc(p.name)}</option>`
    )
    .join('');
  let control = '';
  if (action.type === 'hotkey') {
    control = `<button class="btn hotkey-value" data-trigger-hotkey="${field}">${esc(
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
    control = `<select class="select" data-trigger-value="${field}">${ops
      .map(([v, l]) => `<option value="${v}" ${v === action.op ? 'selected' : ''}>${l}</option>`)
      .join('')}</select>`;
  } else if (action.type === 'page') {
    control = `<select class="select" data-trigger-value="${field}">${pageOptions}</select>`;
  } else if (action.type !== 'none') {
    control = `<input class="input" data-trigger-value="${field}" value="${esc(
      action.value || ''
    )}" placeholder="${action.type === 'app' ? 'Safari' : action.type === 'url' ? 'https://…' : ''}" />`;
  }
  return `<div class="field trigger-field">
    <label>${label}</label>
    <select class="select" data-trigger-type="${field}">
      ${TRIGGER_TYPES.map(
        ([v, l]) => `<option value="${v}" ${v === action.type ? 'selected' : ''}>${l}</option>`
      ).join('')}
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
      else key[field] = { type, value: '' };
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
}

function renderInspector() {
  const el = $('#inspector');
  const page = activePage();
  if (state.selected === WIDE_KEY_INDEX) state.selected = null;

  if (state.selected === null) {
    const configured = Object.entries(page.keys).filter(
      ([index, k]) => Number(index) !== WIDE_KEY_INDEX && k &&
        (k.label || k.emoji || k.icon || (k.action && k.action.type !== 'none'))
    ).length;
    el.innerHTML = `
      <div class="insp-head"><h2>Page settings</h2><span class="index">${configured}/${KEY_COUNT - 1} keys</span></div>
      <div class="field">
        <label>Page name</label>
        <input class="input" id="insp-page-name" value="${esc(page.name)}" maxlength="40" />
      </div>
      <div class="field">
        <label>Screen sleep (seconds, 0 = never)</label>
        <div class="row">
          <input class="input" id="insp-sleep" type="number" min="0" step="5" value="${esc(state.config.settings.sleepSeconds)}" />
          <button class="btn" id="insp-sleep-apply">Apply</button>
        </div>
      </div>
      <div class="settings-block">
        <h3>Device</h3>
        <div class="insp-empty" style="padding:0">
          ${state.status.connected
            ? `Firmware <b>${esc(state.status.info?.Dversion || '—')}</b><br/>Serial <b>${esc(state.status.info?.SerialNumber || state.status.info?.serial || '—')}</b>`
            : 'Connect a D200 and quit Ulanzi Studio to take exclusive control.'}
        </div>
      </div>
      <div class="settings-block">
        <h3>Tips</h3>
        <div class="insp-empty" style="padding:0">
          Click a key to edit it. Drag a 196×196 image onto a key to use it as the icon.
          Labels are rendered into the image, so the deck shows exactly what you see here.
        </div>
      </div>
      <div class="insp-actions">
        <button class="btn danger" id="insp-clear-page">Clear page</button>
        <button class="btn" id="insp-add-page">New page</button>
      </div>
    `;

    $('#insp-page-name').addEventListener('input', (e) => {
      page.name = e.target.value;
      renderPageList();
      if (document.activeElement !== $('#page-title')) $('#page-title').value = page.name;
      scheduleSave();
    });
    $('#insp-sleep-apply').addEventListener('click', async () => {
      const seconds = Math.max(0, parseInt($('#insp-sleep').value || '0', 10));
      state.config.settings.sleepSeconds = seconds;
      scheduleSave();
      const res = await api.setSleepTime(seconds);
      toast(res.ok ? `Sleep set to ${seconds}s` : res.error, !res.ok);
    });
    $('#insp-clear-page').addEventListener('click', () => {
      if (!confirm(`Clear all keys on “${page.name}”?`)) return;
      page.keys = {};
      state.selected = null;
      renderAll();
      commit();
    });
    $('#insp-add-page').addEventListener('click', addPage);
    return;
  }

  const key = ensureKey(page, state.selected);
  const liveKey = effectiveKey(key);
  const action = key.action || { type: 'none', value: '' };
  const pageOptions = state.config.pages
    .map(
      (p) =>
        `<option value="${esc(p.id)}" ${p.id === action.value ? 'selected' : ''}>${esc(p.name)}${p.id === page.id ? ' (this page)' : ''}</option>`
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
      <button class="btn" id="insp-fetch-icon">Use icon</button>
    </div>`;
  } else if (action.type === 'command') {
    valueField = `<textarea class="textarea" id="insp-value" placeholder="osascript -e 'set volume output muted'">${esc(action.value)}</textarea>`;
  } else if (action.type === 'hotkey') {
    valueField = `<div class="row">
      <button class="btn hotkey-value" id="insp-hotkey-open">${esc(action.value || 'Set hotkey…')}</button>
      <button class="btn ghost" id="insp-hotkey-clear">Clear</button>
    </div>`;
  } else if (action.type === 'page') {
    const op = action.op || 'goto';
    const ops = [
      ['goto', 'Go to page'],
      ['next', 'Next page'],
      ['prev', 'Previous page'],
    ];
    valueField = `<div class="row">
      <select class="select" id="insp-page-op">${ops
        .map(([v, l]) => `<option value="${v}" ${v === op ? 'selected' : ''}>${l}</option>`)
        .join('')}</select>
      ${op === 'goto' ? `<select class="select" id="insp-value">${pageOptions}</select>` : ''}
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
  } else if (action.type === 'close') {
    valueField = `<div class="row">
      <input class="input" id="insp-value" placeholder="Safari" value="${esc(action.value || '')}" />
      <button class="btn" id="insp-pick-app">Choose…</button>
    </div>`;
  }

  let pluginFields = '';
  if (action.type === 'plugin') {
    const compatible = state.plugins.filter((p) => p.compatible);
    const plugin = compatible.find((p) => p.uuid === action.plugin) || null;
    const pluginActions = plugin ? plugin.actions : [];
    const pluginAction = pluginActions.find((a) => a.uuid === action.action) || null;
    if (!compatible.length) {
      pluginFields = `<div class="field"><div class="insp-empty" style="padding:0">
        No compatible JavaScript plugins found. Install Ulanzi plugins in
        <code>~/Library/Application Support/Ulanzi/UlanziDeck/Plugins</code> and restart.
      </div></div>`;
    } else {
      pluginFields = `
        <div class="field">
          <label>Plugin</label>
          <select class="select" id="insp-plugin">
            <option value="">Choose a plugin…</option>
            ${compatible
              .map(
                (p) =>
                  `<option value="${esc(p.uuid)}" ${p.uuid === action.plugin ? 'selected' : ''}>${esc(p.name)}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="field">
          <label>Action</label>
          <select class="select" id="insp-plugin-action" ${plugin ? '' : 'disabled'}>
            ${pluginActions
              .map(
                (a) =>
                  `<option value="${esc(a.uuid)}" ${a.uuid === action.action ? 'selected' : ''}>${esc(a.name)}</option>`
              )
              .join('')}
          </select>
        </div>
        ${
          pluginAction && pluginAction.propertyInspector
            ? `<div class="field">
                 <label>Settings</label>
                 <div id="pi-host" class="pi-host"><div class="insp-empty" style="padding:0">Loading settings…</div></div>
               </div>`
            : `<div class="field">
                 <label>Settings (JSON)</label>
                 <textarea class="textarea" id="insp-plugin-settings" placeholder="{}">${esc(
                   JSON.stringify(action.settings || {}, null, 2)
                 )}</textarea>
               </div>
               <div class="insp-empty" style="padding:0;font-size:11px">
                 ${plugin ? `Live images come from <b>${esc(plugin.name)}</b>.` : 'Choose a plugin action.'}
                 This action has no property inspector, so settings are edited as JSON.
               </div>`
        }
      `;
    }
  }

  el.innerHTML = `
    <div class="insp-head">
      <h2>${state.selected === WIDE_KEY_INDEX ? 'Wide key' : `Key ${state.selected + 1}`}</h2>
      <span class="index">${state.selected === WIDE_KEY_INDEX ? 'row 3 · col 4–5 (2×1)' : `row ${Math.floor(state.selected / COLS) + 1} · col ${(state.selected % COLS) + 1}`}</span>
    </div>

    <div class="field">
      <label>Action</label>
      <select class="select" id="insp-action-type">
        ${Object.entries(ACTION_LABELS)
          .map(([v, l]) => `<option value="${v}" ${v === action.type ? 'selected' : ''}>${l}</option>`)
          .join('')}
      </select>
    </div>

    ${valueField && action.type !== 'plugin' ? `<div class="field"><label>${action.type === 'hotkey' ? 'Combination' : action.type === 'page' ? 'Navigation' : action.type === 'app' ? 'Application' : action.type === 'url' ? 'URL' : 'Value'}</label>${valueField}</div>` : ''}
    ${pluginFields}

    <div class="insp-section">Press triggers</div>
    ${triggerField(key, 'holdAction', 'On hold', page)}
    ${key.holdAction && key.holdAction.type !== 'none' ? `<div class="field"><label>Hold time (ms)</label><input class="input" id="insp-hold-ms" type="number" min="150" max="2000" step="50" value="${Number(key.holdMs) || 500}" /></div>` : ''}
    ${triggerField(key, 'doubleAction', 'On double press', page)}
    <div class="field-hint">Tap still runs the action above.</div>

    <div class="insp-section">Appearance</div>
    <div class="field insp-icon-field">
      <label>Icon</label>
      <div class="icon-row">
        <div class="icon-drop compact" id="insp-icon-drop">
          ${liveKey.icon ? `<img src="${esc(liveKey.icon)}" alt="" />` : `<div class="icon-plus">＋</div>`}
          <div class="meta">
            <div class="file-name">${
              key.icon ? 'Custom image' : liveKey.icon ? 'Live plugin image' : autoIconFor(key) ? 'Action icon' : 'No image'
            }</div>
            <div>Drop or click to change</div>
          </div>
        </div>
        <div class="icon-buttons">
          <button class="btn small" id="insp-icon-library">Library</button>
          ${action.type === 'app' && action.value ? '<button class="btn small" id="insp-use-app-icon">App icon</button>' : ''}
          ${key.icon ? '<button class="btn small danger" id="insp-icon-remove">Remove</button>' : ''}
        </div>
      </div>
    </div>

    <div class="field">
      <label for="insp-emoji">Key text</label>
      <div class="emoji-row">
        <input class="input" id="insp-emoji" maxlength="12" value="${esc(key.emoji)}" placeholder="Text or emoji" />
        <input class="color-input" id="insp-color" type="color" value="${esc(key.color || '#1b2130')}" title="Background" />
      </div>
      <div class="field-hint">Shrinks to fit · 12 characters max</div>
    </div>

    <div class="field">
      <label for="insp-label">Bottom caption</label>
      <input class="input" id="insp-label" maxlength="40" value="${esc(key.label)}" placeholder="Optional small text under the key" />
    </div>


    <div class="insp-actions">
      <button class="btn" id="insp-duplicate">Duplicate</button>
      <button class="btn danger" id="insp-clear-key">Clear key</button>
    </div>
  `;

  // icon drop / choose
  const drop = $('#insp-icon-drop');
  drop.addEventListener('click', async () => {
    const picked = await api.pickImage();
    if (!picked) return;
    const dataUrl = await downscaleImage(picked);
    key.icon = dataUrl;
    key.iconSource = 'custom';
    drawIndex(state.selected);
    commit();
    renderInspector();
  });
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
    key.icon = await downscaleImage(await readFileAsDataUrl(file));
    key.iconSource = 'custom';
    drawIndex(state.selected);
    commit();
    renderInspector();
  });

  const hotkeyOpen = $('#insp-hotkey-open');
  if (hotkeyOpen) {
    hotkeyOpen.addEventListener('click', () => openHotkeyModal(key));
  }
  const hotkeyClear = $('#insp-hotkey-clear');
  if (hotkeyClear) {
    hotkeyClear.addEventListener('click', () => {
      key.action = { ...key.action, value: '' };
      commit();
      renderInspector();
    });
  }

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
      drawIndex(state.selected);
      commit();
      renderInspector();
    });
  }

  $('#insp-emoji').addEventListener('input', (e) => {
    key.emoji = e.target.value;
    delete key.emojiAuto;
    drawIndex(state.selected);
    commit(false);
  });
  $('#insp-color').addEventListener('input', (e) => {
    key.color = e.target.value;
    drawIndex(state.selected);
    commit(false);
  });
  $('#insp-label').addEventListener('input', (e) => {
    key.label = e.target.value;
    delete key.labelAuto;
    drawIndex(state.selected);
    commit(false);
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
    } else if (type === 'plugin') {
      const p = state.plugins.find((x) => x.compatible);
      const a = p?.actions?.[0];
      key.action = {
        type: 'plugin',
        plugin: p?.uuid || '',
        action: a?.uuid || '',
        actionid: uuid(),
        settings: {},
      };
      key.emoji = '🔌';
      key.label = '';
    } else {
      let value = '';
      if (type === 'page') {
        value = state.config.pages.find((p) => p.id !== page.id)?.id || page.id;
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
    api
      .pluginInspectorUrl({
        plugin: action.plugin,
        action: action.action,
        actionid: action.actionid,
        key: slot,
      })
      .then((url) => {
        if (!host.isConnected) return;
        if (!url) {
          host.innerHTML = '<div class="insp-empty" style="padding:0">No property inspector for this action.</div>';
          return;
        }
        host.innerHTML = `<iframe class="pi-frame" data-actionid="${esc(action.actionid)}" src="${esc(url)}" sandbox="allow-scripts allow-forms allow-modals"></iframe>`;
      })
      .catch(() => {
        if (host.isConnected) host.innerHTML = '<div class="insp-empty" style="padding:0">Could not load the property inspector.</div>';
      });
  }

  const pageOp = $('#insp-page-op');
  if (pageOp) {
    pageOp.addEventListener('change', () => {
      const op = pageOp.value;
      if (op === 'goto') {
        key.action = {
          type: 'page',
          op: 'goto',
          value: state.config.pages.find((p) => p.id !== key.action.value)?.id || page.id,
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
          plugin: p.uuid,
          action: a?.uuid || '',
          actionid: uuid(),
          settings: {},
        };
        commit(false);
        renderInspector();
      });
    }
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
      if (key.action.type === 'media') key.action = { ...key.action, op: raw };
      else key.action = { ...key.action, value: raw };
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
      fetchIcon.textContent = 'Use icon';
      if (!ok) return;
      renderInspector();
    });
  }

  // Fill in a real app icon for "Open app" keys that do not have one yet.
  if (action.type === 'app' && action.value && !key.icon) {
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
    delete page.keys[state.selected];
    commit();
    renderGrid();
    renderInspector();
  });
}

function nextFreeIndex(page) {
  for (let i = 0; i < WIDE_KEY_INDEX; i++) {
    const k = page.keys[i];
    if (!k || (!k.label && !k.emoji && !k.icon && (!k.action || k.action.type === 'none'))) return i;
  }
  return -1;
}

