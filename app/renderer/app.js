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
  // Count only the active profile's pages: navigation and the indicator dots
  // are scoped to the profile, so the number must be too.
  const pages = state.config.pages.filter((p) => p.profileId === state.config.activeProfileId);
  const index = pages.findIndex((p) => p.id === state.config.activePageId);
  return { index: index + 1, total: Math.max(1, pages.length) };
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
  sound: 'Play audio',
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
  const pages = state.config.pages || [];
  const current = pages.find((p) => p.id === state.config.activePageId);
  if (current) return current;
  // Never fall back to a page from another profile: that produced an editable
  // "ghost" page whose sidebar entry did not exist.
  return (
    pages.find((p) => p.profileId === state.config.activeProfileId) || pages[0] || null
  );
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
  let out = key;
  if (Array.isArray(key.states) && key.states.length > 1) {
    const index = Math.min(key.states.length - 1, Math.max(0, Number(key.stateIndex) || 0));
    const state = key.states[index] || {};
    out = {
      ...key,
      emoji: state.emoji ?? key.emoji,
      label: state.label ?? key.label,
      icon: state.icon ?? key.icon,
    };
  }
  const id = out.action?.type === 'plugin' ? out.action.actionid : null;
  if (id && pluginImages.has(id)) return { ...out, icon: pluginImages.get(id), emoji: '' };
  return out;
}

