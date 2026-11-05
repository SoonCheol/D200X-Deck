'use strict';

/* global actionMeta, addPage, applyInspectorState, basename, clearPressTimers, closeAppPicker, closeHotkeyModal, closeIconLibrary, closeImportModal, closeInspector, closeInspectorDrawer, closePluginMenu, closePluginModal, closeStoreModal, commit, downscaleBackground, drawIndex, flashKey, handleKeyEvent, iconLibraryPacks, iconLibraryQuery, INSPECTOR_BREAKPOINT, importSources, inspectorDrawerOpen, loadSdStore, loadStoreCategories, loadStoreItems, navigate, openAppPicker, openImportModal, openInspectorDrawer, openPluginModal, openStoreModal, pushNow, refreshPlugins, refreshWideStats, renderAll, renderAppList, renderGrid, renderIconGrid, renderImportSources, renderInspector, renderPageList, renderPluginModal, renderPushButton, renderSdStoreList, renderStandbySlices, renderStatus, renderStoreChrome, renderSyncState, resetImportState, runImport, saveHotkey, scheduleAutoExit, scheduleLivePush, schedulePush, scheduleSave, sdStore, selectImportSource, selectStoreSource, storeState, switchInstalledTab, syncPlugins, toast, toggleInspector, uniquePageName, updatePluginCount */

const api = window.deckApp;
const renderKey = window.KeyRenderer.drawKey;
const { planProfileImport } = window.DeckProfileImport;

const ACTION_ICON_PATHS = {
  'page:next': 'assets/actions/page-next.svg',
  'page:prev': 'assets/actions/page-prev.svg',
  'page:goto': 'assets/actions/page-goto.svg',
  'page:back': 'assets/actions/page-back.svg',
  'page:profile': 'assets/actions/page-profile.svg',
  'page:folder': 'assets/actions/page-folder.svg',
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
  'multi:switch': 'assets/actions/multi-switch.svg',
  'multi:random': 'assets/actions/multi-random.svg',
  toggle: 'assets/actions/toggle.svg',
  timer: 'assets/actions/timer.svg',
  brightness: 'assets/actions/brightness.svg',
  'brightness:up': 'assets/actions/brightness-up.svg',
  'brightness:down': 'assets/actions/brightness-down.svg',
  sound: 'assets/actions/sound.svg',
  'sound:stop': 'assets/actions/sound-stop.svg',
  pop: 'assets/actions/pop.svg',
};

/** Bundled icon for an action, used when the key has no custom image/emoji. */
function actionIconSrc(action) {
  if (!action) return null;
  if (action.type === 'page') {
    const op = ['next', 'prev', 'goto', 'back', 'profile'].includes(action.op) ? action.op : 'goto';
    if (op === 'goto' && action.value) {
      const target = state.config?.pages?.find((page) => page.id === action.value);
      if (target?.parentId) return ACTION_ICON_PATHS['page:folder'] || null;
    }
    return ACTION_ICON_PATHS[`page:${op}`] || null;
  }
  if (action.type === 'multi') {
    const mode = action.mode || 'sequence';
    if (mode === 'alternate') return ACTION_ICON_PATHS['multi:switch'] || null;
    if (mode === 'random') return ACTION_ICON_PATHS['multi:random'] || null;
    return ACTION_ICON_PATHS.multi || null;
  }
  if (action.type === 'sound') {
    return (action.op === 'stop' ? ACTION_ICON_PATHS['sound:stop'] : ACTION_ICON_PATHS.sound) || null;
  }
  if (action.type === 'brightness') {
    return (
      ACTION_ICON_PATHS[action.op === 'down' ? 'brightness:down' : 'brightness:up'] || null
    );
  }
  if (action.type === 'media') return ACTION_ICON_PATHS[`media:${action.op}`] || null;
  return ACTION_ICON_PATHS[action.type] || null;
}

// Emoji the app used to assign automatically before action icons existed.
// These are migrated away from keys and treated as auto so an existing key
// picks up its SVG instead of showing a stale emoji.
const LEGACY_DEFAULT_EMOJI = {
  app: new Set(['📱']),
  url: new Set(['🌐']),
  media: new Set(['⏯️', '⏭️', '⏮️', '🔊', '🔉', '🔇', '🎵']),
  hotkey: new Set(['⌨️']),
  close: new Set(['✖️']),
  command: new Set(['💻']),
  page: new Set(['➡️', '⬅️', '📄', '↩️']),
  timer: new Set(['⏱️']),
  brightness: new Set(['🔅', '🔆']),
  pop: new Set(['💬']),
  sound: new Set(['🔊']),
  plugin: new Set(['🔌']),
};
const LEGACY_AUTO_EMOJI = new Set([
  ...Object.values(LEGACY_DEFAULT_EMOJI).flatMap((set) => [...set]),
]);

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
  // Removing a custom icon falls back to the action's own icon; `iconCleared`
  // only stops app icons from being re-hydrated automatically.
  if (key.icon || key.face === 'text') return null;
  // A Type text key shows the typed text itself. An empty one falls back to
  // its bundled text icon.
  if (key.action?.type === 'text') {
    return key.emoji ? null : actionIconSrc(key.action);
  }
  return isAutoEmoji(key) ? actionIconSrc(key.action) : null;
}

/**
 * Bring keys created before action icons/emoji-sync up to date: fill emoji and
 * caption from the action when they were never customised.
 */
