'use strict';

const api = window.deckApp;
const renderKey = window.KeyRenderer.drawKey;

const ACTION_ICON_PATHS = {
  'page:next': 'assets/actions/page-next.svg',
  'page:prev': 'assets/actions/page-prev.svg',
  'page:goto': 'assets/actions/page-goto.svg',
  'media:playpause': 'assets/actions/media-playpause.svg',
  'media:next': 'assets/actions/media-next.svg',
  'media:prev': 'assets/actions/media-prev.svg',
  'media:volumeup': 'assets/actions/media-volumeup.svg',
  'media:volumedown': 'assets/actions/media-volumedown.svg',
  'media:mute': 'assets/actions/media-mute.svg',
  text: 'assets/actions/text.svg',
  hotkey: 'assets/actions/hotkey.svg',
  app: 'assets/actions/app.svg',
  url: 'assets/actions/url.svg',
  command: 'assets/actions/command.svg',
  close: 'assets/actions/close.svg',
  plugin: 'assets/actions/plugin.svg',
  multi: 'assets/actions/multi.svg',
  toggle: 'assets/actions/toggle.svg',
};

/** Bundled icon for an action, used when the key has no custom image/emoji. */
function actionIconSrc(action) {
  if (!action) return null;
  if (action.type === 'page') {
    const op = action.op === 'next' || action.op === 'prev' ? action.op : 'goto';
    return ACTION_ICON_PATHS[`page:${op}`] || null;
  }
  if (action.type === 'media') return ACTION_ICON_PATHS[`media:${action.op}`] || null;
  return ACTION_ICON_PATHS[action.type] || null;
}

// Emoji the app used to assign automatically before action icons existed.
const LEGACY_AUTO_EMOJI = new Set(['🎵']);

/** True when the key's emoji is one the app picked (not something the user typed). */
function isAutoEmoji(key) {
  if (!key.emoji) return true;
  const suggested = actionMeta(key.action).emoji;
  if (key.emojiAuto) return key.emoji === key.emojiAuto || key.emoji === suggested;
  if (!suggested) return false;
  return key.emoji === suggested || LEGACY_AUTO_EMOJI.has(key.emoji);
}

/** Only auto-emoji keys borrow the bundled icon; a custom emoji wins. */
function autoIconFor(key) {
  if (key.icon) return null;
  return isAutoEmoji(key) ? actionIconSrc(key.action) : null;
}

/**
 * Bring keys created before action icons/emoji-sync up to date: fill emoji and
 * caption from the action when they were never customised.
 */
function normalizeActionMeta() {
  let changed = false;
  for (const page of state.config.pages) {
    for (const key of Object.values(page.keys)) {
      if (!key || !key.action) continue;
      const meta = actionMeta(key.action);
      if (!meta.emoji && !meta.label) continue;
      if (meta.emoji && isAutoEmoji(key)) {
        if (key.emoji !== meta.emoji) {
          key.emoji = meta.emoji;
          changed = true;
        }
        if (key.emojiAuto !== meta.emoji) {
          key.emojiAuto = meta.emoji;
          changed = true;
        }
      }
      const labelIsAuto = !key.label || key.label === key.labelAuto;
      if (meta.label && labelIsAuto) {
        if (key.label !== meta.label) {
          key.label = meta.label;
          changed = true;
        }
        if (key.labelAuto !== meta.label) {
          key.labelAuto = meta.label;
          changed = true;
        }
      }
    }
  }
  return changed;
}
const renderSystemPanel = window.KeyRenderer.drawSystemPanel;

const COLS = 5;
const ROWS = 3;
// 13 square keys + one 2x1 key: 14 physical buttons.
const KEY_COUNT = 14;
const WIDE_KEY_INDEX = 13;

const MEDIA_EMOJI = {
  playpause: '⏯️',
  next: '⏭️',
  prev: '⏮️',
  volumeup: '🔊',
  volumedown: '🔉',
  mute: '🔇',
};

const ACTION_LABELS = {
  none: 'Do nothing',
  app: 'Open app',
  url: 'Open URL',
  command: 'Run shell command',
  hotkey: 'Send hotkey',
  text: 'Type text',
  media: 'Media key',
  close: 'Close app',
  page: 'Switch to page',
  plugin: 'Plugin action',
};

const state = {
  config: null,
  status: { connected: false, message: 'Not connected', info: null },
  selected: null,
  pushing: false,
  pushAgain: false,
  draggingBrightness: false,
  plugins: [],
  apps: [],
};

let saveTimer = null;
let pushTimer = null;
let brightnessTimer = null;

const $ = (sel) => document.querySelector(sel);

function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function activePage() {
  return state.config.pages.find((p) => p.id === state.config.activePageId) || state.config.pages[0];
}

function emptyKey() {
  return { emoji: '', label: '', color: '#1b2130', icon: null, action: { type: 'none', value: '' } };
}

function ensureKey(page, index) {
  if (!page.keys[index]) page.keys[index] = emptyKey();
  return page.keys[index];
}

// Live images pushed by plugins, keyed by actionid.
const pluginImages = new Map();

function effectiveKey(key) {
  if (!key) return key;
  const id = key.action?.type === 'plugin' ? key.action.actionid : null;
  if (id && pluginImages.has(id)) return { ...key, icon: pluginImages.get(id), emoji: '' };
  return key;
}

function findPluginAction(actionid) {
  for (const page of state.config.pages) {
    for (const [index, key] of Object.entries(page.keys)) {
      if (key?.action?.type === 'plugin' && key.action.actionid === actionid) {
        return { page, index: Number(index), key };
      }
    }
  }
  return null;
}

// --------------------------------------------------------------- rendering

function renderAll() {
  renderPageList();
  renderGrid();
  renderInspector();
  renderChrome();
}

function renderChrome() {
  const page = activePage();
  const title = $('#page-title');
  if (document.activeElement !== title) title.value = page.name;
  $('#autopush').checked = Boolean(state.config.settings.autoPush);
  $('#brightness').value = state.config.settings.brightness;
  $('#brightness-value').textContent = state.config.settings.brightness;
  renderStatus();
}

function renderStatus() {
  const { connected, info, message } = state.status;
  const pill = $('#status-pill');
  pill.textContent = connected ? 'online' : 'offline';
  pill.classList.toggle('on', connected);
  $('#device-dot').classList.toggle('on', connected);
  $('#device-led').classList.toggle('on', connected);
  $('#device-name').textContent = connected ? 'Ulanzi D200' : message || 'Not connected';
  $('#device-detail').textContent = connected
    ? `${info?.Dversion ? `fw ${info.Dversion} · ` : ''}${info?.SerialNumber || info?.serial || 'USB 2207:0019'}`
    : 'Quit Ulanzi Studio to connect';
  $('#device-serial').textContent = connected ? info?.SerialNumber || info?.serial || '' : '';
}

function renderPageList() {
  const list = $('#page-list');
  list.innerHTML = '';
  state.config.pages.forEach((page) => {
    const el = document.createElement('div');
    el.className = `page-item${page.id === state.config.activePageId ? ' active' : ''}`;
    el.innerHTML = `<span class="dot"></span><span class="name">${esc(page.name)}</span>`;
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '×';
    del.title = 'Delete page';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePage(page.id);
    });
    el.appendChild(del);
    el.addEventListener('click', () => selectPage(page.id));
    list.appendChild(el);
  });
}

