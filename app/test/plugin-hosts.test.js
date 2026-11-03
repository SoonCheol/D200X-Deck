'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const { CH } = require('../lib/channels');
const { PluginManager } = require('../lib/plugins');
const { StreamDeckPlugins } = require('../lib/streamdeck-plugins');

const dialogCalls = [];
const dialog = {
  showOpenDialog: async (...args) => {
    dialogCalls.push(args);
    return { canceled: false, filePaths: ['/tmp/choice.png'] };
  },
  showMessageBox: async () => ({ response: 0 }),
};

const electron = {
  BrowserWindow: class {},
  dialog,
  shell: { openPath: async () => '', openExternal: async () => {} },
};

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-plugin-hosts-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function loadHosts() {
  const original = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return electron;
    return original.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../plugin-hosts')];
    return require('../plugin-hosts');
  } finally {
    Module._load = original;
  }
}

test('a bad manifest is reported without aborting plugin host startup', (t) => {
  const baseDir = tempDir(t);
  const bad = path.join(baseDir, 'Plugins', 'bad.ulanziPlugin');
  fs.mkdirSync(bad, { recursive: true });
  fs.writeFileSync(path.join(bad, 'manifest.json'), '{bad');
  const sent = [];
  const originalStart = PluginManager.prototype.start;
  const originalSdStart = StreamDeckPlugins.prototype.start;
  PluginManager.prototype.start = () => {};
  StreamDeckPlugins.prototype.start = () => {};
  t.after(() => {
    PluginManager.prototype.start = originalStart;
    StreamDeckPlugins.prototype.start = originalSdStart;
  });
  const { initPluginHosts } = loadHosts();

  const hosts = initPluginHosts({
    baseDir,
    appVersion: '1.0.0',
    send: (channel) => sent.push(channel),
    getWin: () => null,
    getStore: () => ({ config: { settings: { brightness: 50 } }, save() {} }),
    getDeck: () => ({ setBrightness() {} }),
  });

  assert.ok(hosts.plugins instanceof PluginManager);
  assert.ok(hosts.sdPlugins instanceof StreamDeckPlugins);
  assert.ok(sent.includes(CH.pluginError), 'the bad manifest error is forwarded');
});

test('plugin host events are forwarded and brightness updates are applied', (t) => {
  const baseDir = tempDir(t);
  const sent = [];
  const saves = [];
  const deck = { value: null, setBrightness(value) { this.value = value; } };
  const store = {
    config: { settings: { brightness: 50 } },
    save(config) {
      saves.push(config);
    },
  };
  const originalStart = PluginManager.prototype.start;
  const originalSdStart = StreamDeckPlugins.prototype.start;
  PluginManager.prototype.start = () => {};
  StreamDeckPlugins.prototype.start = () => {};
  t.after(() => {
    PluginManager.prototype.start = originalStart;
    StreamDeckPlugins.prototype.start = originalSdStart;
  });
  const { initPluginHosts } = loadHosts();
  const hosts = initPluginHosts({
    baseDir,
    appVersion: '1.0.0',
    send: (channel) => sent.push(channel),
    getWin: () => null,
    getStore: () => store,
    getDeck: () => deck,
  });

  hosts.plugins.emit('title', { actionid: 'a', text: 'Title' });
  hosts.sdPlugins.emit('switch-profile', { profile: 'p' });
  hosts.sdPlugins.emit('brightness', { action: 'increase', value: 5 });

  assert.deepEqual(sent, [CH.pluginTitle, CH.pluginSwitchProfile, CH.deckBrightness]);
  assert.equal(store.config.settings.brightness, 55);
  assert.equal(saves.length, 1);
  assert.equal(deck.value, 55);
});

test('selectDialog resolves getWin lazily', async (t) => {
  const baseDir = tempDir(t);
  const originalStart = PluginManager.prototype.start;
  const originalSdStart = StreamDeckPlugins.prototype.start;
  PluginManager.prototype.start = () => {};
  StreamDeckPlugins.prototype.start = () => {};
  t.after(() => {
    PluginManager.prototype.start = originalStart;
    StreamDeckPlugins.prototype.start = originalSdStart;
  });
  let win = null;
  const { initPluginHosts } = loadHosts();
  const hosts = initPluginHosts({
    baseDir,
    appVersion: '1.0.0',
    send() {},
    getWin: () => win,
    getStore: () => ({ config: { settings: {} }, save() {} }),
    getDeck: () => null,
  });
  dialogCalls.length = 0;

  const first = await hosts.plugins.selectDialog({ type: 'file', filter: '*.png' });
  win = { id: 'later' };
  const second = await hosts.plugins.selectDialog({ type: 'file' });

  assert.deepEqual(first, { canceled: false, path: '/tmp/choice.png' });
  assert.equal(dialogCalls[0].length, 1);
  assert.equal(dialogCalls[1][0], win);
  assert.deepEqual(second, { canceled: false, path: '/tmp/choice.png' });
});
