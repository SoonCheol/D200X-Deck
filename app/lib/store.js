'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');

const CONFIG_VERSION = 6;

function key(emoji, label, action = { type: 'none' }, color = '#1b2130') {
  return { emoji, label, action, color, icon: null };
}

const { ACTION_TYPES, MEDIA_OPS } = require('./actions-meta');
const {
  normalizeFamily,
  normalizeWeightPreset,
  normalizeAlign,
  normalizeColor,
  normalizeBackground: normalizeStyleBackground,
} = require('./text-style');
const ACTION_TYPE_SET = new Set(ACTION_TYPES);
const MEDIA_OP_SET = new Set(MEDIA_OPS);

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

const SOURCE_ACTION_TEXT_LIMIT = 200;
const SOURCE_ACTION_VALUE_LIMIT = 4096;
const SOURCE_ACTION_ENTRY_LIMIT = 100;
const SOURCE_ACTION_DEPTH_LIMIT = 3;

/** Keep unmapped import metadata small, plain and safe to serialise. */
function boundedSourceValue(value, depth = 0) {
  if (depth >= SOURCE_ACTION_DEPTH_LIMIT) return undefined;
  if (typeof value === 'string') return value.slice(0, SOURCE_ACTION_VALUE_LIMIT);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, SOURCE_ACTION_ENTRY_LIMIT)
      .map((item) => boundedSourceValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [name, item] of Object.entries(value).slice(0, SOURCE_ACTION_ENTRY_LIMIT)) {
      if (name === '__proto__' || name === 'constructor' || name === 'prototype') continue;
      const bounded = boundedSourceValue(item, depth + 1);
      if (bounded !== undefined) out[name.slice(0, SOURCE_ACTION_TEXT_LIMIT)] = bounded;
    }
    return out;
  }
  return undefined;
}

function normalizeSourceAction(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const action = typeof raw.action === 'string' ? raw.action.slice(0, SOURCE_ACTION_TEXT_LIMIT) : '';
  if (!action) return null;
  const source = { action };
  const param = boundedSourceValue(raw.param);
  if (param && typeof param === 'object' && Object.keys(param).length) source.param = param;
  const plugin = boundedSourceValue(raw.plugin);
  if (plugin && typeof plugin === 'object' && Object.keys(plugin).length) source.plugin = plugin;
  return source;
}

function normalizeAction(action) {
  if (!action || typeof action !== 'object') return { type: 'none' };
  const type = ACTION_TYPE_SET.has(action.type) ? action.type : 'none';
  const out = { ...action, type };
  if ('value' in out) out.value = str(out.value);
  if (type === 'media') out.op = MEDIA_OP_SET.has(out.op) ? out.op : 'playpause';
  if (type === 'sound') {
    out.op = out.op === 'stop' ? 'stop' : 'play';
    const volume = Number(out.volume);
    out.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;
  }
  if (type === 'plugin') {
    out.plugin = str(out.plugin);
    out.action = str(out.action);
    out.actionid = str(out.actionid);
    if (!out.settings || typeof out.settings !== 'object') out.settings = {};
  }
  if (type === 'page') {
    out.op = ['next', 'prev', 'back', 'goto', 'profile'].includes(out.op) ? out.op : 'goto';
  }
  if (type === 'timer') {
    out.seconds = Math.min(86_400, Math.max(1, Math.round(Number(out.seconds) || 300)));
    out.sound = out.sound !== false;
  }
  if (type === 'command') {
    if (out.showOutput === true) {
      out.showOutput = true;
      out.outputInterval = Math.min(86_400, Math.max(5, Math.round(Number(out.outputInterval) || 30)));
    } else {
      delete out.showOutput;
      delete out.outputInterval;
    }
  }
  if (type === 'brightness') {
    out.op = out.op === 'down' ? 'down' : 'up';
    out.step = Math.min(50, Math.max(1, Math.round(Number(out.step) || 5)));
  }
  if (type === 'multi' || type === 'toggle' || type === 'pop') {
    const maxSteps = type === 'pop' ? 9 : type === 'toggle' ? 2 : 12;
    out.steps = Array.isArray(out.steps)
      ? out.steps.slice(0, maxSteps).map((step) => {
          if (step && step.delay !== undefined) return { delay: Math.max(0, Number(step.delay) || 0) };
          if (step && step.action) return { action: normalizeAction(step.action) };
          return { action: normalizeAction(step) };
        })
      : [];
  }
  return out;
}