async function renderGrid() {
  const grid = $('#grid');
  const page = activePage();
  grid.innerHTML = '';

  for (let i = 0; i < KEY_COUNT; i++) {
    const btn = document.createElement('button');
    btn.className = 'key';
    btn.dataset.index = String(i);
    if (state.selected === i) btn.classList.add('selected');

    const wide = i === WIDE_KEY_INDEX;
    if (wide) btn.classList.add('wide');
    const canvas = document.createElement('canvas');
    canvas.width = wide ? 402 : 196;
    canvas.height = 196;
    btn.appendChild(canvas);

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = String(i + 1);
    btn.appendChild(badge);

    if (wide) {
      btn.title = 'System panel — controlled by the deck firmware';
      btn.classList.add('system');
      grid.appendChild(btn);
      continue;
    }

    btn.draggable = true;
    btn.addEventListener('click', () => {
      state.selected = i;
      renderGrid();
      renderInspector();
    });

    btn.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-ulanzi-key', String(i));
      e.dataTransfer.effectAllowed = 'move';
      btn.classList.add('dragging');
    });
    btn.addEventListener('dragend', () => {
      btn.classList.remove('dragging');
      document.querySelectorAll('.key.drop-target').forEach((el) => el.classList.remove('drop-target'));
    });
    btn.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('application/x-ulanzi-key')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        btn.classList.add('drop-target');
      }
    });
    btn.addEventListener('dragleave', () => btn.classList.remove('drop-target'));

    btn.addEventListener('dragover', (e) => {
      e.preventDefault();
      btn.classList.add('drag');
    });
    btn.addEventListener('dragleave', () => btn.classList.remove('drag'));
    btn.addEventListener('drop', async (e) => {
      e.preventDefault();
      btn.classList.remove('drag', 'drop-target');
      const src = Number(e.dataTransfer.getData('application/x-ulanzi-key'));
      if (!Number.isNaN(src) && e.dataTransfer.getData('application/x-ulanzi-key')) {
        moveKey(page, src, i);
        return;
      }
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        toast('Drop an image file', true);
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      const key = ensureKey(activePage(), i);
      key.icon = dataUrl;
      state.selected = i;
      drawIndex(i);
      commit();
      renderInspector();
    });

    grid.appendChild(btn);
  }

  await drawGrid();
}

async function drawGrid() {
  const page = activePage();
  const tiles = [...$('#grid').children];
  await Promise.all(
    tiles.map((tile, i) => {
      if (i === WIDE_KEY_INDEX) return renderSystemPanel(tile.querySelector('canvas'));
      const key = effectiveKey(page.keys[i] || emptyKey());
      return renderKey(tile.querySelector('canvas'), key, 196, 196, autoIconFor(key));
    })
  );
}

function drawIndex(index) {
  const tile = $('#grid').children[index];
  if (!tile) return;
  if (index === WIDE_KEY_INDEX) return renderSystemPanel(tile.querySelector('canvas'));
  const key = effectiveKey(activePage().keys[index] || emptyKey());
  renderKey(tile.querySelector('canvas'), key, 196, 196, autoIconFor(key));
}

function moveKey(page, src, dst) {
  if (src === dst || src === WIDE_KEY_INDEX || dst === WIDE_KEY_INDEX) return;
  const source = page.keys[src];
  const target = page.keys[dst];
  if (!source && !target) return;
  if (source) {
    page.keys[dst] = source;
    if (target) page.keys[src] = target;
    else delete page.keys[src];
  } else {
    page.keys[src] = target;
    delete page.keys[dst];
  }
  for (const index of [src, dst]) {
    const key = page.keys[index];
    if (key && key.action && key.action.type === 'plugin') {
      key.action.actionid = uuid();
    }
  }
  state.selected = dst;
  commit();
  renderGrid();
  renderInspector();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

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
      <label>Icon</label>
      <div class="icon-drop" id="insp-icon-drop">
        ${liveKey.icon ? `<img src="${esc(liveKey.icon)}" alt="" />` : `<div style="width:46px;height:46px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.05);font-size:20px;opacity:.55">＋</div>`}
        <div class="meta">
          <div class="file-name">${
            key.icon ? 'Custom image' : liveKey.icon ? 'Live plugin image' : autoIconFor(key) ? 'Action icon' : 'No image'
          }</div>
          <div>${
            !key.icon && autoIconFor(key)
              ? 'Bundled icon for this action · type an emoji to use that instead'
              : 'Drop an image here or click to choose'
          }</div>
        </div>
      </div>
      <button class="btn icon-remove" id="insp-icon-library">Choose from library…</button>
      ${action.type === 'app' && action.value ? '<button class="btn icon-remove" id="insp-use-app-icon">Use app icon</button>' : ''}
      ${key.icon ? '<button class="btn danger icon-remove" id="insp-icon-remove">Remove image</button>' : ''}
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

    <div class="field">
      <label>Label</label>
      <div class="emoji-row">
        <input class="input" id="insp-emoji" maxlength="16" value="${esc(key.emoji)}" placeholder="Text or emoji" />
        <input class="color-input" id="insp-color" type="color" value="${esc(key.color || '#1b2130')}" title="Background" />
      </div>
      <div class="field-hint">Shrinks to fit · 12 characters max</div>
    </div>

    <div class="field">
      <label>Caption</label>
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
    const dataUrl = await api.pickImage();
    if (!dataUrl) return;
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
    key.icon = await readFileAsDataUrl(file);
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
        host.innerHTML = `<iframe class="pi-frame" data-actionid="${esc(action.actionid)}" src="${esc(url)}"></iframe>`;
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

  $('#insp-duplicate').addEventListener('click', () => {
    const target = nextFreeIndex(page);
    if (target < 0) return toast('No free key slots', true);
    page.keys[target] = JSON.parse(JSON.stringify(key));
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

// ------------------------------------------------------------- persistence

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api.saveConfig(state.config), 250);
}

async function loadSiteIcon(key, report = false) {
  const url = String(key.action?.value || '').trim();
  if (!url) return false;
  const res = await api.fetchSiteIcon(url);
  if (!res.ok) {
    if (report) toast(res.error || 'No icon found', true);
    return false;
  }
  key.icon = res.dataUrl;
  key.iconSource = 'site';
  drawIndex(state.selected);
  commit();
  if (report) toast('Icon loaded from the site');
  return true;
}

function commit(redraw = true) {
  scheduleSave();
  if (redraw) drawGrid();
  schedulePush();
  schedulePluginsSync();
}

// --------------------------------------------------------------- plugins

let pluginSyncTimer = null;

function keyIndexToSlot(index) {
  return `${index % COLS}_${Math.floor(index / COLS)}`;
}

function schedulePluginsSync() {
  clearTimeout(pluginSyncTimer);
  pluginSyncTimer = setTimeout(syncPlugins, 250);
}

function syncPlugins() {
  if (!state.config) return;
  const wanted = [];
  for (const page of state.config.pages) {
    for (const [index, key] of Object.entries(page.keys)) {
      if (Number(index) === WIDE_KEY_INDEX) continue;
      if (!key || key.action?.type !== 'plugin') continue;
      if (!key.action.plugin || !key.action.action) continue;
      if (!key.action.actionid) key.action.actionid = uuid();
      wanted.push({
        actionid: key.action.actionid,
        plugin: key.action.plugin,
        action: key.action.action,
        key: keyIndexToSlot(Number(index)),
        settings: key.action.settings || {},
        active: page.id === state.config.activePageId,
      });
    }
  }
  api.syncPlugins(wanted).catch((err) => toast(err.message || String(err), true));
}

function schedulePush() {
  if (!state.status.connected || !state.config.settings.autoPush) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 400);
}

