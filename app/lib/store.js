'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');

const CONFIG_VERSION = 6;

function key(emoji, label, action = { type: 'none' }, color = '#1b2130') {
  return { emoji, label, action, color, icon: null };
}

const ACTION_TYPES = new Set([
  'none', 'app', 'url', 'command', 'hotkey', 'text', 'media', 'close', 'page', 'plugin', 'multi', 'toggle', 'indicator', 'sound',
]);

const MEDIA_OPS = new Set(['playpause', 'next', 'prev', 'volumeup', 'volumedown', 'mute']);

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeAction(action) {
  if (!action || typeof action !== 'object') return { type: 'none' };
  const type = ACTION_TYPES.has(action.type) ? action.type : 'none';
  const out = { ...action, type };
  if ('value' in out) out.value = str(out.value);
  if (type === 'media') out.op = MEDIA_OPS.has(out.op) ? out.op : 'playpause';
  if (type === 'sound') {
    out.op = out.op === 'stop' ? 'stop' : 'play';
    out.volume = Math.min(1, Math.max(0, Number(out.volume) || 1));
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
  return out;
}

/** Coerce a config into the shape the app expects, without dropping user data. */
function validateConfig(config) {
  config.settings = {
    brightness: clamp(Number(config.settings?.brightness) || 85, 0, 100),
    sleepSeconds: Math.max(0, Number(config.settings?.sleepSeconds) || 0),
    autoPush: config.settings?.autoPush !== false,
  };

  // Profiles are a lightweight grouping: each page belongs to one profile and
  // the sidebar shows the active profile's pages.
  let profiles = Array.isArray(config.profiles) ? config.profiles.filter((p) => p && typeof p.id === 'string') : [];
  if (!profiles.length) profiles = [{ id: randomUUID(), name: 'Default' }];
  profiles = profiles.map((profile) => ({
    id: profile.id,
    name: str(profile.name, 'Profile'),
    ...(typeof profile.icon === 'string' && profile.icon ? { icon: profile.icon } : {}),
  }));
  const profileIds = new Set(profiles.map((p) => p.id));

  const pages = [];
  for (const page of config.pages) {
    const keys = {};
    for (const [index, raw] of Object.entries(page.keys || {})) {
      const slot = Number(index);
      if (!Number.isInteger(slot) || slot < 0 || slot > 12) continue;
      if (!raw || typeof raw !== 'object') continue;
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
      if (raw.holdAction) key.holdAction = normalizeAction(raw.holdAction);
      if (raw.doubleAction) key.doubleAction = normalizeAction(raw.doubleAction);
      if (key.holdAction || key.doubleAction) {
        key.holdMs = clamp(Number(raw.holdMs) || 500, 150, 2000);
      }
      keys[slot] = key;
    }
    const normalized = {
      id: str(page.id) || randomUUID(),
      name: str(page.name, 'Page'),
      profileId: profileIds.has(page.profileId) ? page.profileId : profiles[0].id,
      keys,
    };
    if (typeof page.parentId === 'string' && page.parentId) normalized.parentId = page.parentId;
    pages.push(normalized);
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
    settings: { brightness: 85, sleepSeconds: 0, autoPush: true },
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
  }

  /** Write base64 key images to disk and replace them with `file:<name>` refs. */
  _externalize(config) {
    let changed = false;
    fs.mkdirSync(this.imagesDir, { recursive: true });
    for (const page of config.pages || []) {
      for (const key of Object.values(page.keys || {})) {
        if (!key || typeof key.icon !== 'string') continue;
        const match = DATA_URL.exec(key.icon);
        if (!match) continue;
        const ext = EXT_FOR[match[1].toLowerCase()] || 'png';
        const buffer = Buffer.from(match[2], 'base64');
        const name = `${createHash('sha1').update(buffer).digest('hex')}.${ext}`;
        const file = path.join(this.imagesDir, name);
        if (!fs.existsSync(file)) fs.writeFileSync(file, buffer);
        key.icon = `file:${name}`;
        changed = true;
      }
    }
    return changed;
  }

  /** Expand `file:<name>` refs back into data URLs for the renderer. */
  _internalize(config) {
    for (const page of config.pages || []) {
      for (const key of Object.values(page.keys || {})) {
        if (!key || typeof key.icon !== 'string' || !key.icon.startsWith('file:')) continue;
        const name = path.basename(key.icon.slice(5));
        const file = path.join(this.imagesDir, name);
        try {
          const ext = path.extname(name).slice(1).toLowerCase();
          const mime = MIME_FOR[ext] || 'image/png';
          key.icon = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
        } catch {
          key.icon = null;
        }
      }
    }
    return config;
  }

  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

    try {
      const parsed = this._internalize(read(this.file));
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
        this.config = this._migrate(read(`${this.file}.bak`));
        this.save();
        this.emit?.('recovered');
        return this.config;
      } catch {
        this.config = createDefaultConfig();
        this.save();
        return this.config;
      }
    }
  }

  _migrate(config) {
    if (!config || !Array.isArray(config.pages) || config.pages.length === 0) {
      return createDefaultConfig();
    }
    const previous = Number(config.version) || 1;
    config.settings = { brightness: 85, sleepSeconds: 0, autoPush: true, ...(config.settings || {}) };

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
  }

  activePage(config = this.config) {
    return config.pages.find((p) => p.id === config.activePageId) || config.pages[0];
  }
}

module.exports = { Store, createDefaultConfig, validateConfig };