/** Normalise one key from a page or the pinned set. */
function normalizeKey(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const key = {
    emoji: str(raw.emoji),
    label: str(raw.label),
    color: /^#[0-9a-f]{6}$/i.test(raw.color || '') ? raw.color : '#1b2130',
    icon: typeof raw.icon === 'string' && raw.icon ? raw.icon : null,
    iconSource: str(raw.iconSource),
    action: normalizeAction(raw.action),
  };
  if (Array.isArray(raw.states) && raw.states.length > 1) {
    key.states = raw.states.slice(0, 8).map((sl) => ({
      emoji: str(sl?.emoji),
      label: str(sl?.label),
      ...(typeof sl?.icon === 'string' && sl.icon ? { icon: sl.icon } : {}),
    }));
    key.stateIndex = Math.min(key.states.length - 1, Math.max(0, Number(raw.stateIndex) || 0));
  }
  if (typeof raw.emojiAuto === 'string') key.emojiAuto = raw.emojiAuto;
  if (typeof raw.labelAuto === 'string') key.labelAuto = raw.labelAuto;
  if (raw.face === 'icon' || raw.face === 'text' || raw.face === 'tile') key.face = raw.face;
  if (raw.tile && typeof raw.tile === 'object' && !Array.isArray(raw.tile)) {
    key.tile = {
      accent: normalizeColor(raw.tile.accent, '#4f8cff'),
      glyph: str(raw.tile.glyph).slice(0, 40),
      title: str(raw.tile.title).slice(0, 80),
      subtitle: str(raw.tile.subtitle).slice(0, 80),
      glyphSize: clamp(Math.round(Number(raw.tile.glyphSize) || 0), 0, 80),
      titleSize: clamp(Math.round(Number(raw.tile.titleSize) || 0), 0, 48),
      subtitleSize: clamp(Math.round(Number(raw.tile.subtitleSize) || 0), 0, 40),
    };
    // Optional: an unset glyph colour keeps the default white.
    const glyphColor = normalizeColor(raw.tile.glyphColor, '');
    if (glyphColor) key.tile.glyphColor = glyphColor;
  }
  const sourceAction = normalizeSourceAction(raw.sourceAction);
  if (sourceAction) key.sourceAction = sourceAction;
  // Set when the user removes an icon: keep the icon face but stop falling
  // back to the automatic action image.
  if (raw.iconCleared === true) key.iconCleared = true;
  if (raw.font && typeof raw.font === 'object') {
    key.font = {
      size: clamp(Math.round(Number(raw.font.size) || 17), 10, 40),
      weight: normalizeWeightPreset(raw.font.weight, 400),
      align: normalizeAlign(raw.font.align, 'left'),
      color: normalizeColor(raw.font.color, '#ffffff'),
      showLabel: raw.font.showLabel !== false,
      // A plugin live image already carries its own text; only an explicit
      // choice may draw the app caption over it.
      ...(raw.font.captionExplicit === true ? { captionExplicit: true } : {}),
    };
    // New style fields are optional so existing configs keep their exact shape.
    if ('family' in raw.font) key.font.family = normalizeFamily(raw.font.family);
    if ('background' in raw.font) key.font.background = normalizeStyleBackground(raw.font.background, 'gradient');
  }
  if (raw.textStyle && typeof raw.textStyle === 'object' && !Array.isArray(raw.textStyle)) {
    key.textStyle = {
      family: normalizeFamily(raw.textStyle.family),
      weight: normalizeWeightPreset(raw.textStyle.weight, 700),
      color: normalizeColor(raw.textStyle.color, '#ffffff'),
    };
  }
  if (raw.holdAction) key.holdAction = normalizeAction(raw.holdAction);
  if (raw.doubleAction) key.doubleAction = normalizeAction(raw.doubleAction);
  if (key.holdAction || key.doubleAction) {
    key.holdMs = clamp(Number(raw.holdMs) || 500, 150, 2000);
  }
  return key;
}

function normalizeBackground(value) {
  return typeof value === 'string' && value ? value : null;
}

// One source of defaults for new configs, migrations and validation.
const DEFAULT_SETTINGS = {
  brightness: 85,
  sleepSeconds: 0,
  autoPush: true,
  standbySeconds: 0,
  standbyImage: null,
  standbyClock: true,
  lockScreen: false,
  lockImage: null,
  launchAtLogin: false,
  updateCheck: true,
  updateHours: 6,
};