async function pushNow() {
  if (!state.status.connected) {
    toast('Deck not connected — quit Ulanzi Studio and reconnect', true);
    return;
  }
  if (state.pushing) {
    state.pushAgain = true;
    return;
  }
  state.pushing = true;
  $('#push-state').textContent = 'pushing…';
  try {
    await drawGrid();
    const grid = $('#grid');
    const images = [...grid.children].map((tile, index) => ({
      index,
      png: tile.querySelector('canvas').toDataURL('image/png').split(',')[1],
    }));
    const res = await api.pushPage(images);
    if (!res.ok) throw new Error(res.error || 'push failed');
    $('#push-state').textContent = `pushed · ${(res.bytes / 1024).toFixed(1)} KB`;
    state.config.settings.lastPush = Date.now();
    scheduleSave();
  } catch (err) {
    $('#push-state').textContent = 'push failed';
    toast(err.message || String(err), true);
  } finally {
    state.pushing = false;
    if (state.pushAgain) {
      state.pushAgain = false;
      schedulePush();
    }
  }
}

// ------------------------------------------------------------------ pages

function selectPage(id) {
  if (state.config.activePageId === id) return;
  state.config.activePageId = id;
  state.selected = null;
  scheduleSave();
  renderAll();
  schedulePush();
  schedulePluginsSync();
}

function addPage() {
  const page = {
    id: uuid(),
    name: `Page ${state.config.pages.length + 1}`,
    keys: {},
  };
  state.config.pages.push(page);
  state.config.activePageId = page.id;
  state.selected = null;
  renderAll();
  commit();
}

function deletePage(id) {
  if (state.config.pages.length <= 1) {
    toast('At least one page is required', true);
    return;
  }
  const page = state.config.pages.find((p) => p.id === id);
  if (!confirm(`Delete page “${page.name}”?`)) return;
  state.config.pages = state.config.pages.filter((p) => p.id !== id);
  if (state.config.activePageId === id) state.config.activePageId = state.config.pages[0].id;
  state.selected = null;
  renderAll();
  commit();
  scheduleSave();
}

function navigate(pageId) {
  if (!state.config.pages.some((p) => p.id === pageId)) return;
  state.config.activePageId = pageId;
  state.selected = null;
  scheduleSave();
  renderAll();
  pushNow();
  schedulePluginsSync();
}

// ------------------------------------------------------------------ toast

let toastTimer = null;
function toast(message, bad = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('bad', bad);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// --------------------------------------------------------------- hotkeys

const HOTKEY_MODS = [
  { token: 'cmd', label: '⌘ Command', symbol: '⌘' },
  { token: 'ctrl', label: '⌃ Control', symbol: '⌃' },
  { token: 'alt', label: '⌥ Option', symbol: '⌥' },
  { token: 'shift', label: '⇧ Shift', symbol: '⇧' },
];

const HOTKEY_CATEGORIES = [
  { id: 'modifiers', name: 'Modifier Keys', keys: HOTKEY_MODS },
  {
    id: 'letters',
    name: 'Letters',
    keys: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => ({ label: c, token: c.toLowerCase() })),
  },
  {
    id: 'numbers',
    name: 'Numbers/Symbols',
    keys: [...'0123456789', ',', '.', ';', "'", '`', '[', ']', '/', '\\', '-', '='].map((t) => ({
      label: t,
      token: t,
    })),
  },
  {
    id: 'function',
    name: 'Function Keys',
    keys: [
      { label: '←', token: 'left' },
      { label: '↑', token: 'up' },
      { label: '→', token: 'right' },
      { label: '↓', token: 'down' },
      { label: 'Space', token: 'space' },
      { label: 'Return', token: 'return' },
      { label: 'Tab', token: 'tab' },
      { label: 'Esc', token: 'escape' },
      { label: 'Delete', token: 'delete' },
      { label: 'Home', token: 'home' },
      { label: 'End', token: 'end' },
      { label: 'PgUp', token: 'pageup' },
      { label: 'PgDn', token: 'pagedown' },
    ],
  },
  {
    id: 'fkeys',
    name: 'F Keys',
    keys: Array.from({ length: 12 }, (_, i) => ({ label: `F${i + 1}`, token: `f${i + 1}` })),
  },
  {
    id: 'numpad',
    name: 'Numeric Keypad',
    keys: [
      ...Array.from({ length: 10 }, (_, i) => ({ label: `Num ${i}`, token: `numpad${i}` })),
      { label: 'Num +', token: 'numpadplus' },
      { label: 'Num -', token: 'numpadminus' },
      { label: 'Num *', token: 'numpadmultiply' },
      { label: 'Num /', token: 'numpaddivide' },
      { label: 'Num .', token: 'numpaddecimal' },
      { label: 'Num Enter', token: 'numpadenter' },
      { label: 'Num Del', token: 'numpadclear' },
      { label: 'Num =', token: 'numpadequal' },
    ],
  },
];

let hotkeyTarget = null;
let hotkeyOnCommit = null;
let hotkeyCategory = 'modifiers';
let hotkeyMods = new Set();
let hotkeyKeyToken = '';
let hotkeyKeyLabel = '';
let hotkeyListener = null;

function canonicalMod(token) {
  const t = String(token || '').toLowerCase();
  if (t === 'cmd' || t === 'command' || t === 'meta') return 'cmd';
  if (t === 'ctrl' || t === 'control') return 'ctrl';
  if (t === 'alt' || t === 'option') return 'alt';
  if (t === 'shift') return 'shift';
  return null;
}

function hotkeyLabelFor(token) {
  for (const cat of HOTKEY_CATEGORIES) {
    const found = cat.keys.find((k) => k.token === token);
    if (found) return found.label;
  }
  if (!token) return '';
  return token.length === 1 ? token.toUpperCase() : token;
}

function hotkeyCategoryFor(token) {
  for (const cat of HOTKEY_CATEGORIES) {
    if (cat.keys.some((k) => k.token === token)) return cat.id;
  }
  return 'modifiers';
}

function openHotkeyModal(key, onCommit = null) {
  hotkeyTarget = key;
  hotkeyOnCommit = onCommit;
  hotkeyMods = new Set();
  hotkeyKeyToken = '';
  hotkeyKeyLabel = '';
  for (const part of String(key.action?.value || '').split('+').filter(Boolean)) {
    const mod = canonicalMod(part);
    if (mod) hotkeyMods.add(mod);
    else {
      hotkeyKeyToken = part;
      hotkeyKeyLabel = hotkeyLabelFor(part);
    }
  }
  hotkeyCategory = hotkeyKeyToken ? hotkeyCategoryFor(hotkeyKeyToken) : 'modifiers';
  renderHotkeyModal();
  $('#hotkey-modal').classList.remove('hidden');
  hotkeyListener = (e) => handleHotkeyKey(e);
  document.addEventListener('keydown', hotkeyListener, true);
}

function closeHotkeyModal() {
  if (hotkeyListener) document.removeEventListener('keydown', hotkeyListener, true);
  hotkeyListener = null;
  hotkeyTarget = null;
  hotkeyOnCommit = null;
  $('#hotkey-modal').classList.add('hidden');
}

function hotkeyCombo() {
  if (!hotkeyKeyToken) return '';
  const mods = ['cmd', 'ctrl', 'alt', 'shift'].filter((m) => hotkeyMods.has(m));
  return [...mods, hotkeyKeyToken].join('+');
}