function normalizeActionMeta() {
  let changed = false;
  const sources = [
    ...state.config.pages.map((page) => page.keys),
    ...(state.config.profiles || []).map((profile) => profile.pinned || {}),
  ];
  for (const keys of sources) {
    for (const key of Object.values(keys)) {
      if (!key || !key.action) continue;
      if (key.action.type === 'plugin' && key.emoji === '🔌' && !key.emojiAuto) {
        key.emoji = '';
        changed = true;
      }
      const legacyEmoji = LEGACY_DEFAULT_EMOJI[key.action.type];
      if (
        legacyEmoji &&
        legacyEmoji.has(key.emoji) &&
        (!key.emojiAuto || key.emoji === key.emojiAuto)
      ) {
        key.emoji = '';
        delete key.emojiAuto;
        changed = true;
      }
      if (key.action.type === 'text') {
        const text = String(key.action.value || '').trim();
        const emojiIsAuto = !key.emoji || key.emoji === key.emojiAuto || key.emoji === '⌨️';
        if (emojiIsAuto && key.emoji !== (text || '⌨️')) {
          key.emoji = text || '⌨️';
          key.emojiAuto = text || '⌨️';
          changed = true;
        }
        const labelIsAuto = !key.label || key.label === key.labelAuto || key.label === 'Type text';
        if (labelIsAuto) {
          const desired = text ? '' : 'Type text';
          if (key.label !== desired) {
            key.label = desired;
            if (desired) key.labelAuto = desired;
            else delete key.labelAuto;
            changed = true;
          }
        }
        continue;
      }
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

// 13 square keys + one 2x1 key: 14 physical buttons.
const { COLUMNS: COLS, ROWS, KEY_COUNT, WIDE_INDEX: WIDE_KEY_INDEX } = window.DeckGeometry;

const ACTION_LABELS = window.DeckActions.ACTION_LABELS;

const state = {
  config: null,
  status: { connected: false, message: 'Not connected', info: null },
  selected: null,
  pushing: false,
  pushAgain: false,
  backgroundPush: false,
  unsynced: false,
  plugins: [],
  apps: [],
};

let saveTimer = null;
let pushTimer = null;
let brightnessTimer = null;
let pageSettingsFlashTimer = null;

const $ = (sel) => document.querySelector(sel);

/** Keep the narrow-window drawer below the toolbar, whatever its wrapped height. */
function syncToolbarHeight() {
  const toolbar = document.querySelector('.toolbar');
  if (!toolbar) return;
  document.documentElement.style.setProperty('--toolbar-h', `${toolbar.offsetHeight}px`);
}

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

/** Pinned keys belong to a profile and are visible on all of its pages. */
function pinnedFor(profileId = state.config.activeProfileId) {
  return (state.config.profiles || []).find((p) => p.id === profileId)?.pinned || {};
}

/** The key a slot shows: page key first, then the profile's pinned key. */
function keyAt(page, index) {
  if (!page) return null;
  return page.keys?.[index] || pinnedFor(page.profileId)[index] || null;
}

function isPinnedSlot(page, index) {
  return Boolean(page && !page.keys?.[index] && pinnedFor(page.profileId)[index]);
}

function backgroundFor(page) {
  if (!page) return null;
  if (page.background) return page.background;
  const profile = (state.config.profiles || []).find((p) => p.id === page.profileId);
  return profile?.background || null;
}

// Live images pushed by plugins, keyed by actionid. Stream Deck plugins can
// push one image per state.
const pluginImages = new Map();
const pluginStateImages = new Map();
const pluginStateTitles = new Map();

// Runtime output for `command` actions with "Show output on key". Keyed by the
// key object, so it never leaks into config.json. Timers live in commandTimers.
const commandOutputs = new WeakMap();
const commandTimers = new Map();

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
  if (
    out.action?.type === 'plugin' &&
    out.action.plugin &&
    !(state.plugins || []).some((plugin) => plugin.uuid === out.action.plugin && plugin.compatible)
  ) {
    out = { ...out, missingPlugin: true };
  }
  if (id) {
    const stateIndex = Math.max(0, Number(out.stateIndex) || 0);
    let next = out;
    let touched = false;
    if (pluginStateImages.has(`${id}:${stateIndex}`)) {
      next = { ...next, icon: pluginStateImages.get(`${id}:${stateIndex}`), emoji: '', liveImage: true };
      touched = true;
    } else if (pluginImages.has(id)) {
      next = { ...next, icon: pluginImages.get(id), emoji: '', liveImage: true };
      touched = true;
    }
    if (pluginStateTitles.has(`${id}:${stateIndex}`)) {
      next = { ...next, label: pluginStateTitles.get(`${id}:${stateIndex}`) };
      touched = true;
    }
    if (touched) return next;
  }
  const runtime = commandOutputs.get(key);
  if (runtime) {
    if (runtime.image) {
      return { ...out, icon: runtime.image, emoji: '', face: 'icon', liveImage: true };
    }
    if (runtime.text) {
      return { ...out, label: runtime.text, emoji: '', icon: null, face: 'text', liveImage: false };
    }
  }
  return out;
}

function bumpKeyState(actionid, index) {
  const next = Math.max(0, Number(index) || 0);
  for (const page of state.config.pages) {
    for (const [slot, key] of Object.entries(page.keys)) {
      if (!key?.action || key.action.type !== 'plugin' || key.action.actionid !== actionid) continue;
      if (key.stateIndex === next) continue;
      key.stateIndex = next;
      if (page.id === state.config.activePageId) {
        Promise.resolve(drawIndex(Number(slot))).then(() => scheduleLivePush(Number(slot)));
      }
      scheduleSave();
    }
  }
  for (const profile of state.config.profiles || []) {
    for (const [slot, key] of Object.entries(profile.pinned || {})) {
      if (!key?.action || key.action.type !== 'plugin' || key.action.actionid !== actionid) continue;
      if (key.stateIndex === next) continue;
      key.stateIndex = next;
      if (profile.id === state.config.activeProfileId && !activePage()?.keys?.[slot]) {
        Promise.resolve(drawIndex(Number(slot))).then(() => scheduleLivePush(Number(slot)));
      }
      scheduleSave();
    }
  }
}

function pluginLocVisible(loc) {
  if (!loc || loc.page.id !== state.config.activePageId) return false;
  return !loc.profileId || loc.profileId === state.config.activeProfileId;
}

function findPluginAction(actionid) {
  for (const page of state.config.pages) {
    for (const [index, key] of Object.entries(page.keys)) {
      if (key?.action?.type === 'plugin' && key.action.actionid === actionid) {
        return { page, index: Number(index), key };
      }
    }
  }
  for (const profile of state.config.profiles || []) {
    for (const [index, key] of Object.entries(profile.pinned || {})) {
      if (key?.action?.type === 'plugin' && key.action.actionid === actionid) {
        return { page: activePage(), index: Number(index), key, pinned: true, profileId: profile.id };
      }
    }
  }
  return null;
}

// ------------------------------------------------------- command output keys

function commandInterval(action) {
  return Math.min(86_400, Math.max(5, Math.round(Number(action.outputInterval) || 30)));
}

let commandSyncTimer = null;

/** Debounced by commit(), so typing a command does not start it mid-word. */
function scheduleCommandOutputSync() {
  clearTimeout(commandSyncTimer);
  commandSyncTimer = setTimeout(() => {
    commandSyncTimer = null;
    syncCommandOutputs();
  }, 500);
}

function keyLocation(key) {
  for (const page of state.config.pages || []) {
    for (const [index, candidate] of Object.entries(page.keys || {})) {
      if (candidate === key) return { page, index: Number(index), pinned: false };
    }
  }
  for (const profile of state.config.profiles || []) {
    for (const [index, candidate] of Object.entries(profile.pinned || {})) {
      if (candidate === key) {
        return { page: activePage(), index: Number(index), pinned: true, profileId: profile.id };
      }
    }
  }
  return null;
}

function commandKeyVisible(loc) {
  if (!loc) return false;
  return loc.pinned
    ? loc.profileId === state.config.activeProfileId && !activePage()?.keys?.[loc.index]
    : loc.page.id === state.config.activePageId;
}

/** Start/stop periodic command-output timers to match the current config. */
function syncCommandOutputs() {
  if (!state.config) return;
  const wanted = new Set();
  const clearEntry = (key, entry) => {
    clearInterval(entry.timer);
    clearTimeout(entry.startTimer);
    commandTimers.delete(key);
    commandOutputs.delete(key);
    const loc = keyLocation(key);
    if (commandKeyVisible(loc)) {
      Promise.resolve(drawIndex(loc.index)).then(() => scheduleLivePush(loc.index));
    }
  };
  const consider = (key) => {
    const action = key?.action;
    if (!action || action.type !== 'command' || action.showOutput !== true) return;
    const command = String(action.value || '').trim();
    if (!command) return;
    wanted.add(key);
    const interval = commandInterval(action);
    const signature = `${command}\u0000${interval}`;
    const existing = commandTimers.get(key);
    if (existing && existing.signature === signature) return;
    if (existing) clearEntry(key, existing);
    const entry = { signature, timer: null, startTimer: null, running: false, pending: false };
    const tick = async () => {
      if (commandTimers.get(key) !== entry) return;
      // A key that is not on screen does not need the output, and with the
      // editor hidden and no deck nothing displays it at all. Running those
      // commands anyway was pure churn.
      if (!commandKeyVisible(keyLocation(key))) return;
      if (document.hidden && !state.status.connected) return;
      if (entry.running) {
        entry.pending = true;
        return;
      }
      entry.running = true;
      try {
        const out = await api.runCommandOutput(command);
        if (commandTimers.get(key) !== entry) return;
        if (!out?.ok) {
          commandOutputs.set(key, { image: '', text: '—' });
        } else if (out.image) {
          commandOutputs.set(key, { image: out.image, text: '' });
        } else {
          commandOutputs.set(key, { image: '', text: String(out.text || '').slice(0, 120) });
        }
        const loc = keyLocation(key);
        if (commandKeyVisible(loc)) {
          Promise.resolve(drawIndex(loc.index)).then(() => scheduleLivePush(loc.index));
        }
      } catch {
        commandOutputs.set(key, { image: '', text: '—' });
      } finally {
        entry.running = false;
        if (entry.pending) {
          entry.pending = false;
          entry.tick();
        }
      }
    };
    entry.tick = tick;
    entry.timer = setInterval(tick, interval * 1000);
    entry.startTimer = setTimeout(tick, 600);
    commandTimers.set(key, entry);
  };
  for (const page of state.config.pages || []) {
    for (const key of Object.values(page.keys || {})) consider(key);
  }
  for (const profile of state.config.profiles || []) {
    for (const key of Object.values(profile.pinned || {})) consider(key);
  }
  for (const [key, entry] of commandTimers) {
    if (!wanted.has(key)) clearEntry(key, entry);
  }
}

/**
 * Refresh the command-output keys that are on screen now. Called after a page
 * or profile change, and when the window becomes visible, so a key that was
 * skipped while hidden shows current output instead of a stale one.
 */
function tickVisibleCommandOutputs() {
  for (const [key, entry] of commandTimers) {
    if (commandKeyVisible(keyLocation(key))) entry.tick();
  }
}

/** Re-run a command immediately after its key is pressed. */
function refreshCommandOutput(action) {
  for (const [key, entry] of commandTimers) {
    if (key.action === action && typeof entry.tick === 'function') entry.tick();
  }
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

// Remember the page each profile was last on (memory only).
const lastPageByProfile = new Map();

function switchProfile(profileId) {
  if (typeof clearPressTimers === 'function') clearPressTimers();
  const profile = (state.config.profiles || []).find((p) => p.id === profileId);
  if (!profile) return;
  if (state.config.activeProfileId === profileId) return;
  const current = activePage();
  if (current) lastPageByProfile.set(current.profileId, current.id);
  const pages = state.config.pages.filter((p) => p.profileId === profileId);
  const remembered = pages.find((p) => p.id === lastPageByProfile.get(profileId));
  const next = remembered || pages[0];
  state.config.activeProfileId = profileId;
  if (next) state.config.activePageId = next.id;
  state.selected = null;
  renderAll();
  commit();
  if (typeof tickVisibleCommandOutputs === 'function') tickVisibleCommandOutputs();
}

let profileModalTarget = 'new';
let profileDraft = { appPath: '', appName: '', background: null };

function renderProfileDraft() {
  const app = $('#profile-app-name');
  if (app) app.textContent = profileDraft.appPath ? profileDraft.appName || basename(profileDraft.appPath) : 'No app';
  const bg = $('#profile-bg-name');
  if (bg) bg.textContent = profileDraft.background ? 'Custom image' : 'None';
}

function setProfileApp(appPath, appName) {
  profileDraft.appPath = appPath || '';
  profileDraft.appName = appName || (appPath ? basename(appPath) : '');
  renderProfileDraft();
}

function openProfileModal(mode) {
  profileModalTarget = mode;
  const editing = mode === 'edit';
  const profile = (state.config.profiles || []).find((p) => p.id === state.config.activeProfileId);
  $('#profile-export').classList.toggle('hidden', !editing);
  $('#profile-import').classList.toggle('hidden', !editing);
  profileDraft = {
    appPath: editing ? profile?.appPath || '' : '',
    appName: editing ? profile?.appName || '' : '',
    background: editing ? profile?.background || null : null,
  };
  $('#profile-title').textContent = editing ? 'Manage profile' : 'New profile';
  $('#profile-name').value = editing ? profile?.name || '' : '';
  $('#profile-delete-row').classList.toggle('hidden', !editing);
  $('#profile-delete').disabled = (state.config.profiles || []).length <= 1;
  renderProfileDraft();
  $('#profile-modal').classList.remove('hidden');
  window.focusModal?.('profile-modal');
  setTimeout(() => $('#profile-name').focus(), 40);
}

function closeProfileModal() {
  $('#profile-modal').classList.add('hidden');
}

async function exportActiveProfile() {
  const profile = (state.config.profiles || []).find((p) => p.id === state.config.activeProfileId);
  if (!profile) return;
  const pages = state.config.pages
    .filter((page) => page.profileId === profile.id)
    .map((page) => JSON.parse(JSON.stringify(page)));
  const payload = {
    format: 'ulanzi-deck-open-profile',
    version: 1,
    exportedAt: new Date().toISOString(),
    name: profile.name,
    profile: {
      name: profile.name,
      icon: profile.icon || null,
      appPath: profile.appPath || '',
      appName: profile.appName || '',
      background: profile.background || null,
      pinned: JSON.parse(JSON.stringify(profile.pinned || {})),
    },
    pages,
  };
  const res = await api.exportProfile(payload);
  if (res.canceled) return;
  toast(res.ok ? 'Profile exported' : res.error || 'Export failed', !res.ok);
}

function remapImportedAction(action, idMap) {
  if (!action || typeof action !== 'object') return action;
  const out = JSON.parse(JSON.stringify(action));
  if (out.type === 'plugin') out.actionid = uuid();
  if (out.type === 'page' && out.op === 'goto' && idMap.has(out.value)) {
    out.value = idMap.get(out.value);
  }
  if (Array.isArray(out.steps)) {
    out.steps = out.steps.map((step) => {
      if (!step || typeof step !== 'object') return step;
      if (step.action && typeof step.action === 'object') {
        return { ...step, action: remapImportedAction(step.action, idMap) };
      }
      return remapImportedAction(step, idMap);
    });
  }
  return out;
}

function remapImportedKeys(keys, idMap) {
  const out = {};
  for (const [index, raw] of Object.entries(keys || {})) {
    if (!raw || typeof raw !== 'object') continue;
    const key = JSON.parse(JSON.stringify(raw));
    for (const field of ['action', 'holdAction', 'doubleAction']) {
      if (key[field]) key[field] = remapImportedAction(key[field], idMap);
    }
    out[index] = key;
  }
  return out;
}

function importProfileData(data, { replace = false } = {}) {
  const plan = planProfileImport(data, {
    profiles: state.config.profiles || [],
    pages: state.config.pages || [],
    uuid,
    basename,
    remapKeys: remapImportedKeys,
    replace,
    keepPageIds: replace,
  });
  state.config.profiles = plan.profiles;
  state.config.pages = plan.pages;
  state.config.activeProfileId = plan.activeProfileId;
  state.config.activePageId = plan.activePageId;
  state.selected = null;
  closeProfileModal();
  renderAll();
  commit();
  toast(`${plan.replaced ? 'Replaced' : 'Imported'} profile “${plan.name}” (${plan.pageCount} pages)`);
}

/** Visit every action inside an imported profile, including multi-action steps. */
function eachImportedAction(data, fn) {
  const walkAction = (action) => {
    if (!action || typeof action !== 'object') return;
    fn(action);
    if (Array.isArray(action.steps)) {
      for (const step of action.steps) {
        if (!step || typeof step !== 'object') continue;
        // Steps are normally {action}, but the canonical normaliser also accepts
        // a bare action object; both must be scanned for commands. A bare plugin
        // step's `action` is its UUID, so only an object is a nested action.
        const nested = step.action && typeof step.action === 'object' ? step.action : step;
        walkAction(nested);
      }
    }
  };
  const walkKeys = (keys) => {
    for (const key of Object.values(keys || {})) {
      if (!key || typeof key !== 'object') continue;
      for (const field of ['action', 'holdAction', 'doubleAction']) walkAction(key[field]);
    }
  };
  for (const page of data.pages || []) walkKeys(page && page.keys);
  if (data.profile && data.profile.pinned) walkKeys(data.profile.pinned);
}

function importedCommandActions(data) {
  const commands = [];
  eachImportedAction(data, (action) => {
    if (action.type === 'command') commands.push(String(action.value || '').trim());
  });
  return commands.filter(Boolean);
}

function importedCustomLinks(data) {
  const links = [];
  const { schemeOf, isBlockedScheme } = window.DeckUrlSafety;
  eachImportedAction(data, (action) => {
    if (action.type !== 'url') return;
    const value = String(action.value || '').trim();
    const scheme = schemeOf(value);
    if (scheme && scheme !== 'http' && scheme !== 'https' && scheme !== 'mailto' && !isBlockedScheme(scheme)) {
      links.push(value);
    }
  });
  return [...new Set(links)];
}

async function importProfileFromFile() {
  const res = await api.importProfile();
  if (res.canceled) return;
  if (!res.ok) return toast(res.error || 'Could not import profile', true);
  // A shared profile is a document, but a command action runs /bin/sh. Never
  // execute one that arrived in a file without the user seeing what it does.
  const commands = importedCommandActions(res.data);
  if (commands.length) {
    const shown = commands.slice(0, 3).map((cmd) => `• ${cmd.length > 90 ? `${cmd.slice(0, 90)}…` : cmd}`);
    const extra = commands.length > shown.length ? `\n…and ${commands.length - shown.length} more` : '';
    const ok = confirm(
      `This profile contains ${commands.length} shell command${commands.length === 1 ? '' : 's'} that run with your user permissions when you press the key:\n\n${shown.join('\n')}${extra}\n\nImport it?`
    );
    if (!ok) return;
    eachImportedAction(res.data, (action) => {
      if (action.type !== 'command') return;
      action.imported = true;
      // A shared profile must not start running commands on a timer; the user
      // can opt in after reviewing the command in the inspector.
      delete action.showOutput;
      delete action.outputInterval;
    });
  }
  const links = importedCustomLinks(res.data);
  if (links.length) {
    const shown = links.slice(0, 10).join('\n');
    const extra = links.length > 10 ? `\n…and ${links.length - 10} more` : '';
    const ok = confirm(
      `This profile opens ${links.length} custom link${links.length === 1 ? '' : 's'} in other apps:\n\n${shown}${extra}\n\nOnly import it if you trust the profile.`
    );
    if (!ok) return;
  }
  const wanted = String(res.data.profile?.name || res.data.name || 'Imported profile').trim();
  const sameName = (state.config.profiles || []).find(
    (p) => p.name.trim().toLowerCase() === wanted.toLowerCase()
  );
  const replace =
    Boolean(sameName) &&
    confirm(
      `A profile named “${sameName.name}” already exists.\n\nOK replaces its pages and settings, keeping the name. Cancel asks whether to import a second copy.`
    );
  if (sameName && !replace) {
    const copy = confirm(`Import “${sameName.name}” as a second copy instead?`);
    if (!copy) return;
  }
  try {
    importProfileData(res.data, { replace });
  } catch (err) {
    toast(err.message || String(err), true);
  }
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
  const linked = {};
  if (profileDraft.appPath) {
    linked.appPath = profileDraft.appPath;
    linked.appName = profileDraft.appName || basename(profileDraft.appPath);
  }
  if (profileDraft.background) linked.background = profileDraft.background;
  if (profileModalTarget === 'new') {
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    state.config.profiles.push({ id, name, ...linked });
    const page = { id: crypto.randomUUID(), name: 'Main', profileId: id, keys: {} };
    state.config.pages.push(page);
    state.config.activeProfileId = id;
    state.config.activePageId = page.id;
  } else {
    const profile = (state.config.profiles || []).find((p) => p.id === state.config.activeProfileId);
    if (!profile) return;
    profile.name = name;
    if (linked.appPath) {
      profile.appPath = linked.appPath;
      profile.appName = linked.appName;
    } else {
      delete profile.appPath;
      delete profile.appName;
    }
    if (linked.background) profile.background = linked.background;
    else delete profile.background;
  }
  state.selected = null;
  closeProfileModal();
  renderAll();
  commit();
}

async function deleteCurrentProfile() {
  const profiles = state.config.profiles || [];
  if (profiles.length <= 1) return toast('At least one profile is required', true);
  const profile = profiles.find((p) => p.id === state.config.activeProfileId);
  if (!profile) return;
  const pages = state.config.pages.filter((p) => p.profileId === profile.id).length;
  const ok = await confirmAction({
    title: `Delete “${profile.name}”?`,
    message: `This removes the profile and its ${pages} page${pages === 1 ? '' : 's'}. This can’t be undone.`,
    confirmLabel: 'Delete profile',
  });
  if (!ok) return;
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
    stateEl.textContent = res.trusted ? 'Granted' : 'Not granted';
    stateEl.style.color = res.trusted ? 'var(--good)' : 'var(--warn)';
  } catch {
    stateEl.textContent = 'Unknown';
  }
}

let updateInfo = null;

function friendlyUpdateError(message) {
  const text = String(message || '');
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|network|fetch failed/i.test(text)) {
    return "Couldn't reach GitHub. Check your connection and try again.";
  }
  if (/rate limit|403/i.test(text)) return 'GitHub is rate-limiting update checks. Try again later.';
  return text || 'Update check failed.';
}

function renderUpdateStatus(info = updateInfo) {
  const row = $('#update-status-row');
  const status = $('#update-status');
  const release = $('#update-release');
  if (!row || !status) return;
  if (info?.update) {
    row.classList.remove('hidden');
    status.textContent = `Update ${info.latest} available.`;
    release?.classList.remove('hidden');
  } else if (info?.error) {
    row.classList.remove('hidden');
    status.textContent = friendlyUpdateError(info.error);
    release?.classList.add('hidden');
  } else if (info?.checkedAt) {
    row.classList.remove('hidden');
    status.textContent = 'Up to date.';
    release?.classList.add('hidden');
  } else {
    row.classList.add('hidden');
    release?.classList.add('hidden');
  }
  if (info?.current && $('#app-version')) $('#app-version').textContent = info.current;
}

function showUpdateModal(info) {
  if (!info?.latest) return;
  updateInfo = info;
  $('#update-sub').textContent = `Ulanzi Deck Open ${info.latest} is available. You have ${info.current}.`;
  $('#update-notes').textContent = info.notes || 'Open the release page for the full release notes.';
  $('#update-modal').classList.remove('hidden');
  window.focusModal?.('update-modal');
}

function closeUpdateModal() {
  $('#update-modal')?.classList.add('hidden');
}

function openDeckSettings(tab = 'display') {
  const sheet = $('#deck-settings');
  if (!sheet) return;
  closeInspectorDrawer();
  sheet.classList.remove('hidden');
  selectSettingsTab(tab);
  updateDeckSettingsMeta();
  refreshAccessibility();
}

/** Ask for an image file and return a data URL, or null when cancelled. */
async function pickImageData() {
  const res = await api.pickImage();
  if (!res || res.canceled) return null;
  if (res.ok === false) {
    toast(res.error || 'Could not read that image', true);
    return null;
  }
  return res.data || null;
}

function openTipsModal() {
  $('#tips-modal')?.classList.remove('hidden');
  window.focusModal?.('tips-modal');
}

function closeTipsModal() {
  $('#tips-modal')?.classList.add('hidden');
}

function openAboutModal() {
  $('#about-modal')?.classList.remove('hidden');
  window.focusModal?.('about-modal');
}

function closeAboutModal() {
  $('#about-modal')?.classList.add('hidden');
}

let confirmResolve = null;

/**
 * In-app replacement for window.confirm(). Cancel is focused by default, and
 * the returned promise settles from the button, Escape or the backdrop.
 */
function confirmAction({ title = 'Confirm', message = '', confirmLabel = 'Confirm', tone = 'danger' } = {}) {
  const modal = $('#confirm-modal');
  if (!modal) return Promise.resolve(false);
  if (confirmResolve) {
    const previous = confirmResolve;
    confirmResolve = null;
    previous(false);
  }
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  const ok = $('#confirm-ok');
  ok.textContent = confirmLabel;
  ok.classList.toggle('danger-solid', tone === 'danger');
  ok.classList.toggle('primary', tone === 'primary');
  modal.classList.remove('hidden');
  window.focusModal?.('confirm-modal');
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

function closeConfirmModal(result = false) {
  const resolve = confirmResolve;
  confirmResolve = null;
  $('#confirm-modal')?.classList.add('hidden');
  if (resolve) resolve(Boolean(result));
}

function openReleasePage() {
  if (updateInfo?.url) api.openExternal(updateInfo.url);
  closeUpdateModal();
}

let keyClipboard = null;
let lastCleared = null;
let lastPageCleared = null;

function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function anyModalOpen() {
  return ['confirm-modal', 'hotkey-modal', 'app-modal', 'icons-modal', 'store-modal', 'plugin-modal', 'import-modal', 'profile-modal', 'update-modal', 'about-modal']
    .some((id) => {
      const el = document.getElementById(id);
      return el && !el.classList.contains('hidden');
    });
}

function copySelectedKey() {
  const page = activePage();
  if (!page || state.selected == null) return false;
  const key = keyAt(page, state.selected);
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
  lastPageCleared = null;
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
  if (isPinnedSlot(page, state.selected)) {
    toast('This key is pinned — unpin it first', true);
    return false;
  }
  const existing = page.keys[state.selected];
  if (!existing) return false;
  const index = state.selected;
  lastCleared = { pageId: page.id, index, key: existing };
  lastPageCleared = null;
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
  if (lastPageCleared) {
    const page = state.config.pages.find((p) => p.id === lastPageCleared.pageId);
    if (page) {
      page.keys = lastPageCleared.keys;
      state.config.activePageId = page.id;
      state.selected = lastPageCleared.selected ?? null;
      lastPageCleared = null;
      lastCleared = null;
      commit();
      renderAll();
      toast('Page restored');
      return true;
    }
    lastPageCleared = null;
  }
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

function selectSettingsTab(name) {
  document.querySelectorAll('[data-settings-tab]').forEach((button) => {
    const active = button.dataset.settingsTab === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.settingsPanel !== name);
  });
}

/** Roving tabindex + arrow keys for a tab group; clicks still select. */
function wireTabs(selector) {
  const tabs = [...document.querySelectorAll(selector)];
  const sync = () => tabs.forEach((tab) => {
    tab.tabIndex = tab.classList.contains('active') ? 0 : -1;
  });
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => setTimeout(sync, 0));
    tab.addEventListener('keydown', (event) => {
      const index = tabs.indexOf(tab);
      let next = null;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      else if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
      else if (event.key === 'Home') next = tabs[0];
      else if (event.key === 'End') next = tabs[tabs.length - 1];
      if (!next) return;
      event.preventDefault();
      next.focus();
      next.click();
    });
  });
  sync();
}