/** Coerce a config into the shape the app expects, without dropping user data. */
function validateConfig(config) {
  const current = config.settings || {};
  config.settings = {
    brightness: clamp(Number(current.brightness ?? DEFAULT_SETTINGS.brightness), 0, 100),
    sleepSeconds: Math.max(0, Number(current.sleepSeconds ?? DEFAULT_SETTINGS.sleepSeconds) || 0),
    autoPush: current.autoPush !== false,
    standbySeconds: Math.max(0, Math.round(Number(current.standbySeconds ?? DEFAULT_SETTINGS.standbySeconds) || 0)),
    standbyImage: normalizeBackground(current.standbyImage),
    standbyClock: current.standbyClock !== false,
    lockScreen: current.lockScreen === true,
    lockImage: normalizeBackground(current.lockImage),
    launchAtLogin: current.launchAtLogin === true,
    updateCheck: current.updateCheck !== false,
    updateHours: clamp(Math.round(Number(current.updateHours ?? DEFAULT_SETTINGS.updateHours) || DEFAULT_SETTINGS.updateHours), 1, 168),
  };

  // Profiles are a lightweight grouping: each page belongs to one profile and
  // the sidebar shows the active profile's pages.
  let profiles = Array.isArray(config.profiles) ? config.profiles.filter((p) => p && typeof p.id === 'string') : [];
  if (!profiles.length) profiles = [{ id: randomUUID(), name: 'Default' }];
  const usedProfileIds = new Set();
  profiles = profiles.map((profile) => {
    const pinned = {};
    for (const [index, raw] of Object.entries(profile.pinned || {})) {
      const slot = Number(index);
      if (!Number.isInteger(slot) || slot < 0 || slot > 12) continue;
      const key = normalizeKey(raw);
      if (key) pinned[slot] = key;
    }
    let id = profile.id;
    if (usedProfileIds.has(id)) id = randomUUID();
    usedProfileIds.add(id);
    return {
      id,
      name: str(profile.name, 'Profile'),
      ...(typeof profile.icon === 'string' && profile.icon ? { icon: profile.icon } : {}),
      ...(typeof profile.appPath === 'string' && profile.appPath ? { appPath: profile.appPath } : {}),
      ...(typeof profile.appName === 'string' && profile.appName ? { appName: profile.appName } : {}),
      ...(normalizeBackground(profile.background) ? { background: profile.background } : {}),
      ...(Object.keys(pinned).length ? { pinned } : {}),
    };
  });
  const profileIds = new Set(profiles.map((p) => p.id));

  const pages = [];
  const sourcePages = Array.isArray(config.pages) ? config.pages : [];
  const usedPageIds = new Set();
  for (const page of sourcePages) {
    if (!page || typeof page !== 'object') continue;
    const keys = {};
    for (const [index, raw] of Object.entries(page.keys || {})) {
      const slot = Number(index);
      if (!Number.isInteger(slot) || slot < 0 || slot > 12) continue;
      const key = normalizeKey(raw);
      if (key) keys[slot] = key;
    }
    let pageId = str(page.id) || randomUUID();
    if (usedPageIds.has(pageId)) pageId = randomUUID();
    usedPageIds.add(pageId);
    const normalized = {
      id: pageId,
      name: str(page.name, 'Page'),
      profileId: profileIds.has(page.profileId) ? page.profileId : profiles[0].id,
      keys,
    };
    if (typeof page.parentId === 'string' && page.parentId) normalized.parentId = page.parentId;
    if (normalizeBackground(page.background)) normalized.background = page.background;
    // The 2x1 wide key panel is rendered by the device firmware.
    if (page.wideMode === 'stats' || page.wideMode === 'blank') normalized.wideMode = page.wideMode;
    if (page.parentId && Number(page.autoExitSeconds) > 0) {
      normalized.autoExitSeconds = Math.min(86_400, Math.max(1, Math.round(Number(page.autoExitSeconds))));
    }
    pages.push(normalized);
  }

  // Parents must live in the same profile and must not form a cycle.
  const pageById = new Map(pages.map((page) => [page.id, page]));
  for (const page of pages) {
    if (!page.parentId) continue;
    const parent = pageById.get(page.parentId);
    if (!parent || parent.profileId !== page.profileId) {
      delete page.parentId;
      continue;
    }
    const seen = new Set([page.id]);
    let current = parent;
    while (current?.parentId) {
      if (seen.has(current.id)) {
        delete page.parentId;
        break;
      }
      seen.add(current.id);
      current = pageById.get(current.parentId);
    }
  }

  // Every profile must own at least one page, otherwise the UI can end up
  // editing a page that belongs to another profile ("ghost" page).
  for (const profile of profiles) {
    if (!pages.some((p) => p.profileId === profile.id)) {
      pages.push({ id: randomUUID(), name: 'Main', profileId: profile.id, keys: {} });
    }
  }

  const activeProfileId = profileIds.has(config.activeProfileId) ? config.activeProfileId : profiles[0].id;
  const profilePages = pages.filter((p) => p.profileId === activeProfileId);
  const activePageId = pages.some((p) => p.id === config.activePageId && p.profileId === activeProfileId)
    ? config.activePageId
    : (profilePages[0] || pages[0]).id;

  return {
    version: CONFIG_VERSION,
    settings: config.settings,
    profiles,
    activeProfileId,
    pages,
    activePageId,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function defaultPages() {
  const mediaId = randomUUID();
  const main = {
    id: randomUUID(),
    name: 'Main',
    keys: {
      0: key('🧭', 'Safari', { type: 'app', value: 'Safari' }, '#16324a'),
      1: key('⌨️', 'Terminal', { type: 'app', value: 'Terminal' }, '#1d2430'),
      2: key('📁', 'Finder', { type: 'app', value: 'Finder' }, '#2a2f45'),
      3: key('🐙', 'GitHub', { type: 'url', value: 'https://github.com' }, '#2d2340'),
      4: key('📝', 'Notes', { type: 'app', value: 'Notes' }, '#3a3418'),
      5: key('📸', 'Screenshot', { type: 'hotkey', value: 'cmd+shift+3' }, '#1f3328'),
      6: key('🔒', 'Lock', { type: 'command', value: 'pmset displaysleepnow' }, '#33212a'),
      7: key('▶️', 'Media', { type: 'page', value: mediaId }, '#213040'),
      8: key('🔉', 'Vol −', { type: 'command', value: "osascript -e 'set volume output volume ((output volume of (get volume settings)) - 6)'" }, '#24302a'),
      9: key('🔇', 'Mute', { type: 'command', value: "osascript -e 'set volume with output muted'" }, '#2e2626'),
      10: key('🔊', 'Vol +', { type: 'command', value: "osascript -e 'set volume output volume ((output volume of (get volume settings)) + 6)'" }, '#24302a'),
      11: key('🌙', 'Sleep', { type: 'command', value: 'pmset sleepnow' }, '#1c1c30'),
      12: key('🧮', 'Calculator', { type: 'app', value: 'Calculator' }, '#2c2c2c'),
    },
  };
  const media = {
    id: mediaId,
    name: 'Media',
    keys: {
      0: key('⏮', 'Previous', { type: 'command', value: "osascript -e 'tell application \"Music\" to previous track'" }),
      1: key('⏯', 'Play/Pause', { type: 'command', value: "osascript -e 'tell application \"Music\" to playpause'" }),
      2: key('⏭', 'Next', { type: 'command', value: "osascript -e 'tell application \"Music\" to next track'" }),
      3: key('🔉', 'Vol −', { type: 'command', value: "osascript -e 'set volume output volume ((output volume of (get volume settings)) - 6)'" }),
      4: key('🔊', 'Vol +', { type: 'command', value: "osascript -e 'set volume output volume ((output volume of (get volume settings)) + 6)'" }),
      5: key('🎬', 'TV', { type: 'app', value: 'TV' }),
      6: key('📻', 'Podcasts', { type: 'app', value: 'Podcasts' }),
      7: key('🔇', 'Mute', { type: 'command', value: "osascript -e 'set volume with output muted'" }),
      8: key('⬅️', 'Back', { type: 'page', value: main.id }),
    },
  };
  return [main, media];
}

function createDefaultConfig() {
  const pages = defaultPages();
  const profileId = randomUUID();
  for (const page of pages) page.profileId = profileId;
  return {
    version: CONFIG_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    profiles: [{ id: profileId, name: 'Default' }],
    activeProfileId: profileId,
    activePageId: pages[0].id,
    pages,
  };
}

const DATA_URL = /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,(.+)$/i;
const EXT_FOR = { png: 'png', jpeg: 'jpg', jpg: 'jpg', webp: 'webp', gif: 'gif', 'svg+xml': 'svg' };
const MIME_FOR = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };

class Store {
  constructor(userDataDir) {
    this.dir = userDataDir;
    this.file = path.join(userDataDir, 'config.json');
    this.imagesDir = path.join(userDataDir, 'Images');
    this.config = null;
    this.recovery = null;
  }

  /** One-shot: tells the UI whether the last load fell back to a backup. */
  takeRecovery() {
    const value = this.recovery;
    this.recovery = null;
    return value;
  }

  /** Every image slot in a config: key icons, state icons, backgrounds, standby. */
  _imageSlots(config) {
    const slots = [];
    for (const page of config.pages || []) {
      if (!page || typeof page !== 'object') continue;
      if (page.background) slots.push({ get: () => page.background, set: (v) => { page.background = v; } });
      for (const key of Object.values(page.keys || {})) {
        if (!key) continue;
        slots.push({ get: () => key.icon, set: (v) => { key.icon = v; } });
        for (const state of key.states || []) {
          if (state && state.icon) slots.push({ get: () => state.icon, set: (v) => { state.icon = v; } });
        }
      }
    }
    for (const profile of config.profiles || []) {
      if (!profile || typeof profile !== 'object') continue;
      if (profile.background) slots.push({ get: () => profile.background, set: (v) => { profile.background = v; } });
      for (const key of Object.values(profile.pinned || {})) {
        if (!key) continue;
        slots.push({ get: () => key.icon, set: (v) => { key.icon = v; } });
        for (const state of key.states || []) {
          if (state && state.icon) slots.push({ get: () => state.icon, set: (v) => { state.icon = v; } });
        }
      }
    }
    if (config.settings?.standbyImage) {
      slots.push({
        get: () => config.settings.standbyImage,
        set: (v) => { config.settings.standbyImage = v; },
      });
    }
    if (config.settings?.lockImage) {
      slots.push({ get: () => config.settings.lockImage, set: (v) => { config.settings.lockImage = v; } });
    }
    return slots;
  }

  /** Write base64 images to disk and replace them with `file:<name>` refs. */
  _externalize(config) {
    let changed = false;
    fs.mkdirSync(this.imagesDir, { recursive: true });
    for (const slot of this._imageSlots(config)) {
      const value = slot.get();
      if (typeof value !== 'string') continue;
      const match = DATA_URL.exec(value);
      if (!match) continue;
      const ext = EXT_FOR[match[1].toLowerCase()] || 'png';
      const buffer = Buffer.from(match[2], 'base64');
      const name = `${createHash('sha1').update(buffer).digest('hex')}.${ext}`;
      const file = path.join(this.imagesDir, name);
      if (!fs.existsSync(file)) fs.writeFileSync(file, buffer);
      slot.set(`file:${name}`);
      changed = true;
    }
    return changed;
  }

  /** Expand `file:<name>` refs back into data URLs for the renderer. */
  _internalize(config) {
    for (const slot of this._imageSlots(config)) {
      const value = slot.get();
      if (typeof value !== 'string' || !value.startsWith('file:')) continue;
      const name = path.basename(value.slice(5));
      const file = path.join(this.imagesDir, name);
      try {
        const ext = path.extname(name).slice(1).toLowerCase();
        const mime = MIME_FOR[ext] || 'image/png';
        slot.set(`data:${mime};base64,${fs.readFileSync(file).toString('base64')}`);
      } catch {
        slot.set(null);
      }
    }
    return config;
  }

  /**
   * Re-read config.json without falling back to defaults or rewriting it.
   * Used by the explicit "Reload config" command: an invalid external edit must
   * leave the running config and the file untouched.
   */
  reload() {
    try {
      const parsed = this._internalize(JSON.parse(fs.readFileSync(this.file, 'utf8')));
      const usable = Array.isArray(parsed.pages) ? parsed.pages.filter((page) => page && typeof page === 'object') : [];
      if (!usable.length) throw new Error('config.json has no usable pages');
      const migrated = this._migrate(parsed);
      if (!migrated || !Array.isArray(migrated.pages) || !migrated.pages.length) {
        throw new Error('config.json has no usable pages');
      }
      this.config = migrated;
      return this.config;
    } catch (err) {
      try {
        fs.copyFileSync(this.file, `${this.file}.rejected`);
      } catch {
        /* the file may be unreadable; keep the current config */
      }
      throw err;
    }
  }

  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));    const defaults = (recovery) => {
      this.config = createDefaultConfig();
      this.recovery = recovery;
      this.save();
      return this.config;
    };

    // A missing config is normal first use, not a recovery. A leftover backup
    // is still worth using, but the absence itself is not a failure.
    if (!fs.existsSync(this.file)) {
      try {
        this.config = this._migrate(this._internalize(read(`${this.file}.bak`)));
        this.recovery = 'backup';
        this.save();
        return this.config;
      } catch {
        return defaults(null);
      }
    }

    try {
      const parsed = this._internalize(read(this.file));
      if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) {
        try { fs.copyFileSync(this.file, `${this.file}.corrupt`); } catch { /* ignore */ }
        return defaults('defaults');
      }
      const previous = Number(parsed.version) || 1;
      this.config = this._migrate(parsed);
      if (previous !== CONFIG_VERSION) this.save();
      return this.config;
    } catch (err) {
      // Keep the broken file for inspection and fall back to the last backup.
      try {
        fs.copyFileSync(this.file, `${this.file}.corrupt`);
      } catch {
        /* nothing to preserve */
      }
      try {
        this.config = this._migrate(this._internalize(read(`${this.file}.bak`)));
        this.recovery = 'backup';
        this.save();
        return this.config;
      } catch {
        return defaults('defaults');
      }
    }
  }

  _migrate(config) {
    if (!config || !Array.isArray(config.pages) || config.pages.length === 0) {
      return createDefaultConfig();
    }
    // One hand-edited null page must not discard the whole configuration.
    config.pages = config.pages.filter((page) => page && typeof page === 'object');
    if (!config.pages.length) return createDefaultConfig();
    config.settings = { ...DEFAULT_SETTINGS, ...(config.settings || {}) };

    for (const page of config.pages) {
      if (!page.keys) page.keys = {};
      // The wide (2x1) key is a firmware system panel and has no user config.
      delete page.keys[13];
      delete page.keys[14];
      for (const key of Object.values(page.keys)) {
        if (key && key.action && key.action.type === 'open') {
          key.action.type = /^https?:|^mailto:/i.test(String(key.action.value || '')) ? 'url' : 'app';
        }
      }
    }

    config.version = CONFIG_VERSION;
    if (!config.pages.some((p) => p.id === config.activePageId)) {
      config.activePageId = config.pages[0].id;
    }
    return validateConfig(config);
  }

  _collectImageNames(config) {
    const names = new Set();
    for (const slot of this._imageSlots(config)) {
      const value = slot.get();
      if (typeof value === 'string' && value.startsWith('file:')) names.add(path.basename(value.slice(5)));
    }
    return names;
  }

  /** Drop Images/ files no longer referenced by the current config or its .bak. */
  _pruneImages(current, backup) {
    if (!fs.existsSync(this.imagesDir)) return;
    const keep = this._collectImageNames(current);
    if (backup) {
      for (const name of this._collectImageNames(backup)) keep.add(name);
    }
    let entries = [];
    try {
      entries = fs.readdirSync(this.imagesDir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith('.') || keep.has(name)) continue;
      try {
        fs.unlinkSync(path.join(this.imagesDir, name));
      } catch {
        /* in use or already gone */
      }
    }
  }

  save(config = this.config) {
    this.config = config;
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    const onDisk = JSON.parse(JSON.stringify(config));
    this._externalize(onDisk);
    fs.writeFileSync(tmp, JSON.stringify(onDisk, null, 2));
    try {
      fs.copyFileSync(this.file, `${this.file}.bak`);
    } catch {
      /* first save, no backup yet */
    }
    fs.renameSync(tmp, this.file);
    let backup = null;
    try {
      backup = JSON.parse(fs.readFileSync(`${this.file}.bak`, 'utf8'));
    } catch {
      /* no usable backup */
    }
    this._pruneImages(onDisk, backup);
  }

  activePage(config = this.config) {
    return config.pages.find((p) => p.id === config.activePageId) || config.pages[0];
  }
}

module.exports = {
  DEFAULT_SETTINGS, Store, createDefaultConfig, validateConfig };