function renderHotkeyModal() {
  const display = $('#hotkey-display');
  const chips = [];
  for (const mod of HOTKEY_MODS) {
    if (hotkeyMods.has(mod.token)) chips.push(`<span class="hotkey-chip">${mod.symbol}</span>`);
  }
  if (hotkeyKeyToken) {
    chips.push(`<span class="hotkey-chip">${esc(hotkeyKeyLabel || hotkeyKeyToken)}</span>`);
  }
  display.innerHTML = chips.length ? chips.join('') : 'Press a button or add one below';

  const cats = $('#hotkey-cats');
  cats.innerHTML = HOTKEY_CATEGORIES.map(
    (cat) =>
      `<button class="hotkey-cat${cat.id === hotkeyCategory ? ' active' : ''}" data-cat="${cat.id}">${cat.name}</button>`
  ).join('');
  cats.querySelectorAll('[data-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      hotkeyCategory = btn.dataset.cat;
      renderHotkeyModal();
    });
  });

  const keys = $('#hotkey-keys');
  const cat = HOTKEY_CATEGORIES.find((c) => c.id === hotkeyCategory) || HOTKEY_CATEGORIES[0];
  keys.innerHTML = cat.keys
    .map((key) => {
      const active =
        cat.id === 'modifiers' ? hotkeyMods.has(key.token) : hotkeyKeyToken === key.token;
      return `<button class="hotkey-key${active ? ' active' : ''}" data-token="${esc(key.token)}" data-label="${esc(
        key.label
      )}">${esc(key.label)}</button>`;
    })
    .join('');
  keys.querySelectorAll('.hotkey-key').forEach((btn) => {
    btn.addEventListener('click', () => {
      const token = btn.dataset.token;
      if (cat.id === 'modifiers') {
        if (hotkeyMods.has(token)) hotkeyMods.delete(token);
        else hotkeyMods.add(token);
      } else {
        hotkeyKeyToken = token;
        hotkeyKeyLabel = btn.dataset.label;
      }
      renderHotkeyModal();
    });
  });
}

function physicalKeyToken(e) {
  if (/^F\d{1,2}$/i.test(e.key)) return e.key.toLowerCase();
  const code = e.code || '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `numpad${code.slice(6)}`;
  const numpad = {
    NumpadAdd: 'numpadplus',
    NumpadSubtract: 'numpadminus',
    NumpadMultiply: 'numpadmultiply',
    NumpadDivide: 'numpaddivide',
    NumpadDecimal: 'numpaddecimal',
    NumpadEnter: 'numpadenter',
    NumpadEqual: 'numpadequal',
  };
  if (numpad[code]) return numpad[code];
  const map = {
    ArrowLeft: 'left',
    ArrowUp: 'up',
    ArrowRight: 'right',
    ArrowDown: 'down',
    ' ': 'space',
    Enter: 'return',
    Tab: 'tab',
    Backspace: 'delete',
    Delete: 'delete',
    Home: 'home',
    End: 'end',
    PageUp: 'pageup',
    PageDown: 'pagedown',
  };
  if (map[e.key]) return map[e.key];
  if (map[e.code]) return map[e.code];
  const symbols = { '-': '-', '=': '=', '[': '[', ']': ']', '\\': '\\', ';': ';', "'": "'", '`': '`', ',': ',', '.': '.', '/': '/' };
  if (symbols[e.key]) return symbols[e.key];
  return '';
}

function handleHotkeyKey(e) {
  if ($('#hotkey-modal').classList.contains('hidden')) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') {
    closeHotkeyModal();
    return;
  }
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) {
    hotkeyMods = new Set();
    if (e.metaKey) hotkeyMods.add('cmd');
    if (e.ctrlKey) hotkeyMods.add('ctrl');
    if (e.altKey) hotkeyMods.add('alt');
    if (e.shiftKey) hotkeyMods.add('shift');
    renderHotkeyModal();
    return;
  }
  hotkeyMods = new Set();
  if (e.metaKey) hotkeyMods.add('cmd');
  if (e.ctrlKey) hotkeyMods.add('ctrl');
  if (e.altKey) hotkeyMods.add('alt');
  if (e.shiftKey) hotkeyMods.add('shift');
  const token = physicalKeyToken(e);
  if (token) {
    hotkeyKeyToken = token;
    hotkeyKeyLabel = hotkeyLabelFor(token);
    hotkeyCategory = hotkeyCategoryFor(token);
    renderHotkeyModal();
  }
}

function saveHotkey() {
  if (!hotkeyTarget) return closeHotkeyModal();
  if (!hotkeyKeyToken) return toast('Choose a key first', true);
  hotkeyTarget.action = { ...hotkeyTarget.action, value: hotkeyCombo() };
  const onCommit = hotkeyOnCommit;
  const target = hotkeyTarget;
  commit();
  closeHotkeyModal();
  if (onCommit) onCommit(target.action);
  else renderInspector();
}

// --------------------------------------------------------------- app picker

let appPickerKey = null;
const appIconCache = new Map();
const appIconQueue = [];
let appIconActive = 0;

function pumpAppIcons() {
  while (appIconActive < 4 && appIconQueue.length) {
    const { path, el } = appIconQueue.shift();
    appIconActive++;
    api
      .appIcon(path)
      .then((icon) => {
        appIconCache.set(path, icon);
        if (icon && el.isConnected) {
          const img = document.createElement('img');
          img.src = icon;
          img.alt = '';
          el.replaceChildren(img);
        }
      })
      .finally(() => {
        appIconActive--;
        pumpAppIcons();
      });
  }
}

function queueAppIcon(path, el) {
  if (!path || !el) return;
  if (appIconCache.has(path)) {
    const icon = appIconCache.get(path);
    if (icon) {
      const img = document.createElement('img');
      img.src = icon;
      img.alt = '';
      el.replaceChildren(img);
    }
    return;
  }
  appIconQueue.push({ path, el });
  pumpAppIcons();
}

async function openAppPicker() {
  appPickerKey = ensureKey(activePage(), state.selected);
  if (!state.apps.length) state.apps = await api.listApps();
  $('#app-search').value = '';
  renderAppList('');
  $('#app-modal').classList.remove('hidden');
  setTimeout(() => $('#app-search').focus(), 40);
}

function closeAppPicker() {
  $('#app-modal').classList.add('hidden');
  appPickerKey = null;
}

function renderAppList(query) {
  const q = String(query || '').toLowerCase();
  const apps = state.apps.filter(
    (a) => !q || a.name.toLowerCase().includes(q) || a.path.toLowerCase().includes(q)
  );
  const list = $('#app-list');
  if (!apps.length) {
    list.innerHTML = '<div class="plugin-empty">No applications found.</div>';
    return;
  }
  list.innerHTML = apps
    .map(
      (a) => `<button class="app-row" data-path="${esc(a.path)}" data-name="${esc(a.name)}">
        <div class="app-avatar" data-path="${esc(a.path)}">${esc((a.name[0] || 'A').toUpperCase())}</div>
        <div class="app-meta">
          <div class="app-name">${esc(a.name)}</div>
          <div class="app-path">${esc(a.path)}</div>
        </div>
      </button>`
    )
    .join('');
  list.querySelectorAll('.app-avatar').forEach((el) => queueAppIcon(el.dataset.path, el));
  list.querySelectorAll('.app-row').forEach((row) => {
    row.addEventListener('click', () => {
      const key = appPickerKey;
      if (!key) return;
      const index = state.selected;
      key.action = { type: 'app', value: row.dataset.path };
      if (!key.emoji) key.emoji = row.dataset.name;
      syncActionMeta(key);
      commit();
      closeAppPicker();
      renderInspector();
      if (!key.icon) {
        api.appIcon(row.dataset.path).then((icon) => {
          if (!icon) return;
          key.icon = icon;
          key.iconSource = 'app';
          if (state.selected === index) drawIndex(index);
          commit();
          renderInspector();
        });
      }
    });
  });
}


