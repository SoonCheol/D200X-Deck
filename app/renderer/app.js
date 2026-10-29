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
};

const state = {
  config: null,
  status: { connected: false, message: 'Not connected', info: null },
  selected: null,
  pushing: false,
  pushAgain: false,
  draggingBrightness: false,
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
      const key = page.keys[i] || emptyKey();
      const wide = i === WIDE_KEY_INDEX;
      return renderKey(tile.querySelector('canvas'), key, wide ? 402 : 196, 196);
    })
  );
}

function drawIndex(index) {
  const tile = $('#grid').children[index];
  if (!tile) return;
  const key = activePage().keys[index] || emptyKey();
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

  el.innerHTML = `
    <div class="insp-head">
      <h2>${state.selected === WIDE_KEY_INDEX ? 'Wide key' : `Key ${state.selected + 1}`}</h2>
      <span class="index">${state.selected === WIDE_KEY_INDEX ? 'row 3 · col 4–5 (2×1)' : `row ${Math.floor(state.selected / COLS) + 1} · col ${(state.selected % COLS) + 1}`}</span>
    </div>

    <div class="field">
      <label>Icon</label>
      <div class="icon-drop" id="insp-icon-drop">
        ${key.icon ? `<img src="${esc(key.icon)}" alt="" />` : `<div style="width:46px;height:46px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.05);font-size:20px">${esc(key.emoji || '＋')}</div>`}
        <div class="meta">
          <div class="file-name">${key.icon ? 'Custom image' : 'No image'}</div>
          <div>Drop an image here or click to choose</div>
        </div>
      </div>
    </div>

    <div class="field">
      <label>Emoji</label>
      <div class="emoji-row">
        <input class="input emoji-input" id="insp-emoji" maxlength="8" value="${esc(key.emoji)}" placeholder="🙂" />
        <input class="color-input" id="insp-color" type="color" value="${esc(key.color || '#1b2130')}" title="Background" />
      </div>
    </div>

    <div class="field">
      <label>Label</label>
      <input class="input" id="insp-label" maxlength="40" value="${esc(key.label)}" placeholder="Shown at the bottom" />
    </div>

    <div class="field">
      <label>Action</label>
      <select class="select" id="insp-action-type">
        ${Object.entries(ACTION_LABELS)
          .map(([v, l]) => `<option value="${v}" ${v === action.type ? 'selected' : ''}>${l}</option>`)
          .join('')}
      </select>
    </div>

    ${valueField ? `<div class="field"><label>${action.type === 'hotkey' ? 'Combination' : action.type === 'page' ? 'Target page' : 'Value'}</label>${valueField}</div>` : ''}

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
    let value = '';
    if (type === 'page') {
      value = state.config.pages.find((p) => p.id !== page.id)?.id || page.id;
    }
    key.action = { type, value };
    commit(false);
    renderInspector();
  });

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

// -------------------------------------------------------------- bootstrap

function bind() {
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
    const key = activePage().keys[index];
    if (!key || !key.action) return;
    if (key.action.type === 'page') {
      navigate(key.action.value);
      return;
    }
    if (key.action.type === 'none') return;
    api.runAction(key.action).then((res) => {
      if (!res.ok) toast(res.error || 'action failed', true);
    });
  });

  api.onError((message) => toast(message, true));
  api.onBrightness((raw) => {
    if (document.activeElement === $('#brightness')) return;
    const percent = Math.round((raw / 255) * 100);
    $('#brightness').value = percent;
    $('#brightness-value').textContent = percent;
  });

  window.addEventListener('beforeunload', () => api.saveConfig(state.config));
}

(async function init() {
  const boot = await api.getState();
  state.config = boot.config;
  state.status = boot.status;
  $('#version').textContent = boot.version;
  bind();
  renderAll();
  if (state.status.connected) {
    api.setBrightness(state.config.settings.brightness);
    api.setSleepTime(state.config.settings.sleepSeconds);
    pushNow();
  }
})();
