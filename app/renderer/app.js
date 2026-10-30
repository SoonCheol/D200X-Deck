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
  const busy = /busy|ulanzistudio|ulanzi studio/i.test(String(message || ''));
  $('#device-name').textContent = connected ? 'Ulanzi D200' : busy ? 'Deck busy' : 'No deck found';
  $('#device-detail').textContent = connected
    ? `${info?.Dversion ? `fw ${info.Dversion} · ` : ''}${info?.SerialNumber || info?.serial || 'USB 2207:0019'}`
    : busy
      ? 'Ulanzi Studio is using it'
      : message || 'Connect the D200 over USB';
  $('#device-card').title = connected ? '' : String(message || '');
  $('#device-serial').textContent = connected ? info?.SerialNumber || info?.serial || '' : '';
  const pushBtn = $('#push-btn');
  if (pushBtn) {
    pushBtn.disabled = !connected;
    pushBtn.textContent = connected ? 'Push to deck' : 'Deck offline';
    pushBtn.title = connected ? 'Send this page to the deck' : 'Connect the deck first (or quit Ulanzi Studio)';
  }
  if (!connected) {
    const stateEl = $('#push-state');
    if (stateEl) stateEl.textContent = 'not connected';
  }
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
      $('#grid').classList.add('dragging');
    });
    btn.addEventListener('dragend', () => {
      btn.classList.remove('dragging');
      $('#grid').classList.remove('dragging');
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
      const dataUrl = await downscaleImage(await readFileAsDataUrl(file));
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

/** Shrink an image to 392 px so key images stay small in the config. */
function downscaleImage(dataUrl, size = 392) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ------------------------------------------------------------- persistence

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api.saveConfig(state.config).catch((err) => toast(`Could not save: ${err.message}`, true));
  }, 250);
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
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('#push-state').textContent = `synced ${time}`;
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
  if (state.config.activePageId === id) {
    state.selected = null;
    renderInspector();
    renderGrid();
    return;
  }
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

function clearPressTimers() {
  for (const st of pressState.values()) {
    if (st.holdTimer) clearTimeout(st.holdTimer);
    if (st.tapTimer) clearTimeout(st.tapTimer);
    st.holdTimer = null;
    st.tapTimer = null;
  }
  pressState.clear();
}

function navigate(pageId) {
  if (!state.config.pages.some((p) => p.id === pageId)) return;
  clearPressTimers();
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
          <div class="plugin-sub">${pack.files.length} ${pack.files.length === 1 ? 'icon' : 'icons'}${
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
  window.focusModal?.('plugin-modal');
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
              <span class="badge-tag ${p.compatible ? 'good' : 'warn'}">${p.compatible ? 'Compatible' : 'Not supported'}</span>
              <span class="badge-tag ${p.writable ? 'good' : ''}" title="${
                p.writable ? 'Installed in this app' : 'Installed by Ulanzi Studio — read only'
              }">${p.writable ? 'Installed' : '🔒 Ulanzi'}</span>
            </div>
            <div class="plugin-sub">
              ${p.version ? `v${esc(p.version)} · ` : ''}${esc(p.author || 'unknown author')} · ${(p.actions || []).length} ${
                (p.actions || []).length === 1 ? 'action' : 'actions'
              }
            </div>
            <div class="plugin-badges">${actions}</div>
          </div>
          <div class="plugin-actions">
            <button class="btn ghost" data-reveal="${esc(p.uuid)}">Show in Finder</button>
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
    renderStoreChrome(false);
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

  const MODAL_CLOSERS = {
    'hotkey-modal': closeHotkeyModal,
    'app-modal': closeAppPicker,
    'icons-modal': closeIconLibrary,
    'store-modal': closeStoreModal,
    'plugin-modal': closePluginModal,
  };

  function topModal() {
    const ids = Object.keys(MODAL_CLOSERS);
    for (let i = ids.length - 1; i >= 0; i--) {
      const el = document.getElementById(ids[i]);
      if (el && !el.classList.contains('hidden')) return ids[i];
    }
    return null;
  }

  function focusable(modal) {
    return [...modal.querySelectorAll('button, input, select, textarea, iframe, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.disabled && el.offsetParent !== null);
  }

  window.focusModal = (id) => {
    const modal = document.getElementById(id);
    if (!modal) return;
    const first = focusable(modal)[0];
    if (first) setTimeout(() => first.focus(), 30);
  };

  document.addEventListener('keydown', (event) => {
    const id = topModal();
    if (!id) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      MODAL_CLOSERS[id]();
      return;
    }
    if (event.key === 'Tab') {
      const modal = document.getElementById(id);
      const items = focusable(modal);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }, true);

  window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type !== 'ulanzi-pi-height') return;
    const frame = document.querySelector('#pi-host .pi-frame');
    if (!frame) return;
    const height = Number(data.height) || 0;
    const host = $('#pi-host');
    const field = host ? host.closest('.field') : null;
    // Collapse (rather than hide) an inspector that has not rendered anything
    // yet: the iframe keeps running, so it can expand again when the plugin
    // fills the form after connecting.
    const collapsed = height < 24;
    if (field) field.classList.toggle('pi-field-collapsed', collapsed);
    if (collapsed) return;
    frame.style.height = `${Math.min(560, Math.max(60, height + 4))}px`;
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
