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
function pageInfo() {
  const pages = state.config.pages;
  const index = pages.findIndex((p) => p.id === state.config.activePageId);
  return { index: index + 1, total: pages.length };
}

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
  multi: 'Multi action',
  toggle: 'Hotkey switch',
  indicator: 'Page indicator',
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

// -------------------------------------------------------------- bootstrap

function renderProfileSelect() {
  const select = $('#profile-select');
  if (!select) return;
  select.innerHTML = (state.config.profiles || [])
    .map(
      (profile) =>
        `<option value="${esc(profile.id)}" ${profile.id === state.config.activeProfileId ? 'selected' : ''}>${esc(
          profile.name
        )}</option>`
    )
    .join('');
}

function switchProfile(profileId) {
  const profile = (state.config.profiles || []).find((p) => p.id === profileId);
  if (!profile) return;
  const first = state.config.pages.find((p) => p.profileId === profileId);
  state.config.activeProfileId = profileId;
  if (first) state.config.activePageId = first.id;
  state.selected = null;
  renderAll();
  commit();
}

function addProfile() {
  const name = (prompt('Profile name', 'New profile') || '').trim();
  if (!name) return;
  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  const profile = { id, name };
  state.config.profiles.push(profile);
  const page = { id: crypto.randomUUID(), name: 'Main', profileId: id, keys: {} };
  state.config.pages.push(page);
  state.config.activeProfileId = id;
  state.config.activePageId = page.id;
  state.selected = null;
  renderAll();
  commit();
}

function updateDeckSettingsMeta() {
  const meta = $('#deck-settings-meta');
  if (!meta) return;
  const { connected, info } = state.status;
  meta.textContent = connected
    ? `Firmware ${info?.Dversion || '—'} · Serial ${info?.SerialNumber || info?.serial || '—'}`
    : 'No deck connected';
  const sleep = $('#insp-sleep');
  if (sleep) sleep.value = String(state.config.settings.sleepSeconds || 0);
}

function bind() {
  // Arrow-key navigation across the 5×3 key grid.
  $('#grid').addEventListener('keydown', (event) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const current = state.selected == null ? 0 : state.selected;
    let next = current;
    if (event.key === 'ArrowLeft') next = Math.max(0, current - 1);
    if (event.key === 'ArrowRight') next = Math.min(WIDE_KEY_INDEX - 1, current + 1);
    if (event.key === 'ArrowUp') next = Math.max(0, current - COLS);
    if (event.key === 'ArrowDown') next = Math.min(WIDE_KEY_INDEX - 1, current + COLS);
    if (next === current) return;
    state.selected = next;
    renderGrid();
    renderInspector();
    document.querySelectorAll('#grid .key')[next]?.focus();
  });

  $('#profile-select').addEventListener('change', (e) => switchProfile(e.target.value));
  $('#profile-add').addEventListener('click', addProfile);

  $('#import-btn').addEventListener('click', openImportModal);
  $('#import-close').addEventListener('click', closeImportModal);
  $('#import-modal').addEventListener('click', (e) => {
    if (e.target === $('#import-modal')) closeImportModal();
  });
  $('#import-pick').addEventListener('click', async () => {
    const res = await api.importPick();
    if (!res.ok || res.canceled) return res.ok ? null : toast(res.error, true);
    importSources = [...(res.profiles || []), ...importSources];
    renderImportSources();
    if (res.profiles?.length) selectImportSource(res.profiles[0]);
  });
  $('#import-run').addEventListener('click', runImport);

  $('#plugins-btn').addEventListener('click', openPluginModal);
  $('#store-btn').addEventListener('click', openStoreModal);
  $('#store-modal-close').addEventListener('click', closeStoreModal);
  $('#store-modal').addEventListener('click', (e) => {
    if (e.target === $('#store-modal')) closeStoreModal();
  });
  $('#icons-search').addEventListener('input', debounce(() => {
    iconLibraryQuery = $('#icons-search').value;
    const active = document.querySelector('.icons-pack.active');
    const pack = iconLibraryPacks.find((p) => p.id === active?.dataset.pack);
    if (pack) renderIconGrid(pack);
  }, 180));
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

  $('#deck-settings-btn').addEventListener('click', () => {
    const sheet = $('#deck-settings');
    const open = sheet.classList.toggle('hidden');
    if (!open) updateDeckSettingsMeta();
  });
  $('#deck-settings-close').addEventListener('click', () => $('#deck-settings').classList.add('hidden'));
  $('#deck-settings-reconnect').addEventListener('click', () => api.reconnect());
  $('#insp-sleep-apply').addEventListener('click', async () => {
    const seconds = Math.max(0, parseInt($('#insp-sleep').value || '0', 10));
    state.config.settings.sleepSeconds = seconds;
    scheduleSave();
    const res = await api.setSleepTime(seconds);
    toast(res.ok ? `Sleep set to ${seconds}s` : res.error, !res.ok);
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
    'import-modal': closeImportModal,
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

/** Fill in real app icons for app keys that have none (runs once after load). */
async function hydrateAppIcons() {
  let changed = false;
  for (const page of state.config.pages) {
    for (const [index, key] of Object.entries(page.keys)) {
      if (!key || key.icon || !key.action || key.action.type !== 'app' || !key.action.value) continue;
      const icon = await api.appIcon(String(key.action.value));
      if (!icon) continue;
      key.icon = icon;
      key.iconSource = 'app';
      changed = true;
      if (page.id === state.config.activePageId) drawIndex(Number(index));
    }
  }
  if (changed) {
    commit(false);
    renderGrid();
  }
}

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
  hydrateAppIcons();
  syncPlugins();
  if (state.status.connected) {
    api.setBrightness(state.config.settings.brightness);
    api.setSleepTime(state.config.settings.sleepSeconds);
    pushNow();
  }
})();