let seizeState = null;

const SEIZE_NOTE = 'Key capture stops the Deck’s firmware from typing its setup URL into the frontmost app.';
const SEIZE_NOTES = {
  permission: `${SEIZE_NOTE} Grant Input Monitoring to Ulanzi Deck Open, then relaunch.`,
  privilege:
    'macOS refused to let the helper take over the Deck’s keyboard. No permission setting changes this, so the ' +
    'Deck’s firmware can still type its setup URL into the frontmost app.',
};

function renderSeizeState() {
  const row = $('#seize-row');
  const label = $('#seize-state');
  if (!row || !label) return;
  const note = $('#seize-note');
  if (!seizeState) {
    row.classList.add('hidden');
    note?.classList.add('hidden');
    return;
  }
  row.classList.remove('hidden');
  const running = seizeState.running === true;
  label.textContent = seizeState.message || (running ? 'Capturing keys' : 'Not running');
  label.classList.toggle('settings-warn', !running);
  $('#seize-grant')?.classList.toggle('hidden', seizeState.need !== 'permission');
  if (note) note.textContent = SEIZE_NOTES[seizeState.need] || SEIZE_NOTE;
  note?.classList.toggle('hidden', running);
}

function updateDeckSettingsMeta() {
  const meta = $('#deck-settings-meta');
  if (!meta) return;
  const { connected, info } = state.status;
  meta.textContent = connected
    ? `Firmware ${info?.Dversion || '—'} · Serial ${info?.SerialNumber || info?.serial || '—'}`
    : 'No Deck connected';
  const sleep = $('#insp-sleep');
  if (sleep) sleep.value = String(state.config.settings.sleepSeconds || 0);
  const standbyInput = $('#standby-seconds');
  if (standbyInput) standbyInput.value = String(state.config.settings.standbySeconds || 0);
  const standbyState = $('#standby-image-state');
  if (standbyState) standbyState.textContent = state.config.settings.standbyImage ? 'Custom image' : 'None';
  const launch = $('#launch-login');
  if (launch) launch.checked = state.config.settings.launchAtLogin === true;
  const updateCheck = $('#update-check');
  if (updateCheck) updateCheck.checked = state.config.settings.updateCheck !== false;
  const updateHours = $('#update-hours');
  if (updateHours) updateHours.value = String(state.config.settings.updateHours || 6);
  const lockToggle = $('#lock-screen');
  if (lockToggle) lockToggle.checked = state.config.settings.lockScreen === true;
  const lockState = $('#lock-image-state');
  if (lockState) {
    lockState.textContent = state.config.settings.lockImage
      ? 'Custom image'
      : state.config.settings.standbyImage
        ? 'Using standby image'
        : 'None';
  }
  const standbyHint = $('#standby-hint');
  if (standbyHint) {
    const seconds = Number(state.config.settings.standbySeconds) || 0;
    standbyHint.textContent = seconds
      ? `Clock${state.config.settings.standbyImage ? ' over your wallpaper' : ''} after ${seconds}s of no key presses. The first press only wakes it.`
      : 'Show a clock (and optional wallpaper) when idle. The first press only wakes the Deck.';
  }
}

