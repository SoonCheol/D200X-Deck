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
  timer: 'assets/actions/timer.svg',
  brightness: 'assets/actions/brightness.svg',
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
  const sources = [
    ...state.config.pages.map((page) => page.keys),
    ...(state.config.profiles || []).map((profile) => profile.pinned || {}),
  ];
  for (const keys of sources) {
    for (const key of Object.values(keys)) {
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
  timer: 'Timer',
  brightness: 'Key brightness',
  pop: 'POP menu',
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
  for (const profile of state.config.profiles || []) {
    for (const [slot, key] of Object.entries(profile.pinned || {})) {
      if (!key?.action || key.action.type !== 'plugin' || key.action.actionid !== actionid) continue;
      key.stateIndex = Math.max(0, Number(index) || 0);
      if (profile.id === state.config.activeProfileId && !activePage()?.keys?.[slot]) {
        drawIndex(Number(slot));
      }
      scheduleSave();
      schedulePush();
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
  $('#profile-export').disabled = !editing;
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
    out.steps = out.steps.map((step) =>
      step && step.action ? { ...step, action: remapImportedAction(step.action, idMap) } : step
    );
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

function importProfileData(data) {
  if (!data || data.format !== 'ulanzi-deck-open-profile' || !Array.isArray(data.pages) || !data.pages.length) {
    throw new Error('Not a valid Ulanzi Deck Open profile');
  }
  const source = data.profile && typeof data.profile === 'object' ? data.profile : {};
  const wanted = String(source.name || data.name || 'Imported profile').trim() || 'Imported profile';
  const takenProfiles = new Set((state.config.profiles || []).map((p) => p.name.trim().toLowerCase()));
  let name = wanted;
  for (let i = 2; takenProfiles.has(name.toLowerCase()); i += 1) name = `${wanted} (${i})`;

  const profileId = uuid();
  const idMap = new Map();
  for (const page of data.pages) {
    if (page && typeof page.id === 'string') idMap.set(page.id, uuid());
  }
  const pageNames = new Set();
  const pages = [];
  for (const sourcePage of data.pages) {
    if (!sourcePage || typeof sourcePage !== 'object') continue;
    let pageName = String(sourcePage.name || 'Page').trim() || 'Page';
    for (let i = 2; pageNames.has(pageName.toLowerCase()); i += 1) pageName = `${sourcePage.name || 'Page'} (${i})`;
    pageNames.add(pageName.toLowerCase());
    const page = {
      id: idMap.get(sourcePage.id) || uuid(),
      name: pageName,
      profileId,
      keys: remapImportedKeys(sourcePage.keys, idMap),
    };
    if (sourcePage.parentId && idMap.has(sourcePage.parentId)) page.parentId = idMap.get(sourcePage.parentId);
    if (sourcePage.background) page.background = sourcePage.background;
    pages.push(page);
  }
  if (!pages.length) throw new Error('Profile has no usable pages');

  const profile = { id: profileId, name };
  if (typeof source.appPath === 'string' && source.appPath) {
    profile.appPath = source.appPath;
    profile.appName = source.appName || basename(source.appPath);
  }
  if (source.background) profile.background = source.background;
  if (source.pinned && typeof source.pinned === 'object') {
    const pinned = remapImportedKeys(source.pinned, idMap);
    if (Object.keys(pinned).length) profile.pinned = pinned;
  }

  state.config.profiles.push(profile);
  state.config.pages.push(...pages);
  state.config.activeProfileId = profileId;
  state.config.activePageId = pages[0].id;
  state.selected = null;
  closeProfileModal();
  renderAll();
  commit();
  toast(`Imported profile “${name}” (${pages.length} pages)`);
}

async function importProfileFromFile() {
  const res = await api.importProfile();
  if (res.canceled) return;
  if (!res.ok) return toast(res.error || 'Could not import profile', true);
  try {
    importProfileData(res.data);
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
  const standbyInput = $('#standby-seconds');
  if (standbyInput) standbyInput.value = String(state.config.settings.standbySeconds || 0);
  const standbyState = $('#standby-image-state');
  if (standbyState) standbyState.textContent = state.config.settings.standbyImage ? 'Custom image' : 'None';
  const launch = $('#launch-login');
  if (launch) launch.checked = state.config.settings.launchAtLogin === true;
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
      : 'Show a clock (and optional wallpaper) when idle. The first press only wakes the deck.';
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
    const picked = await api.pickImage();
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
  $('#page-back').addEventListener('click', () => {
    const parent = activePage()?.parentId;
    if (parent) navigate(parent);
  });
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
    const picked = await api.pickImage();
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
    const picked = await api.pickImage();
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

  const MODAL_CLOSERS = {
    'hotkey-modal': closeHotkeyModal,
    'icons-modal': closeIconLibrary,
    'store-modal': closeStoreModal,
    'plugin-modal': closePluginModal,
    'import-modal': closeImportModal,
    'profile-modal': closeProfileModal,
    // The app picker opens on top of other dialogs (e.g. the profile form).
    'app-modal': closeAppPicker,
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
    if (pluginLocVisible(loc)) {
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
      if (pluginLocVisible(loc)) drawIndex(loc.index);
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
  scheduleStandby();
  startFrontmostWatch();
})();
