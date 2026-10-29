'use strict';

const api = window.deckApp;
const renderKey = window.KeyRenderer.drawKey;

const COLS = 5;
const ROWS = 3;
// 13 square keys + one 2x1 key: 14 physical buttons.
const KEY_COUNT = 14;
const WIDE_KEY_INDEX = 13;

const ACTION_LABELS = {
  none: 'Do nothing',
  open: 'Open app / URL',
  command: 'Run shell command',
  hotkey: 'Send hotkey',
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
};

let saveTimer = null;
let pushTimer = null;
let brightnessTimer = null;

const $ = (sel) => document.querySelector(sel);

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

    btn.addEventListener('click', () => {
      state.selected = i;
      renderGrid();
      renderInspector();
    });

    btn.addEventListener('dragover', (e) => {
      e.preventDefault();
      btn.classList.add('drag');
    });
    btn.addEventListener('dragleave', () => btn.classList.remove('drag'));
    btn.addEventListener('drop', async (e) => {
      e.preventDefault();
      btn.classList.remove('drag');
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
      const key = effectiveKey(page.keys[i] || emptyKey());
      const wide = i === WIDE_KEY_INDEX;
      return renderKey(tile.querySelector('canvas'), key, wide ? 402 : 196, 196);
    })
  );
}

function drawIndex(index) {
  const tile = $('#grid').children[index];
  if (!tile) return;
  const key = effectiveKey(activePage().keys[index] || emptyKey());
  const wide = index === WIDE_KEY_INDEX;
  renderKey(tile.querySelector('canvas'), key, wide ? 402 : 196, 196);
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

function renderInspector() {
  const el = $('#inspector');
  const page = activePage();

  if (state.selected === null) {
    const configured = Object.values(page.keys).filter(
      (k) => k && (k.label || k.emoji || k.icon || (k.action && k.action.type !== 'none'))
    ).length;
    el.innerHTML = `
      <div class="insp-head"><h2>Page settings</h2><span class="index">${configured}/${KEY_COUNT} keys</span></div>
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
  if (action.type === 'open') {
    valueField = `<input class="input" id="insp-value" placeholder="Safari, /Applications/Foo.app, or https://…" value="${esc(action.value)}" />`;
  } else if (action.type === 'command') {
    valueField = `<textarea class="textarea" id="insp-value" placeholder="osascript -e 'set volume output muted'">${esc(action.value)}</textarea>`;
  } else if (action.type === 'hotkey') {
    valueField = `<input class="input" id="insp-value" placeholder="cmd+shift+3" value="${esc(action.value)}" />`;
  } else if (action.type === 'page') {
    valueField = `<select class="select" id="insp-value">${pageOptions}</select>`;
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
        <div class="field">
          <label>Settings (JSON)</label>
          <textarea class="textarea" id="insp-plugin-settings" placeholder="{}">${esc(
            JSON.stringify(action.settings || {}, null, 2)
          )}</textarea>
        </div>
        <div class="insp-empty" style="padding:0;font-size:11px">
          ${plugin ? `Live images come from <b>${esc(plugin.name)}</b>.` : 'Choose a plugin action.'}
          Property-inspector UI is not supported yet; edit settings as JSON.
        </div>
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
        ${liveKey.icon ? `<img src="${esc(liveKey.icon)}" alt="" />` : `<div style="width:46px;height:46px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.05);font-size:20px">${esc(key.emoji || '＋')}</div>`}
        <div class="meta">
          <div class="file-name">${key.icon ? 'Custom image' : liveKey.icon ? 'Live plugin image' : 'No image'}</div>
          <div>Drop an image here or click to choose</div>
        </div>
      </div>
      ${key.icon ? '<button class="btn danger icon-remove" id="insp-icon-remove">Remove image</button>' : ''}
    </div>

    <div class="field">
      <label>Label</label>
      <div class="emoji-row">
        <input class="input" id="insp-emoji" maxlength="16" value="${esc(key.emoji)}" placeholder="Text or emoji" />
        <input class="color-input" id="insp-color" type="color" value="${esc(key.color || '#1b2130')}" title="Background" />
      </div>
      <div class="field-hint">Shrinks to fit · 10 characters max</div>
    </div>

    <div class="field">
      <label>Caption</label>
      <input class="input" id="insp-label" maxlength="40" value="${esc(key.label)}" placeholder="Optional small text under the key" />
    </div>

    <div class="field">
      <label>Action</label>
      <select class="select" id="insp-action-type">
        ${Object.entries(ACTION_LABELS)
          .map(([v, l]) => `<option value="${v}" ${v === action.type ? 'selected' : ''}>${l}</option>`)
          .join('')}
      </select>
    </div>

    ${valueField && action.type !== 'plugin' ? `<div class="field"><label>${action.type === 'hotkey' ? 'Combination' : action.type === 'page' ? 'Target page' : 'Value'}</label>${valueField}</div>` : ''}
    ${pluginFields}

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
    drawIndex(state.selected);
    commit();
    renderInspector();
  });

  const removeImage = $('#insp-icon-remove');
  if (removeImage) {
    removeImage.addEventListener('click', () => {
      key.icon = null;
      drawIndex(state.selected);
      commit();
      renderInspector();
    });
  }

  $('#insp-emoji').addEventListener('input', (e) => {
    key.emoji = e.target.value;
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
    drawIndex(state.selected);
    commit(false);
  });
  $('#insp-action-type').addEventListener('change', (e) => {
    const type = e.target.value;
    if (type === 'plugin') {
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
      }
      key.action = { type, value };
    }
    commit(false);
    renderInspector();
  });

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
    valueEl.addEventListener('input', (e) => {
      key.action = { type: key.action.type, value: e.target.value };
      commit(false);
    });
    valueEl.addEventListener('change', (e) => {
      key.action = { type: key.action.type, value: e.target.value };
      commit(false);
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
  for (let i = 0; i < KEY_COUNT; i++) {
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

function openPluginModal() {
  renderPluginModal();
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
              <span class="badge-tag">${p.writable ? 'App' : 'Ulanzi'}</span>
            </div>
            <div class="plugin-sub">
              ${p.version ? `v${esc(p.version)} · ` : ''}${esc(p.author || 'unknown author')} · ${(p.actions || []).length} action(s)
            </div>
            <div class="plugin-badges">${actions}</div>
          </div>
          <div class="plugin-actions">
            <button class="btn ghost" data-reveal="${esc(p.uuid)}">Show</button>
            ${p.writable ? `<button class="btn danger" data-remove="${esc(p.uuid)}">Remove</button>` : ''}
          </div>
        </div>`;
    })
    .join('');

  list.querySelectorAll('[data-reveal]').forEach((btn) => {
    btn.addEventListener('click', () => api.revealPlugin(btn.dataset.reveal));
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

// -------------------------------------------------------------- bootstrap

function bind() {
  $('#plugins-btn').addEventListener('click', openPluginModal);
  $('#plugin-modal-close').addEventListener('click', closePluginModal);
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

  api.onKey(({ index, pressed }) => {
    if (!pressed) return;
    const tile = $('#grid').children[index];
    if (tile) {
      tile.classList.add('pressed');
      setTimeout(() => tile.classList.remove('pressed'), 160);
    }
    // The wide key is a firmware system panel; do not send vendor commands
    // here (proto 0x0e resets the deck to its factory profile).
    if (index === WIDE_KEY_INDEX) return;
    const key = activePage().keys[index];
    if (!key || !key.action) return;
    if (key.action.type === 'page') {
      navigate(key.action.value);
      return;
    }
    if (key.action.type === 'plugin') {
      api.runPluginAction(key.action.actionid).then((res) => {
        if (!res.ok) toast('Plugin action is not ready yet', true);
      });
      return;
    }
    if (key.action.type === 'none') return;
    api.runAction(key.action).then((res) => {
      if (!res.ok) toast(res.error || 'action failed', true);
    });
  });

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

(async function init() {
  const boot = await api.getState();
  state.config = boot.config;
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