// -------------------------------------------------------------- icon library

let iconLibraryPick = null;
let iconLibraryPacks = [];

function closeIconLibrary() {
  iconLibraryPick = null;
  $('#icons-modal').classList.add('hidden');
}

async function openIconLibrary(onPick = null) {
  iconLibraryPick = onPick;
  $('#icons-modal').classList.remove('hidden');
  $('#icons-grid').innerHTML = '<div class="icons-empty">Loading…</div>';
  iconLibraryPacks = await api.listIconPacks();
  renderIconPacks();
}

function renderIconPacks() {
  const list = $('#icons-packs');
  if (!iconLibraryPacks.length) {
    list.innerHTML = '';
    $('#icons-grid').innerHTML =
      '<div class="icons-empty">No icon packs yet.<br/>Open the Store → Icons and download a pack.</div>';
    return;
  }
  list.innerHTML = iconLibraryPacks
    .map(
      (pack, index) =>
        `<button class="icons-pack${index === 0 ? ' active' : ''}" data-pack="${esc(pack.id)}">
           <span>${esc(pack.name)}</span><span class="count">${pack.files.length}</span>
         </button>`
    )
    .join('');
  list.querySelectorAll('[data-pack]').forEach((btn) => {
    btn.addEventListener('click', () => {
      list.querySelectorAll('.icons-pack').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderIconGrid(iconLibraryPacks.find((p) => p.id === btn.dataset.pack));
    });
  });
  renderIconGrid(iconLibraryPacks[0]);
}

async function renderIconGrid(pack) {
  const grid = $('#icons-grid');
  if (!pack) return;
  grid.innerHTML = '<div class="icons-empty">Loading…</div>';
  const tiles = [];
  for (const file of pack.files) {
    const src = await api.readIcon(pack.id, file);
    if (src) tiles.push({ src, file });
  }
  grid.innerHTML = '';
  for (const tile of tiles) {
    const btn = document.createElement('button');
    btn.className = 'icon-tile';
    btn.title = tile.file;
    const img = document.createElement('img');
    img.src = tile.src;
    img.alt = '';
    btn.appendChild(img);
    btn.addEventListener('click', () => {
      if (iconLibraryPick) iconLibraryPick(tile.src, pack, tile.file);
      closeIconLibrary();
    });
    grid.appendChild(btn);
  }
  if (!tiles.length) grid.innerHTML = '<div class="icons-empty">This pack has no images.</div>';
}

/** Downscale a picked image to 392 px so key data stays small. */
function setKeyIconFromLibrary(src) {
  const key = activePage().keys[state.selected];
  if (!key) return;
  const img = new Image();
  img.onload = () => {
    const size = 392;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    key.icon = canvas.toDataURL('image/png');
    key.iconSource = 'library';
    drawIndex(state.selected);
    commit();
    renderInspector();
    toast('Icon applied');
  };
  img.src = src;
}

// -------------------------------------------------------------- plugin store

const storeState = {
  session: { signedIn: false, user: null },
  categories: [],
  cateId: '',
  sort: 'hot',
  search: '',
  page: 1,
  items: [],
  total: 0,
  loading: false,
  detail: null,
};

async function openStoreModal() {
  $('#store-modal').classList.remove('hidden');
  $('#store-detail').classList.add('hidden');
  const session = await api.storeSession();
  storeState.session = session;
  renderStoreChrome();
  await loadStoreCategories();
  await loadStoreItems(true);
}

function closeStoreModal() {
  $('#store-modal').classList.add('hidden');
  $('#store-detail').classList.add('hidden');
}

function renderStoreChrome(requireSignIn = false) {
  $('#store-signin').classList.toggle('hidden', !requireSignIn);
  $('#store-browse').classList.toggle('hidden', requireSignIn);
  $('#store-user').classList.toggle('hidden', !storeState.session.signedIn);
  $('#store-user').textContent = storeState.session.user || '';
  $('#store-logout').classList.toggle('hidden', !storeState.session.signedIn);
  $('#store-sub').textContent = 'Official Ulanzi Studio plugin market — browse and install plugins.';
}

async function loadStoreCategories() {
  const res = await api.storeCategories();
  if (!res.ok) {
    $('#store-cats').innerHTML = `<div class="store-error">${esc(res.error)}</div>`;
    return;
  }
  storeState.categories = res.categories || [];
  if (!storeState.cateId) {
    const plugins = storeState.categories.find(
      (c) => /^plugins?$/i.test(c.name) || c.name === '插件'
    );
    if (plugins) storeState.cateId = plugins.id;
  }
  renderStoreCategories();
}

function renderStoreCategories() {
  const cats = [...storeState.categories];
  $('#store-cats').innerHTML = cats
    .map(
      (c) =>
        `<button class="store-cat${String(c.id) === String(storeState.cateId) ? ' active' : ''}" data-cat="${esc(
          c.id
        )}">${esc(c.name)}</button>`
    )
    .join('');
  $('#store-cats')
    .querySelectorAll('[data-cat]')
    .forEach((btn) =>
      btn.addEventListener('click', () => {
        storeState.cateId = btn.dataset.cat;
        renderStoreCategories();
        loadStoreItems(true);
      })
    );
}

async function loadStoreItems(reset = false) {
  if (storeState.loading) return;
  storeState.loading = true;
  if (reset) {
    storeState.page = 1;
    storeState.items = [];
    $('#store-grid').innerHTML = '<div class="store-empty">Loading…</div>';
  }
  const res = await api.storeList({
    page: storeState.page,
    limit: 24,
    cateId: storeState.cateId,
    sort: storeState.sort,
    isAsc: 'asc',
    searchText: storeState.search,
  });
  storeState.loading = false;
  if (!res.ok) {
    $('#store-grid').innerHTML = `<div class="store-empty">${esc(res.error)}</div>`;
    if (/token/i.test(res.error || '')) {
      renderStoreChrome(false);
    }
    return;
  }
  storeState.items = reset ? res.items : [...storeState.items, ...res.items];
  storeState.total = res.total || storeState.items.length;
  renderStoreGrid();
}

function renderStoreGrid() {
  const grid = $('#store-grid');
  if (!storeState.items.length) {
    grid.innerHTML = '<div class="store-empty">No plugins found.</div>';
  } else {
    grid.innerHTML = storeState.items
      .map(
        (item) => `
        <button class="store-item" data-id="${esc(item.id)}">
          ${
            item.icon
              ? `<img class="store-thumb" src="${esc(item.icon)}" alt="" loading="lazy" />`
              : '<div class="store-thumb empty">🧩</div>'
          }
          <div class="store-item-name">${esc(item.name)}</div>
          <div class="store-item-meta"><span>${esc(item.author || 'Ulanzi')}</span><span>${
            item.version ? `v${esc(item.version)}` : ''
          }</span></div>
        </button>`
      )
      .join('');
    grid.querySelectorAll('[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => openStoreDetail(btn.dataset.id));
    });
  }
  $('#store-count').textContent = `${storeState.items.length} of ${storeState.total}`;
  $('#store-more').classList.toggle('hidden', storeState.items.length >= storeState.total);
}