// --------------------------------------------------------- frontmost app

let frontmostTimer = null;

/**
 * Follow the app in front: a profile linked to that app becomes active.
 * Polling `lsappinfo` avoids Accessibility/automation permissions.
 */
function startFrontmostWatch() {
  if (frontmostTimer) return;
  frontmostTimer = setInterval(async () => {
    if (!state.config) return;
    const linked = (state.config.profiles || []).filter((profile) => profile.appPath);
    if (!linked.length) return;
    if (anyModalOpen()) return;
    const front = await api.frontmostApp().catch(() => null);
    if (!front || front.bundleId === 'com.edufalcao.ulanzideckopen') return;
    const norm = (value) => String(value || '').replace(/\/+$/, '').toLowerCase();
    const match = linked.find(
      (profile) =>
        (front.path && norm(profile.appPath) === norm(front.path)) ||
        (profile.appName && front.name && profile.appName.toLowerCase() === String(front.name).toLowerCase())
    );
    if (match && match.id !== state.config.activeProfileId) switchProfile(match.id);
  }, 3000);
}

// ------------------------------------------------------- standby screensaver

const standby = { active: false, timer: null, refresh: null };
const lock = { active: false, refresh: null };

function lockActive() {
  return lock.active;
}

function stopLock() {
  if (lock.refresh) clearInterval(lock.refresh);
  lock.refresh = null;
  lock.active = false;
}