function bumpKeyState(actionid, index) {
  for (const page of state.config.pages) {
    for (const [slot, key] of Object.entries(page.keys)) {
      if (!key?.action || key.action.type !== 'plugin' || key.action.actionid !== actionid) continue;
      key.stateIndex = Math.max(0, Number(index) || 0);
      if (page.id === state.config.activePageId) drawIndex(Number(slot));
      scheduleSave();
      schedulePush();
    }
  }
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

let profileModalTarget = 'new';

function openProfileModal(mode) {
  profileModalTarget = mode;
  const editing = mode === 'edit';
  const profile = (state.config.profiles || []).find((p) => p.id === state.config.activeProfileId);
  $('#profile-title').textContent = editing ? 'Manage profile' : 'New profile';
  $('#profile-name').value = editing ? profile?.name || '' : '';
  $('#profile-delete-row').classList.toggle('hidden', !editing);
  $('#profile-delete').disabled = (state.config.profiles || []).length <= 1;
  $('#profile-modal').classList.remove('hidden');
  window.focusModal?.('profile-modal');
  setTimeout(() => $('#profile-name').focus(), 40);
}

function closeProfileModal() {
  $('#profile-modal').classList.add('hidden');
}

function saveProfile() {
  const name = $('#profile-name').value.trim();
  if (!name) return toast('Give the profile a name', true);
  const editingProfile = (state.config.profiles || []).find(
    (p) => p.id === state.config.activeProfileId
  );
  const clash = (state.config.profiles || []).some(
    (p) =>
      p.name.trim().toLowerCase() === name.toLowerCase() &&
      (profileModalTarget === 'new' || p.id !== editingProfile?.id)
  );
  if (clash) return toast('A profile with that name already exists', true);
  if (profileModalTarget === 'new') {
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    state.config.profiles.push({ id, name });
    const page = { id: crypto.randomUUID(), name: 'Main', profileId: id, keys: {} };
    state.config.pages.push(page);
    state.config.activeProfileId = id;
    state.config.activePageId = page.id;
  } else {
    const profile = (state.config.profiles || []).find((p) => p.id === state.config.activeProfileId);
    if (!profile) return;
    profile.name = name;
  }
  state.selected = null;
  closeProfileModal();
  renderAll();
  commit();
}

function deleteCurrentProfile() {
  const profiles = state.config.profiles || [];
  if (profiles.length <= 1) return toast('At least one profile is required', true);
  const profile = profiles.find((p) => p.id === state.config.activeProfileId);
  if (!profile) return;
  if (!confirm(`Delete profile “${profile.name}” and its pages?`)) return;
  state.config.profiles = profiles.filter((p) => p.id !== profile.id);
  state.config.pages = state.config.pages.filter((p) => p.profileId !== profile.id);
  const nextProfile = state.config.profiles[0];
  const nextPage = state.config.pages.find((p) => p.profileId === nextProfile.id);
  state.config.activeProfileId = nextProfile.id;
  state.config.activePageId = nextPage?.id || state.config.pages[0]?.id;
  state.selected = null;
  closeProfileModal();
  renderAll();
  commit();
}

async function refreshAccessibility() {
  const stateEl = $('#accessibility-state');
  if (!stateEl) return;
  try {
    const res = await api.accessibility();
    stateEl.textContent = res.trusted ? 'granted' : 'needed for hotkeys/text';
    stateEl.style.color = res.trusted ? 'var(--good)' : 'var(--warn)';
  } catch {
    stateEl.textContent = 'unknown';
  }
}

let keyClipboard = null;
let lastCleared = null;

function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function anyModalOpen() {
  return ['hotkey-modal', 'app-modal', 'icons-modal', 'store-modal', 'plugin-modal', 'import-modal', 'profile-modal']
    .some((id) => {
      const el = document.getElementById(id);
      return el && !el.classList.contains('hidden');
    });
}

function copySelectedKey() {
  const page = activePage();
  if (!page || state.selected == null) return false;
  const key = page.keys[state.selected];
  if (!key) return false;
  keyClipboard = JSON.parse(JSON.stringify(key));
  toast('Key copied');
  return true;
}

function pasteKeyIntoSelection() {
  const page = activePage();
  if (!page || state.selected == null) return false;
  if (!keyClipboard) return false;
  lastCleared = { pageId: page.id, index: state.selected, key: page.keys[state.selected] || null };
  const copy = JSON.parse(JSON.stringify(keyClipboard));
  if (copy.action && copy.action.type === 'plugin') copy.action.actionid = uuid();
  if (copy.holdAction && copy.holdAction.type === 'plugin') copy.holdAction.actionid = uuid();
  if (copy.doubleAction && copy.doubleAction.type === 'plugin') copy.doubleAction.actionid = uuid();
  page.keys[state.selected] = copy;
  commit();
  renderGrid();
  renderInspector();
  toast('Key pasted');
  return true;
}

function clearSelectedKey() {
  const page = activePage();
  if (!page || state.selected == null) return false;
  const existing = page.keys[state.selected];
  if (!existing) return false;
  const index = state.selected;
  lastCleared = { pageId: page.id, index, key: existing };
  delete page.keys[index];
  // Deselect: the inspector lazily creates a key for the selected slot, which
  // would put the "deleted" key straight back.
  state.selected = null;
  commit();
  renderGrid();
  renderInspector();
  toast('Key cleared — ⌘Z to undo');
  return true;
}

function undoLastClear() {
  if (!lastCleared) return false;
  const page = state.config.pages.find((p) => p.id === lastCleared.pageId);
  if (!page) return false;
  if (lastCleared.key) page.keys[lastCleared.index] = lastCleared.key;
  else delete page.keys[lastCleared.index];
  state.config.activePageId = page.id;
  state.selected = lastCleared.index;
  lastCleared = null;
  commit();
  renderAll();
  toast('Restored');
  return true;
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
  document.addEventListener('keydown', (event) => {
    if (anyModalOpen() || isTypingTarget(event.target)) return;
    const mod = event.metaKey || event.ctrlKey;
    const key = String(event.key || '').toLowerCase();
    if (mod && key === 'c') {
      if (copySelectedKey()) event.preventDefault();
      return;
    }
    if (mod && key === 'v') {
      if (pasteKeyIntoSelection()) event.preventDefault();
      return;
    }
    if (mod && key === 'z') {
      if (undoLastClear()) event.preventDefault();
      return;
    }
    if (!mod && (event.key === 'Delete' || event.key === 'Backspace')) {
      if (clearSelectedKey()) event.preventDefault();
    }
  });

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
  $('#profile-add').addEventListener('click', () => openProfileModal('new'));
  $('#profile-edit').addEventListener('click', () => openProfileModal('edit'));
  $('#profile-modal-close').addEventListener('click', closeProfileModal);
  $('#profile-modal').addEventListener('click', (e) => {
    if (e.target === $('#profile-modal')) closeProfileModal();
  });
  $('#profile-save').addEventListener('click', saveProfile);
  $('#profile-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveProfile();
  });
  $('#profile-delete').addEventListener('click', deleteCurrentProfile);

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
    if (!open) {
      updateDeckSettingsMeta();
      refreshAccessibility();
    }
  });
  $('#deck-settings-close').addEventListener('click', () => $('#deck-settings').classList.add('hidden'));
  document.addEventListener('click', (event) => {
    const sheet = $('#deck-settings');
    if (!sheet || sheet.classList.contains('hidden')) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('#deck-settings-close')) {
      sheet.classList.add('hidden');
      return;
    }
    if (sheet.contains(target) || target.closest('#deck-settings-btn')) return;
    sheet.classList.add('hidden');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#deck-settings').classList.contains('hidden')) {
      $('#deck-settings').classList.add('hidden');
    }
  });
  $('#deck-settings-reconnect').addEventListener('click', () => api.reconnect());
  $('#accessibility-grant').addEventListener('click', async () => {
    const res = await api.requestAccessibility();
    toast(res.trusted ? 'Already granted — opening System Settings' : 'Opening System Settings…');
    setTimeout(refreshAccessibility, 1500);
  });
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
    'profile-modal': closeProfileModal,
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

  api.onPluginStateIndex(({ actionid, state: index }) => bumpKeyState(actionid, index));

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