function formatCount(n) {
  const value = Number(n) || 0;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

async function openStoreDetail(id) {
  const detail = $('#store-detail');
  $('#store-browse').classList.add('hidden');
  detail.classList.remove('hidden');
  detail.innerHTML = '<div class="store-empty">Loading…</div>';
  const res = await api.storeResource(id);
  if (!res.ok) {
    detail.innerHTML = `<div class="store-error">${esc(res.error)}</div>`;
    return;
  }
  const item = res.resource;
  storeState.detail = item;
  const installed = state.plugins.some((p) => (item.uuid && p.uuid === item.uuid) || p.name === item.name);
  const category = storeState.categories.find((c) => String(c.id) === String(item.categoryId));
  const kind = category?.name || '';
  const installable = /plugins?/i.test(kind) && /\.zip$/i.test(item.files || '');
  const iconPack = /icons?/i.test(kind) && /\.zip$/i.test(item.files || '');
  detail.innerHTML = `
    <div class="store-detail-head">
      ${item.icon ? `<img src="${esc(item.icon)}" alt="" />` : '<div class="store-thumb empty">🧩</div>'}
      <div>
        <h3>${esc(item.name)}</h3>
        <div class="store-detail-sub">
          ${esc(item.author || 'Ulanzi')}${item.version ? ` · v${esc(item.version)}` : ''}
        </div>
        ${item.uuid ? `<div class="store-detail-sub">${esc(item.uuid)}</div>` : ''}
      </div>
    </div>
    <div class="store-detail-actions">
      ${
        installable
          ? `<button class="btn primary" id="store-install" ${installed ? 'disabled' : ''}>
               ${installed ? 'Installed' : 'Install plugin'}
             </button>`
          : iconPack
            ? '<button class="btn primary" id="store-download-icons">Download icons</button>'
            : '<span class="badge-tag">Not a plugin</span>'
      }
      <button class="btn" id="store-back">Back</button>
    </div>
    ${
      installable || iconPack
        ? ''
        : `<p class="store-note">${
            /icons?/i.test(kind) && !item.files
              ? 'This icon pack has no downloadable file on the Ulanzi store.'
              : `${kind ? `${esc(kind)} items` : 'This item'} can be downloaded from the Ulanzi marketplace, but only JavaScript <b>plugins</b> and <b>icon packs</b> can be installed into this app.`
          }</p>`
    }
    <p>${esc(item.summary || 'No description provided.')}</p>
  `;
  $('#store-back').addEventListener('click', () => {
    detail.classList.add('hidden');
    $('#store-browse').classList.remove('hidden');
  });
  const downloadIcons = $('#store-download-icons');
  if (downloadIcons) {
    downloadIcons.addEventListener('click', async () => {
      downloadIcons.disabled = true;
      downloadIcons.textContent = 'Downloading…';
      const out = await api.installIconPack(item.id);
      if (!out.ok) {
        downloadIcons.disabled = false;
        downloadIcons.textContent = 'Download icons';
        return toast(out.error, true);
      }
      toast(`Added ${out.pack.count} icons to your library`);
      closeStoreModal();
      openIconLibrary((src) => setKeyIconFromLibrary(src));
      downloadIcons.disabled = false;
      downloadIcons.textContent = 'Download icons';
    });
  }
  // Ask the CDN whether the package still exists before offering a download.
  const actionBtn = $('#store-install') || $('#store-download-icons');
  if (actionBtn && !installed && !actionBtn.disabled) {
    const readyLabel = actionBtn.textContent;
    actionBtn.disabled = true;
    actionBtn.textContent = 'Checking…';
    api.storeCheckFile(item.id).then((check) => {
      actionBtn.textContent = readyLabel;
      if (check.ok) {
        actionBtn.disabled = false;
        return;
      }
      actionBtn.disabled = true;
      actionBtn.textContent = 'Unavailable';
      const note = document.createElement('p');
      note.className = 'store-note';
      note.textContent =
        'Ulanzi’s file for this item is missing from their server, so it cannot be downloaded right now.';
      detail.querySelector('.store-detail-actions').after(note);
    });
  }

  const install = $('#store-install');
  if (install && !installed) {
    install.addEventListener('click', async () => {
      install.disabled = true;
      install.textContent = 'Installing…';
      const out = await api.storeInstall(item.id);
      if (!out.ok) {
        install.disabled = false;
        install.textContent = 'Install plugin';
        return toast(out.error, true);
      }
      state.plugins = out.list || (await api.listPlugins());
      updatePluginCount();
      renderPluginModal();
      syncPlugins();
      install.textContent = 'Installed';
      toast(`Installed ${out.name || item.name}`);
    });
  }
}

// ------------------------------------------------------------ plugin manager

function updatePluginCount() {
  $('#plugin-count').textContent = String(state.plugins.length);
}

async function refreshPlugins() {
  state.plugins = await api.listPlugins();
  updatePluginCount();
  if (!$('#plugin-modal').classList.contains('hidden')) renderPluginModal();
  syncPlugins();
}

function switchInstalledTab(tab) {
  const isIcons = tab === 'icons';
  $('#tab-plugins').classList.toggle('hidden', isIcons);
  $('#tab-icons').classList.toggle('hidden', !isIcons);
  $('#tab-plugins-btn').classList.toggle('active', !isIcons);
  $('#tab-icons-btn').classList.toggle('active', isIcons);
  if (isIcons) renderInstalledIcons();
}

async function renderInstalledIcons() {
  const list = $('#icon-packs-list');
  list.innerHTML = '<div class="plugin-empty">Loading…</div>';
  const packs = await api.listIconPacks();
  if (!packs.length) {
    list.innerHTML = `<div class="plugin-empty">
      No icon packs installed in this app yet.<br/>
      Use <b>Get icon packs…</b> to download one from the store.
    </div>`;
    return;
  }
  list.innerHTML = packs
    .map(
      (pack) => `
      <div class="plugin-row">
        ${
          pack.icon
            ? `<img class="pack-icon" src="${esc(pack.icon)}" alt="" />`
            : '<div class="pack-icon"></div>'
        }
        <div class="plugin-meta">
          <div class="plugin-name">
            ${esc(pack.name)}
            <span class="badge-tag ${pack.readOnly ? '' : 'good'}">${pack.readOnly ? '🔒 Ulanzi' : 'Installed'}</span>
          </div>
          <div class="plugin-sub">${pack.files.length} icon(s)${
            pack.readOnly ? ' · managed by Ulanzi Studio' : ''
          }</div>
        </div>
        <div class="plugin-actions">
          <button class="btn ghost" data-pack-use="${esc(pack.id)}">Use</button>
          ${
            pack.readOnly
              ? ''
              : `<button class="btn danger" data-pack-remove="${esc(pack.id)}">Delete</button>`
          }
        </div>
      </div>`
    )
    .join('');

  list.querySelectorAll('[data-pack-use]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pack = packs.find((p) => p.id === btn.dataset.packUse);
      closePluginModal();
      openIconLibrary(null);
      // preselect the pack
      setTimeout(() => {
        const target = [...document.querySelectorAll('.icons-pack')].find((b) => b.dataset.pack === pack?.id);
        target?.click();
      }, 300);
    });
  });

  list.querySelectorAll('[data-pack-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pack = packs.find((p) => p.id === btn.dataset.packRemove);
      if (!confirm(`Delete the icon pack “${pack?.name || ''}”?`)) return;
      const res = await api.removeIconPack(btn.dataset.packRemove);
      if (!res.ok) return toast(res.error, true);
      toast('Icon pack deleted');
      renderInstalledIcons();
    });
  });
}