function lockImageSrc() {
  return state.config?.settings?.lockImage || state.config?.settings?.standbyImage || null;
}

async function pushLockFrame() {
  return api.pushPage(
    await renderStandbySlices({ standbyImage: lockImageSrc(), standbyClock: true })
  );
}

async function enterLockScreen() {
  if (!state.config?.settings?.lockScreen || !state.status.connected || lock.active) return;
  standby.active = false;
  clearStandbyTimers();
  lock.active = true;
  try {
    const res = await pushLockFrame();
    if (!res.ok) throw new Error(res.error || 'push failed');
    lock.refresh = setInterval(async () => {
      if (!lock.active || !state.status.connected) return;
      try {
        await pushLockFrame();
      } catch {
        /* keep the last frame */
      }
    }, 30_000);
  } catch {
    stopLock();
  }
}

async function exitLockScreen() {
  if (!lock.active) return;
  stopLock();
  await pushNow();
  scheduleStandby();
}

function standbyActive() {
  return standby.active;
}

function standbySeconds() {
  return Math.max(0, Number(state.config?.settings?.standbySeconds) || 0);
}

function clearStandbyTimers() {
  if (standby.timer) clearTimeout(standby.timer);
  if (standby.refresh) clearInterval(standby.refresh);
  standby.timer = null;
  standby.refresh = null;
}

