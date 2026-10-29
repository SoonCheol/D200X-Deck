'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const CONFIG_VERSION = 1;

function key(emoji, label, action = { type: 'none' }, color = '#1b2130') {
  return { emoji, label, action, color, icon: null };
}

function defaultPages() {
  const mediaId = randomUUID();
  const main = {
    id: randomUUID(),
    name: 'Main',
    keys: {
      0: key('🧭', 'Safari', { type: 'open', value: 'Safari' }, '#16324a'),
      1: key('⌨️', 'Terminal', { type: 'open', value: 'Terminal' }, '#1d2430'),
      2: key('📁', 'Finder', { type: 'open', value: 'Finder' }, '#2a2f45'),
      3: key('🐙', 'GitHub', { type: 'open', value: 'https://github.com' }, '#2d2340'),
      4: key('📝', 'Notes', { type: 'open', value: 'Notes' }, '#3a3418'),
      5: key('📸', 'Screenshot', { type: 'hotkey', value: 'cmd+shift+3' }, '#1f3328'),
      6: key('🔒', 'Lock', { type: 'command', value: 'pmset displaysleepnow' }, '#33212a'),
      7: key('▶️', 'Media', { type: 'page', value: mediaId }, '#213040'),
      8: key('🔉', 'Vol −', { type: 'command', value: "osascript -e 'set volume output volume ((output volume of (get volume settings)) - 6)'" }, '#24302a'),
      9: key('🔇', 'Mute', { type: 'command', value: "osascript -e 'set volume with output muted'" }, '#2e2626'),
      10: key('🔊', 'Vol +', { type: 'command', value: "osascript -e 'set volume output volume ((output volume of (get volume settings)) + 6)'" }, '#24302a'),
      11: key('🌙', 'Sleep', { type: 'command', value: 'pmset sleepnow' }, '#1c1c30'),
      12: key('🧮', 'Calculator', { type: 'open', value: 'Calculator' }, '#2c2c2c'),
      13: key('🎵', 'Music', { type: 'open', value: 'Music' }, '#3a1f2c'),
      14: key('⚙️', 'Empty', { type: 'none', value: '' }, '#1a1f29'),
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
      5: key('🎬', 'TV', { type: 'open', value: 'TV' }),
      6: key('📻', 'Podcasts', { type: 'open', value: 'Podcasts' }),
      7: key('🔇', 'Mute', { type: 'command', value: "osascript -e 'set volume with output muted'" }),
      8: key('⬅️', 'Back', { type: 'page', value: main.id }),
      9: key('', '', { type: 'none' }),
      10: key('', '', { type: 'none' }),
      11: key('', '', { type: 'none' }),
      12: key('', '', { type: 'none' }),
      13: key('', '', { type: 'none' }),
      14: key('', '', { type: 'none' }),
    },
  };
  return [main, media];
}

function createDefaultConfig() {
  const pages = defaultPages();
  return {
    version: CONFIG_VERSION,
    settings: { brightness: 85, sleepSeconds: 0, autoPush: true },
    activePageId: pages[0].id,
    pages,
  };
}

class Store {
  constructor(userDataDir) {
    this.dir = userDataDir;
    this.file = path.join(userDataDir, 'config.json');
    this.config = null;
  }

  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.config = this._migrate(parsed);
    } catch {
      this.config = createDefaultConfig();
      this.save();
    }
    return this.config;
  }

  _migrate(config) {
    if (!config || !Array.isArray(config.pages) || config.pages.length === 0) {
      return createDefaultConfig();
    }
    config.version = CONFIG_VERSION;
    config.settings = { brightness: 85, sleepSeconds: 0, autoPush: true, ...(config.settings || {}) };
    if (!config.pages.some((p) => p.id === config.activePageId)) {
      config.activePageId = config.pages[0].id;
    }
    return config;
  }

  save(config = this.config) {
    this.config = config;
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
    fs.renameSync(tmp, this.file);
  }

  activePage(config = this.config) {
    return config.pages.find((p) => p.id === config.activePageId) || config.pages[0];
  }
}

module.exports = { Store, createDefaultConfig };