function openPluginModal() {
  renderPluginModal();
  switchInstalledTab('plugins');
  $('#plugin-modal').classList.remove('hidden');
}

function closePluginModal() {
  $('#plugin-modal').classList.add('hidden');
}

function renderPluginModal() {
  const list = $('#plugin-list');
  if (!state.plugins.length) {
    list.innerHTML = `<div class="plugin-empty">
      No plugins found.<br/>
      Install a <b>.ulanziPlugin</b> folder or ZIP, or let the app scan Ulanzi Studio's plugin folder.
    </div>`;
    return;
  }

  list.innerHTML = state.plugins
    .map((p) => {
      const actions = (p.actions || [])
        .slice(0, 5)
        .map((a) => `<span class="badge-tag">${esc(a.name)}</span>`)
        .join('');
      return `
        <div class="plugin-row${p.compatible ? '' : ' disabled'}">
          ${p.icon ? `<img class="plugin-icon" src="${esc(p.icon)}" alt="" />` : `<div class="plugin-icon">🔌</div>`}
          <div class="plugin-meta">
            <div class="plugin-name">
              ${esc(p.name)}
              <span class="badge-tag ${p.compatible ? 'good' : 'warn'}">${p.compatible ? 'JS' : 'HTML'}</span>
              <span class="badge-tag ${p.writable ? 'good' : ''}" title="${
                p.writable ? 'Installed in this app' : 'Installed by Ulanzi Studio — read only'
              }">${p.writable ? 'Installed' : '🔒 Ulanzi'}</span>
            </div>
            <div class="plugin-sub">
              ${p.version ? `v${esc(p.version)} · ` : ''}${esc(p.author || 'unknown author')} · ${(p.actions || []).length} action(s)
            </div>
            <div class="plugin-badges">${actions}</div>
          </div>
          <div class="plugin-actions">
            <button class="btn ghost" data-reveal="${esc(p.uuid)}">Show</button>
            ${
              p.writable
                ? `<button class="btn danger" data-remove="${esc(p.uuid)}">Remove</button>`
                : `<button class="btn" data-import="${esc(p.uuid)}" title="Copy into this app so you can edit or remove it">Copy</button>`
            }
          </div>
        </div>`;
    })
    .join('');

  list.querySelectorAll('[data-reveal]').forEach((btn) => {
    btn.addEventListener('click', () => api.revealPlugin(btn.dataset.reveal));
  });
  list.querySelectorAll('[data-import]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = await api.importPlugin(btn.dataset.import);
      if (!res.ok) return toast(res.error, true);
      state.plugins = res.list;
      updatePluginCount();
      renderPluginModal();
      syncPlugins();
      toast('Plugin copied — now managed by this app');
    });
  });
  list.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const uuid = btn.dataset.remove;
      const plugin = state.plugins.find((p) => p.uuid === uuid);
      if (!confirm(`Remove “${plugin?.name || uuid}”?`)) return;
      const res = await api.removePlugin(uuid);
      if (!res.ok) return toast(res.error, true);
      state.plugins = res.list;
      updatePluginCount();
      renderPluginModal();
      syncPlugins();
      toast('Plugin removed');
    });
  });
}

// -------------------------------------------------------------- key presses

const pressState = new Map();
const DOUBLE_WINDOW = 300;

function navigateRelative(step) {
  const pages = state.config.pages;
  if (pages.length < 2) return;
  const index = pages.findIndex((p) => p.id === state.config.activePageId);
  if (index < 0) return;
  const next = (index + step + pages.length) % pages.length;
  navigate(pages[next].id);
}

function runKeyAction(action) {
  if (!action || action.type === 'none') return;
  if (action.type === 'page') {
    if (action.op === 'next') return navigateRelative(1);
    if (action.op === 'prev') return navigateRelative(-1);
    navigate(action.value);
    return;
  }
  if (action.type === 'plugin') {
    api.runPluginAction(action.actionid).then((res) => {
      if (!res.ok) toast('Plugin action is not ready yet', true);
    });
    return;
  }
  api.runAction(action).then((res) => {
    if (!res.ok) toast(res.error || 'action failed', true);
  });
}

function flashKey(index) {
  const tile = $('#grid').children[index];
  if (!tile) return;
  tile.classList.add('pressed');
  setTimeout(() => tile.classList.remove('pressed'), 160);
}

function handleKeyEvent(index, pressed) {
  // The wide key is a firmware system panel; never run actions for it
  // (proto 0x0e resets the deck to its factory profile).
  if (index === WIDE_KEY_INDEX) return;
  const key = activePage().keys[index];
  if (!key) return;

  const hasHold = key.holdAction && key.holdAction.type !== 'none';
  const hasDouble = key.doubleAction && key.doubleAction.type !== 'none';
  if (!hasHold && !hasDouble) {
    if (pressed) {
      flashKey(index);
      runKeyAction(key.action);
    }
    return;
  }

  const st = pressState.get(index) || {};
  pressState.set(index, st);

  if (pressed) {
    const now = Date.now();
    if (st.lastDown && now - st.lastDown < 60) return; // key bounce / repeats
    st.lastDown = now;
    flashKey(index);

    if (st.tapTimer) {
      clearTimeout(st.tapTimer);
      st.tapTimer = null;
      if (hasDouble) {
        st.doubleFired = true;
        runKeyAction(key.doubleAction);
        return;
      }
    }
    st.held = false;
    if (hasHold) {
      st.holdTimer = setTimeout(() => {
        st.holdTimer = null;
        st.held = true;
        runKeyAction(key.holdAction);
      }, Math.max(150, Number(key.holdMs) || 500));
    }
    return;
  }

  if (st.holdTimer) {
    clearTimeout(st.holdTimer);
    st.holdTimer = null;
  }
  if (st.held) {
    st.held = false;
    return;
  }
  if (st.doubleFired) {
    st.doubleFired = false;
    return;
  }
  if (hasDouble) {
    st.tapTimer = setTimeout(() => {
      st.tapTimer = null;
      runKeyAction(key.action);
    }, DOUBLE_WINDOW);
  } else {
    runKeyAction(key.action);
  }
}

// -------------------------------------------------------------- bootstrap