function scheduleStandby() {
  clearStandbyTimers();
  if (standby.active || lockActive() || !state.status.connected || !standbySeconds()) return;
  standby.timer = setTimeout(enterStandby, standbySeconds() * 1000);
}

/** Any deck key press resets the idle countdown. */
function noteActivity() {
  if (standby.active) return;
  scheduleStandby();
  scheduleAutoExit();
}

async function pushStandbyFrame() {
  const images = await renderStandbySlices(state.config.settings);
  return api.pushPage(images);
}

async function enterStandby() {
  standby.timer = null;
  if (standby.active || lockActive() || !state.status.connected || !standbySeconds()) return;
  standby.active = true;
  try {
    const res = await pushStandbyFrame();
    if (!res.ok) throw new Error(res.error || 'push failed');
    standby.refresh = setInterval(async () => {
      if (!standby.active) return;
      if (!state.status.connected) {
        standby.active = false;
        clearStandbyTimers();
        return;
      }
      try {
        await pushStandbyFrame();
      } catch {
        /* keep the last frame */
      }
    }, 30_000);
  } catch {
    standby.active = false;
    scheduleStandby();
  }
}

async function exitStandby() {
  if (!standby.active) return;
  standby.active = false;
  clearStandbyTimers();
  await pushNow();
  scheduleStandby();
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
  $('#profile-export').addEventListener('click', exportActiveProfile);
  $('#profile-import').addEventListener('click', importProfileFromFile);
  $('#profile-app-pick').addEventListener('click', () => openAppPicker('profile'));
  $('#profile-app-clear').addEventListener('click', () => setProfileApp('', ''));
  $('#profile-bg-pick').addEventListener('click', async () => {
    const picked = await pickImageData();
    if (!picked) return;
    profileDraft.background = await downscaleBackground(picked);
    renderProfileDraft();
  });
  $('#profile-bg-clear').addEventListener('click', () => {
    profileDraft.background = null;
    renderProfileDraft();
  });

  $('#import-btn').addEventListener('click', openImportModal);
  $('#import-close').addEventListener('click', closeImportModal);
  $('#import-cancel').addEventListener('click', closeImportModal);
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
  $('#import-mode').addEventListener('change', () => resetImportState());

  $('#plugins-btn').addEventListener('click', openPluginModal);
  $('#store-btn').addEventListener('click', () => openStoreModal());
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
  document.querySelectorAll('[data-store-source]').forEach((button) => {
    button.addEventListener('click', () => selectStoreSource(button.dataset.storeSource));
  });
  $('#sdstore-search').addEventListener('input', (e) => {
    sdStore.query = e.target.value;
    renderSdStoreList();
  });
  $('#sdstore-refresh').addEventListener('click', () => loadSdStore(true));
  $('#icons-open-store').addEventListener('click', () => {
    closePluginModal();
    openStoreModal('ulanzi-icons');
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
  $('#plugin-open-sd-folder')?.addEventListener('click', () => api.openSdPluginsFolder());
  $('#plugin-open-log')?.addEventListener('click', () => api.openPluginLog());
  const pluginMore = $('#plugin-more');
  const pluginMenu = $('#plugin-more-menu');
  pluginMore?.addEventListener('click', (event) => {
    event.stopPropagation();
    const hidden = pluginMenu.classList.toggle('hidden');
    pluginMore.setAttribute('aria-expanded', String(!hidden));
  });
  pluginMenu?.querySelectorAll('.menu-item').forEach((item) => {
    item.addEventListener('click', () => closePluginMenu());
  });
  document.addEventListener('click', (event) => {
    if (!pluginMenu || pluginMenu.classList.contains('hidden')) return;
    if (!event.target.closest('.menu-wrap')) closePluginMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePluginMenu();
  });

  $('#add-page').addEventListener('click', addPage);
  $('#page-back').addEventListener('click', () => {
    const parent = activePage()?.parentId;
    if (parent) navigate(parent);
  });
  $('#push-btn').addEventListener('click', () => {
    const button = $('#push-btn');
    if (button.getAttribute('aria-disabled') !== 'true') {
      pushNow();
      return;
    }
    if (state.pushing) return;
    if (!state.status.connected) {
      const busy = /busy|ulanzistudio|ulanzi studio/i.test(String(state.status.message || ''));
      toast(busy ? 'Quit Ulanzi Studio, then reconnect' : 'Connect the D200 first', true);
      return;
    }
    if (state.config?.settings?.autoPush && !state.unsynced) {
      toast('Auto-push is on — changes go to the Deck automatically. Turn it off in Deck settings to push manually.');
    }
  });
  $('#page-settings-btn').addEventListener('click', () => {
    state.selected = null;
    renderGrid();
    renderInspector();
    openInspectorDrawer();
    const inspector = $('#inspector');
    if (!inspector) return;
    inspector.scrollTop = 0;
    // Pressing the button while Page settings is already open must still give
    // feedback: pulse the panel it is pointing at.
    inspector.classList.remove('attention');
    void inspector.offsetWidth;
    inspector.classList.add('attention');
    clearTimeout(pageSettingsFlashTimer);
    pageSettingsFlashTimer = setTimeout(() => inspector.classList.remove('attention'), 800);
  });
  // One delegated close handler serves Page settings, key and wide-key headers.
  $('#inspector').addEventListener('click', (event) => {
    if (event.target.closest('#insp-drawer-close')) closeInspector();
  });
  $('#drawer-scrim').addEventListener('click', closeInspector);
  $('#inspector-toggle').addEventListener('click', toggleInspector);
  window.addEventListener('resize', () => {
    syncToolbarHeight();
    if (window.innerWidth > INSPECTOR_BREAKPOINT) closeInspectorDrawer();
    applyInspectorState();
  });
  syncToolbarHeight();
  applyInspectorState();

  $('#page-title').addEventListener('input', (e) => {
    const page = activePage();
    const value = String(e.target.value).slice(0, 40);
    if (e.target.value !== value) e.target.value = value;
    page.name = value;
    renderPageList();
    scheduleSave();
  });
  $('#page-title').addEventListener('change', () => {
    const page = activePage();
    const name = uniquePageName(page.name, page.profileId, page.id);
    if (name === page.name) return;
    page.name = name;
    $('#page-title').value = name;
    renderPageList();
    scheduleSave();
  });

  $('#deck-settings-btn').addEventListener('click', () => {
    const sheet = $('#deck-settings');
    const open = sheet.classList.toggle('hidden');
    if (!open) {
      closeInspectorDrawer();
      openDeckSettings();
    }
  });
  document.querySelectorAll('[data-settings-tab]').forEach((button) => {
    button.addEventListener('click', () => selectSettingsTab(button.dataset.settingsTab));
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
  $('#seize-grant').addEventListener('click', () => {
    api.openInputMonitoring();
    toast('Opening System Settings…');
  });
  $('#insp-sleep-apply').addEventListener('click', async () => {
    const seconds = Math.max(0, parseInt($('#insp-sleep').value || '0', 10));
    state.config.settings.sleepSeconds = seconds;
    scheduleSave();
    const res = await api.setSleepTime(seconds);
    toast(res.ok ? `Sleep set to ${seconds}s` : res.error, !res.ok);
  });

  $('#check-updates').addEventListener('click', async () => {
    const button = $('#check-updates');
    button.disabled = true;
    const res = await api.checkForUpdates();
    button.disabled = false;
    updateInfo = res;
    renderUpdateStatus(res);
    if (res.update) showUpdateModal(res);
    else if (!res.ok) toast(friendlyUpdateError(res.error), true);
    else toast(`You're up to date (${res.current})`);
  });
  $('#update-check').addEventListener('change', () => {
    state.config.settings.updateCheck = $('#update-check').checked;
    scheduleSave();
    api.refreshUpdateSchedule();
  });
  $('#update-hours').addEventListener('change', () => {
    state.config.settings.updateHours = Number($('#update-hours').value) || 6;
    scheduleSave();
    api.refreshUpdateSchedule();
  });
  $('#update-release').addEventListener('click', openReleasePage);
  $('#update-modal-open').addEventListener('click', openReleasePage);
  $('#update-later').addEventListener('click', closeUpdateModal);
  $('#update-close').addEventListener('click', closeUpdateModal);
  $('#update-modal').addEventListener('click', (event) => {
    if (event.target === $('#update-modal')) closeUpdateModal();
  });
  wireTabs('[data-settings-tab]');
  wireTabs('[data-store-source]');
  wireTabs('[data-plugin-tab]');
  $('#tips-btn').addEventListener('click', openTipsModal);
  $('#tips-close').addEventListener('click', closeTipsModal);
  $('#tips-modal').addEventListener('click', (event) => {
    if (event.target === $('#tips-modal')) closeTipsModal();
  });
  $('#confirm-ok').addEventListener('click', () => closeConfirmModal(true));
  $('#confirm-cancel').addEventListener('click', () => closeConfirmModal(false));
  $('#confirm-modal').addEventListener('click', (event) => {
    if (event.target === $('#confirm-modal')) closeConfirmModal(false);
  });
  $('#connect-banner-reconnect').addEventListener('click', async () => {
    const res = await api.reconnect();
    toast(res.ok ? 'Deck connected' : 'Still no Deck — check the USB cable or quit Ulanzi Studio', !res.ok);
  });
  $('#about-open').addEventListener('click', openAboutModal);
  $('#about-close').addEventListener('click', closeAboutModal);
  $('#about-modal').addEventListener('click', (event) => {
    if (event.target === $('#about-modal')) closeAboutModal();
  });
  $('#about-site').addEventListener('click', () => api.openExternal('https://edufalcao.com'));
  $('#about-github').addEventListener('click', () =>
    api.openExternal('https://github.com/edufalcao/ulanzi-deck-open')
  );

  $('#launch-login').addEventListener('change', async () => {
    const enabled = $('#launch-login').checked;
    state.config.settings.launchAtLogin = enabled;
    scheduleSave();
    const res = await api.setLoginItem(enabled);
    toast(res.ok ? (enabled ? 'Launch at login on' : 'Launch at login off') : res.error || 'Could not change login item', !res.ok);
  });
  $('#lock-screen').addEventListener('change', async () => {
    state.config.settings.lockScreen = $('#lock-screen').checked;
    scheduleSave();
    updateDeckSettingsMeta();
    if (!state.config.settings.lockScreen && lock.active) await exitLockScreen();
    toast(state.config.settings.lockScreen ? 'Lock screensaver on' : 'Lock screensaver off');
  });
  $('#lock-image').addEventListener('click', async () => {
    const picked = await pickImageData();
    if (!picked) return;
    state.config.settings.lockImage = await downscaleBackground(picked);
    scheduleSave();
    updateDeckSettingsMeta();
    if (lock.active) {
      stopLock();
      await enterLockScreen();
    }
    toast('Lock image set');
  });
  $('#lock-image-clear').addEventListener('click', () => {
    state.config.settings.lockImage = null;
    scheduleSave();
    updateDeckSettingsMeta();
    toast('Lock image cleared');
  });

  $('#standby-apply').addEventListener('click', () => {
    const seconds = Math.max(0, Math.round(Number($('#standby-seconds').value) || 0));
    state.config.settings.standbySeconds = seconds;
    scheduleSave();
    updateDeckSettingsMeta();
    if (standby.active) exitStandby();
    else scheduleStandby();
    toast(seconds ? `Standby after ${seconds}s` : 'Standby screen off');
  });
  $('#standby-image').addEventListener('click', async () => {
    const picked = await pickImageData();
    if (!picked) return;
    state.config.settings.standbyImage = await downscaleBackground(picked);
    scheduleSave();
    updateDeckSettingsMeta();
    if (standby.active) {
      standby.active = false;
      clearStandbyTimers();
      await enterStandby();
    }
    toast('Standby image set');
  });
  $('#standby-clear').addEventListener('click', () => {
    state.config.settings.standbyImage = null;
    scheduleSave();
    updateDeckSettingsMeta();
    toast('Standby image cleared');
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
    renderPushButton();
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
      toast('Could not open the Deck — is Ulanzi Studio running?', true);
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
      if (inspectorDrawerOpen()) return closeInspector();
      state.selected = null;
      renderGrid();
      renderInspector();
    }
  });

  api.onLockScreen(() => {
    enterLockScreen();
  });

  api.onDisplayRestore(() => {
    if (lock.active) {
      exitLockScreen();
      return;
    }
    if (state.status.connected) pushNow();
    scheduleStandby();
  });

  api.onStatus((status) => {
    const wasConnected = state.status.connected;
    state.status = status;
    renderStatus();
    if (!wasConnected && status.connected) {
      api.setBrightness(state.config.settings.brightness);
      api.setSleepTime(state.config.settings.sleepSeconds);
      schedulePush();
      scheduleStandby();
    }
    if (wasConnected && !status.connected) {
      standby.active = false;
      clearStandbyTimers();
      stopLock();
    }
  });

  const modalReturnFocus = new Map();
  const MODAL_CLOSERS = {
    'hotkey-modal': closeHotkeyModal,
    'icons-modal': closeIconLibrary,
    'store-modal': closeStoreModal,
    'plugin-modal': closePluginModal,
    'import-modal': closeImportModal,
    'profile-modal': closeProfileModal,
    'update-modal': closeUpdateModal,
    'about-modal': closeAboutModal,
    'tips-modal': closeTipsModal,
    // The app picker opens on top of other dialogs (e.g. the profile form).
    'app-modal': closeAppPicker,
    // Destructive confirmations stack on top of every other dialog.
    'confirm-modal': () => closeConfirmModal(false),
  };

  // Remember where focus was before a dialog opened and put it back when the
  // dialog hides, whichever path closed it (button, Escape, backdrop).
  for (const id of Object.keys(MODAL_CLOSERS)) {
    const modal = document.getElementById(id);
    if (!modal) continue;
    let open = !modal.classList.contains('hidden');
    new MutationObserver(() => {
      const nowOpen = !modal.classList.contains('hidden');
      if (nowOpen === open) return;
      open = nowOpen;
      if (nowOpen) {
        modalReturnFocus.set(id, document.activeElement);
        return;
      }
      const target = modalReturnFocus.get(id);
      modalReturnFocus.delete(id);
      if (target && document.contains(target) && typeof target.focus === 'function') {
        setTimeout(() => target.focus(), 0);
      }
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

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
    const preferred = [...modal.querySelectorAll('[data-autofocus]')].find((el) => el.offsetParent !== null);
    const items = focusable(modal);
    const first = preferred || items.find((el) => !el.classList.contains('icon-btn')) || items[0];
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
    const frame = document.querySelector('#pi-host .pi-frame');
    // Only the inspector we created may resize itself or open a link.
    if (!frame || event.source !== frame.contentWindow) return;
    if (!/^(ulanzi-pi|sd-pi):\/\//.test(String(event.origin || ''))) return;
    if (data.type === 'sd-pi-open') {
      if (/^https?:\/\//i.test(String(data.url || ''))) api.openExternal(String(data.url));
      return;
    }
    if (data.type !== 'ulanzi-pi-height') return;
    const height = Number(data.height) || 0;
    // A PI with no form reports a tiny height; keep the 120px placeholder and
    // let the retry prompt appear instead of collapsing the field.
    if (height < 24) return;
    frame.dataset.sized = '1';
    frame.style.height = `${Math.min(560, Math.max(60, height + 4))}px`;
    $('#pi-host')?.parentElement?.querySelector('.pi-error')?.remove();
  });

  api.onKey(({ index, pressed }) => handleKeyEvent(index, pressed));

  api.onError((message) => toast(message, true));
  api.onCommandFailed(({ message, meta }) => {
    if (meta && meta.pageId === state.config.activePageId) flashKey(Number(meta.index), 'error');
    toast(message, true);
  });

  api.onPluginStateIndex(({ actionid, state: index }) => bumpKeyState(actionid, index));

  api.onPluginState(({ actionid, image, state }) => {
    const hasState = Number.isInteger(state) && state >= 0;
    const mapKey = hasState ? `${actionid}:${state}` : actionid;
    const map = hasState ? pluginStateImages : pluginImages;
    if ((image || null) === (map.get(mapKey) || null)) return; // no visible change
    if (image) map.set(mapKey, image);
    else map.delete(mapKey);
    const loc = findPluginAction(actionid);
    if (pluginLocVisible(loc)) {
      Promise.resolve(drawIndex(loc.index)).then(() => scheduleLivePush(loc.index));
    }
  });

  api.onPluginSettings(({ actionid, settings }) => {
    const loc = findPluginAction(actionid);
    if (loc) {
      loc.key.action.settings = settings;
      scheduleSave();
    }
  });

  api.onPluginTitle(({ actionid, text, state }) => {
    const loc = findPluginAction(actionid);
    if (!loc) return;
    const value = String(text ?? '');
    let changed = false;
    if (Number.isInteger(state) && state >= 0) {
      const mapKey = `${actionid}:${state}`;
      if (value) {
        if (pluginStateTitles.get(mapKey) !== value) {
          pluginStateTitles.set(mapKey, value);
          changed = true;
        }
      } else if (pluginStateTitles.has(mapKey)) {
        pluginStateTitles.delete(mapKey);
        changed = true;
      }
      const index = Math.max(0, Number(loc.key.stateIndex) || 0);
      if (state === index && loc.key.label !== value) {
        loc.key.label = value;
        changed = true;
      }
    } else if (loc.key.label !== value) {
      loc.key.label = value;
      changed = true;
    }
    if (!changed) return;
    if (pluginLocVisible(loc)) {
      Promise.resolve(drawIndex(loc.index)).then(() => scheduleLivePush(loc.index));
    }
    // The plugin owns its title, so keep it in memory only. Saving here would
    // rewrite config.json and config.json.bak once per title tick.
  });

  api.onPluginToast((message) => {
    if (message) toast(message);
  });

  api.onSeizeState?.((value) => {
    seizeState = value;
    renderSeizeState();
  });

  api.onShowAbout?.(() => openAboutModal());
  api.onOpenSettings?.(() => openDeckSettings());

  api.onUpdateResult?.((res) => {
    updateInfo = res;
    renderUpdateStatus(res);
    if (res.update) showUpdateModal(res);
    else if (!res.ok) toast(friendlyUpdateError(res.error), true);
    else toast(`You're up to date (${res.current})`);
  });

  api.onUpdateAvailable?.((info) => {
    updateInfo = { ...info, update: true, checkedAt: Date.now() };
    renderUpdateStatus(updateInfo);
    toast(`Ulanzi Deck Open ${info.latest} is available`);
  });

  api.onPluginError((message) => toast(message, true));
  api.onPluginAlert(() => toast('Plugin error', true));
  api.onPluginOk(() => toast('Plugin confirmed the action'));
  api.onPluginSwitchProfile(({ profile }) => {
    const target = (state.config.profiles || []).find((p) => p.id === profile || p.name === profile);
    if (target) switchProfile(target.id);
    else toast(`Plugin asked for profile “${profile}”`, true);
  });

  api.onPluginsChanged(() => {
    refreshPlugins().catch((err) => toast(err.message || String(err), true));
  });

  api.onBrightness(() => {
    // The device echoes the value as BCD (e.g. 0x86 for 86). The slider is
    // authoritative for the UI, so we do not rewrite it from the echo.
  });

  window.addEventListener('beforeunload', () => api.saveConfig(state.config));
}

/** Fill in real app icons for app keys that have none (runs once after load). */
async function hydrateAppIcons() {
  let changed = false;
  for (const page of state.config.pages) {
    for (const [index, key] of Object.entries(page.keys)) {
      if (
        !key ||
        key.icon ||
        key.iconCleared ||
        key.face === 'text' ||
        !key.action ||
        key.action.type !== 'app' ||
        !key.action.value
      )
        continue;
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

function applyReloadedConfig(config) {
  if (!config) return;
  state.config = config;
  state.selected = null;
  renderAll();
  syncPlugins();
  api.setBrightness(state.config.settings.brightness);
  api.setSleepTime(state.config.settings.sleepSeconds);
  api.refreshUpdateSchedule?.();
  scheduleStandby();
  if (!state.config.settings.autoPush) {
    state.unsynced = true;
    renderSyncState();
  } else {
    pushNow({ background: true });
  }
  scheduleStandby();
  toast('Configuration reloaded from disk');
}

(async function init() {
  const boot = await api.getState();
  state.config = boot.config;
  api.onConfigReloaded(applyReloadedConfig);
  api.onFlush(() => api.saveConfig(state.config).catch(() => {}));
  if (normalizeActionMeta()) scheduleSave();
  state.status = boot.status;
  seizeState = boot.seize || null;
  state.plugins = await api.listPlugins();
  updatePluginCount();
  $('#version').textContent = boot.version;
  if ($('#app-version')) $('#app-version').textContent = boot.version;
  if ($('#about-version')) $('#about-version').textContent = boot.version;
  bind();
  renderSeizeState();
  renderAll();
  if (boot.recovery === 'backup') {
    toast('Your configuration was damaged, so the last backup was restored. The broken file was kept as config.json.corrupt.', true);
  } else if (boot.recovery === 'defaults') {
    toast('Your configuration could not be read and was reset to the defaults.', true);
  }
  hydrateAppIcons();
  syncPlugins();
  api.updateState().then((res) => {
    updateInfo = res;
    renderUpdateStatus(res);
  }).catch(() => {});
  if (state.status.connected) {
    api.setBrightness(state.config.settings.brightness);
    api.setSleepTime(state.config.settings.sleepSeconds);
    pushNow();
  }
  scheduleStandby();
  startFrontmostWatch();
  // A hidden editor skips command-output timers; catch up when it is shown.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tickVisibleCommandOutputs();
  });
  // Keep the wide-key panel in step with the deck: the analog second hand
  // moves every second, and stats are sampled at the same rate.
  setInterval(() => refreshWideStats(), 1000);
})();