function bind() {
  $('#plugins-btn').addEventListener('click', openPluginModal);
  $('#store-btn').addEventListener('click', openStoreModal);
  $('#store-modal-close').addEventListener('click', closeStoreModal);
  $('#store-modal').addEventListener('click', (e) => {
    if (e.target === $('#store-modal')) closeStoreModal();
  });
  $('#icons-close').addEventListener('click', closeIconLibrary);
  $('#icons-modal').addEventListener('click', (e) => {
    if (e.target === $('#icons-modal')) closeIconLibrary();
  });
  $('#store-signin-btn').addEventListener('click', async () => {
    const userName = $('#store-user-input').value.trim();
    const password = $('#store-pass-input').value;
    const error = $('#store-signin-error');
    error.classList.add('hidden');
    if (!userName || !password) return;
    const btn = $('#store-signin-btn');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    const res = await api.storeLogin(userName, password);
    btn.disabled = false;
    btn.textContent = 'Sign in';
    if (!res.ok) {
      error.textContent = res.error;
      error.classList.remove('hidden');
      return;
    }
    $('#store-pass-input').value = '';
    storeState.session = { signedIn: true, user: res.user };
    renderStoreChrome(true);
    await loadStoreCategories();
    await loadStoreItems(true);
  });
  $('#store-pass-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#store-signin-btn').click();
  });
  $('#store-logout').addEventListener('click', async () => {
    await api.storeLogout();
    storeState.session = { signedIn: false, user: null };
    renderStoreChrome(false);
  });
  $('#store-search').addEventListener('input', debounce(() => {
    storeState.search = $('#store-search').value.trim();
    loadStoreItems(true);
  }, 400));
  $('#store-sort').addEventListener('change', () => {
    storeState.sort = $('#store-sort').value;
    loadStoreItems(true);
  });
  $('#store-more').addEventListener('click', () => {
    storeState.page += 1;
    loadStoreItems(false);
  });
  $('#hotkey-close').addEventListener('click', closeHotkeyModal);
  $('#hotkey-exit').addEventListener('click', closeHotkeyModal);
  $('#hotkey-save').addEventListener('click', saveHotkey);
  $('#hotkey-modal').addEventListener('click', (e) => {
    if (e.target === $('#hotkey-modal')) closeHotkeyModal();
  });

  $('#app-modal-close').addEventListener('click', closeAppPicker);
  $('#app-modal').addEventListener('click', (e) => {
    if (e.target === $('#app-modal')) closeAppPicker();
  });
  $('#app-search').addEventListener('input', (e) => renderAppList(e.target.value));
  $('#plugin-modal-close').addEventListener('click', closePluginModal);
  $('#tab-plugins-btn').addEventListener('click', () => switchInstalledTab('plugins'));
  $('#tab-icons-btn').addEventListener('click', () => switchInstalledTab('icons'));
  $('#icons-open-store').addEventListener('click', () => {
    closePluginModal();
    openStoreModal();
  });
  $('#icons-open-folder').addEventListener('click', () => api.openIconsFolder());
  $('#plugin-modal').addEventListener('click', (e) => {
    if (e.target === $('#plugin-modal')) closePluginModal();
  });

  $('#plugin-install-folder').addEventListener('click', async () => {
    const res = await api.installPluginFolder();
    if (res.canceled) return;
    if (!res.ok) return toast(res.error, true);
    state.plugins = res.list;
    updatePluginCount();
    renderPluginModal();
    syncPlugins();
    toast(`Installed ${res.name}`);
  });

  $('#plugin-install-zip').addEventListener('click', async () => {
    const res = await api.installPluginZip();
    if (res.canceled) return;
    if (!res.ok) return toast(res.error, true);
    state.plugins = res.list;
    updatePluginCount();
    renderPluginModal();
    syncPlugins();
    toast(`Installed ${res.name}`);
  });

  $('#plugin-reload').addEventListener('click', async () => {
    const res = await api.reloadPlugins();
    if (!res.ok) return toast(res.error || 'Reload failed', true);
    state.plugins = res.list;
    updatePluginCount();
    renderPluginModal();
    syncPlugins();
    toast('Plugins reloaded');
  });

  $('#plugin-open-folder').addEventListener('click', () => api.openPluginsFolder());

  $('#add-page').addEventListener('click', addPage);
  $('#push-btn').addEventListener('click', pushNow);

  $('#page-title').addEventListener('input', (e) => {
    activePage().name = e.target.value;
    renderPageList();
    scheduleSave();
  });

  $('#brightness').addEventListener('input', (e) => {
    const level = parseInt(e.target.value, 10);
    state.config.settings.brightness = level;
    $('#brightness-value').textContent = level;
    clearTimeout(brightnessTimer);
    brightnessTimer = setTimeout(() => api.setBrightness(level), 120);
    scheduleSave();
  });

  $('#autopush').addEventListener('change', (e) => {
    state.config.settings.autoPush = e.target.checked;
    scheduleSave();
    if (e.target.checked) schedulePush();
  });

  $('#reconnect').addEventListener('click', async () => {
    const res = await api.reconnect();
    state.status = res.status;
    renderStatus();
    if (res.ok) {
      api.setBrightness(state.config.settings.brightness);
      api.setSleepTime(state.config.settings.sleepSeconds);
      pushNow();
    } else {
      toast('Could not open the deck — is Ulanzi Studio running?', true);
    }
  });

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      pushNow();
    }
    if (e.key === 'Escape') {
      if (!$('#hotkey-modal').classList.contains('hidden')) return closeHotkeyModal();
      if (!$('#app-modal').classList.contains('hidden')) return closeAppPicker();
      if (!$('#plugin-modal').classList.contains('hidden')) return closePluginModal();
      state.selected = null;
      renderGrid();
      renderInspector();
    }
  });

  api.onStatus((status) => {
    const wasConnected = state.status.connected;
    state.status = status;
    renderStatus();
    if (!wasConnected && status.connected) {
      api.setBrightness(state.config.settings.brightness);
      api.setSleepTime(state.config.settings.sleepSeconds);
      schedulePush();
    }
  });

  window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type !== 'ulanzi-pi-height') return;
    const frame = document.querySelector('#pi-host .pi-frame');
    if (!frame) return;
    const height = Number(data.height) || 0;
    // An inspector with no fields renders almost nothing: hide the section.
    const host = $('#pi-host');
    const field = host ? host.closest('.field') : null;
    if (height < 60) {
      if (field) field.classList.add('hidden');
      return;
    }
    if (field) field.classList.remove('hidden');
    frame.style.height = `${Math.min(560, Math.max(80, height + 4))}px`;
  });

  api.onKey(({ index, pressed }) => handleKeyEvent(index, pressed));

  api.onError((message) => toast(message, true));

  api.onPluginState(({ actionid, image }) => {
    if (image) pluginImages.set(actionid, image);
    const loc = findPluginAction(actionid);
    if (loc && loc.page.id === state.config.activePageId) {
      drawIndex(loc.index);
      schedulePush();
    }
  });

  api.onPluginSettings(({ actionid, settings }) => {
    const loc = findPluginAction(actionid);
    if (loc) {
      loc.key.action.settings = settings;
      scheduleSave();
    }
  });

  api.onPluginTitle(({ actionid, text }) => {
    const loc = findPluginAction(actionid);
    if (loc && text) {
      loc.key.label = text;
      if (loc.page.id === state.config.activePageId) drawIndex(loc.index);
      scheduleSave();
    }
  });

  api.onPluginToast((message) => {
    if (message) toast(message);
  });

  api.onPluginError((message) => toast(message, true));
  api.onPluginAlert(() => toast('Plugin error', true));

  api.onPluginsChanged(() => {
    refreshPlugins().catch((err) => toast(err.message || String(err), true));
  });

  api.onSeizePermission((needed) => {
    if (needed) {
      toast('Grant Input Monitoring to stop the wide key typing the Ulanzi URL', true);
    }
  });
  api.onBrightness(() => {
    // The device echoes the value as BCD (e.g. 0x86 for 86). The slider is
    // authoritative for the UI, so we do not rewrite it from the echo.
  });

  window.addEventListener('beforeunload', () => api.saveConfig(state.config));
}

setInterval(() => {
  const tile = document.querySelectorAll('#grid .key')[WIDE_KEY_INDEX];
  if (tile) renderSystemPanel(tile.querySelector('canvas'));
}, 30000);

(async function init() {
  const boot = await api.getState();
  state.config = boot.config;
  if (normalizeActionMeta()) scheduleSave();
  state.status = boot.status;
  state.plugins = await api.listPlugins();
  updatePluginCount();
  $('#version').textContent = boot.version;
  bind();
  renderAll();
  syncPlugins();
  if (state.status.connected) {
    api.setBrightness(state.config.settings.brightness);
    api.setSleepTime(state.config.settings.sleepSeconds);
    pushNow();
  }
})();
