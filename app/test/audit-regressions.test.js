'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');

const { Store, createDefaultConfig, validateConfig } = require('../lib/store');
const { PluginManager } = require('../lib/plugins');
const { PluginHost, isAllowedWsOrigin } = require('../lib/plugin-host');
const { StreamDeckPlugins, logSettings } = require('../lib/streamdeck-plugins');
const { buildPiBridge } = require('../lib/pi-theme');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-audit-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// The renderer has no module exports; evaluate its actual import flow without booting Electron.
const renderer = fs.readFileSync(path.join(__dirname, '../renderer/app.js'), 'utf8');
const importStart = renderer.indexOf('function remapImportedAction(');
const importEnd = renderer.indexOf('function saveProfile(');
assert.ok(importStart >= 0 && importEnd > importStart, 'profile import flow must be available');
const importFlow = new vm.Script(renderer.slice(importStart, importEnd));

for (const type of ['multi', 'toggle', 'pop']) {
  test(`import consent covers shorthand command steps in ${type} actions`, async (t) => {
    const data = {
      format: 'ulanzi-deck-open-profile',
      pages: [{ id: 'incoming', name: 'Imported', keys: {
        0: { action: { type, steps: [{ type: 'command', value: 'INERT_AUDIT_SENTINEL' }] } },
      } }],
    };
    const store = new Store(fixture(t));
    let saved = false;
    const context = vm.createContext({
      state: { config: createDefaultConfig() },
      api: { importProfile: async () => ({ ok: true, data }) },
      uuid: randomUUID,
      basename: path.basename,
      closeProfileModal() {},
      renderAll() {},
      toast() {},
      confirm: () => false,
      commit() { store.save(context.state.config); saved = true; },
    });
    importFlow.runInContext(context);
    await context.importProfileFromFile();

    if (saved) {
      const loaded = store.load();
      const commands = loaded.pages
        .flatMap((page) => Object.values(page.keys))
        .flatMap((key) => key.action?.steps || [])
        .filter((step) => step.action?.type === 'command' && step.action.value === 'INERT_AUDIT_SENTINEL');
      assert.equal(commands.length, 0, 'executable imported commands must not survive declined or missing consent');
    }
  });
}

test('loading one malformed page preserves the other pages', (t) => {
  const store = new Store(fixture(t));
  const config = createDefaultConfig();
  const expectedIds = config.pages.map((page) => page.id);
  config.pages.unshift(null);
  fs.writeFileSync(store.file, JSON.stringify(config));

  const loaded = store.load();

  assert.deepEqual(loaded.pages.map((page) => page.id), expectedIds);
});

test('backup recovery restores file-backed key icons and page backgrounds', (t) => {
  const store = new Store(fixture(t));
  const config = createDefaultConfig();
  const image = 'data:image/png;base64,YQ==';
  config.pages[0].keys[0].icon = image;
  config.pages[0].background = image;
  store.save(config);
  store.save(config);
  fs.writeFileSync(store.file, '{broken');

  const loaded = store.load();

  assert.equal(store.takeRecovery(), 'backup');
  assert.equal(loaded.pages[0].keys[0].icon, image);
  assert.equal(loaded.pages[0].background, image);
});

test('installing an already-managed plugin folder preserves its files', async (t) => {
  const plugins = fixture(t);
  const source = path.join(plugins, 'audit.plugin.ulanziPlugin');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'manifest.json'), JSON.stringify({
    UUID: 'audit.plugin', Name: 'Audit', CodePath: 'app.js', Actions: [],
  }));
  const code = path.join(source, 'app.js');
  fs.writeFileSync(code, '// inert fixture\n');
  const manager = new PluginManager({ dirs: [plugins], appPluginsDir: plugins });
  try {
    await manager.install(source);
  } catch {
    // Rejecting a self-install is acceptable; deleting the selected source is not.
  }

  assert.ok(fs.existsSync(code), 'install must preserve the selected source');
  assert.equal(fs.readFileSync(code, 'utf8'), '// inert fixture\n');
});

function hostFixture(t) {
  const dir = fixture(t);
  const host = new PluginHost({ dirs: [dir], port: 3906 });
  const codePath = path.join(dir, 'inert.js');
  fs.writeFileSync(codePath, '// inert fixture\n');
  host.plugins.set('audit.plugin', { uuid: 'audit.plugin', name: 'Audit', compatible: true, codePath });
  host.actions.set('audit.action', { pluginUuid: 'audit.plugin' });
  const launches = [];
  host._spawn = (...args) => launches.push(args);
  return { host, launches };
}

test('a failed port bind prevents later plugin launch attempts', async (t) => {
  const { host, launches } = hostFixture(t);
  host._portPromise = Promise.resolve(null);
  host._ensurePlugin('audit.plugin');
  await Promise.resolve();
  host._ensurePlugin('audit.plugin');

  assert.equal(launches.length, 0, 'a plugin must not launch without a listening host');
});

test('shutdown prevents a pending port resolution from launching a plugin', async (t) => {
  const { host, launches } = hostFixture(t);
  let resolvePort;
  host._portPromise = new Promise((resolve) => { resolvePort = resolve; });
  host._ensurePlugin('audit.plugin');
  await host.shutdown(10);
  resolvePort(3906);
  await Promise.resolve();

  assert.equal(launches.length, 0, 'shutdown must invalidate pending plugin launches');
});

test('restart waits for the previous child to exit before replacing it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { host } = hostFixture(t);
  const children = [];
  host.wss = { close() {} };
  host._spawn = PluginHost.prototype._spawn;
  host.spawnCommand = () => ({ command: 'inert-fixture', args: [], env: {} });
  host.spawn = () => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.kill = () => true;
    children.push(child);
    return child;
  };
  host._ensurePlugin('audit.plugin');
  const child = children[0];
  host.restart('audit.plugin');
  t.mock.timers.tick(200);
  await new Promise((resolve) => setImmediate(resolve));
  const childrenBeforeExit = children.length;
  child.exitCode = 0;
  child.emit('exit', 0);
  child.emit('close', 0);
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(2000);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(childrenBeforeExit, 1, 'a live old child must not overlap its replacement');
  assert.equal(children.length, 2, 'the replacement starts after the old child exits');
});

test('a stale child exit does not clear the replacement socket', (t) => {
  const { host } = hostFixture(t);
  const meta = { uuid: 'audit.plugin', name: 'Audit' };
  const oldChild = {};
  const replacement = {};
  const socket = {};
  host.generations.set('audit.plugin', 2);
  host.childGenerations.set(oldChild, 1);
  host.childGenerations.set(replacement, 2);
  host.socketGenerations.set(socket, 2);
  host.children.set('audit.plugin', replacement);
  host.sockets.set('audit.plugin', socket);

  host._onChildExit(meta, oldChild, 0);

  assert.equal(host.sockets.get('audit.plugin'), socket, 'a stale exit must not clear the newer socket');
  assert.equal(host.children.get('audit.plugin'), replacement);
  assert.equal(host.crashes.has('audit.plugin'), false, 'a stale exit must not count as a crash');
});

test('restart suppression belongs to the old child, not the plugin UUID', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { host } = hostFixture(t);
  const meta = { uuid: 'audit.plugin', name: 'Audit' };
  const oldChild = {};
  const replacement = {};
  host.generations.set('audit.plugin', 2);
  host.childGenerations.set(oldChild, 1);
  host.childGenerations.set(replacement, 2);
  host.children.set('audit.plugin', replacement);
  host.restarting.add(oldChild);
  host.crashes.set('audit.plugin', { count: 1, last: Date.now() });

  host._onChildExit(meta, replacement, 1);

  assert.equal(host.crashes.get('audit.plugin').count, 2, 'the replacement exit must still be handled');
  assert.equal(host.restarting.has(oldChild), true, 'the old child keeps its own suppression marker');

  host._onChildExit(meta, oldChild, 0);
  assert.equal(host.crashes.get('audit.plugin').count, 2, 'the stale exit must not add another crash');
});

test('a child retired by reload cannot clear a newer socket', (t) => {
  const { host } = hostFixture(t);
  const oldChild = { kill() {}, once() {}, exitCode: null };
  host.generations.set('audit.plugin', 1);
  host.childGenerations.set(oldChild, 1);
  host.children.set('audit.plugin', oldChild);
  host.sockets.set('audit.plugin', {});
  host.scan = () => [];
  host.list = () => [];

  host.reload();

  const generation = host._nextGeneration('audit.plugin');
  const newChild = {};
  const newSocket = {};
  host.childGenerations.set(newChild, generation);
  host.socketGenerations.set(newSocket, generation);
  host.children.set('audit.plugin', newChild);
  host.sockets.set('audit.plugin', newSocket);
  host.actions.set('audit.action', { pluginUuid: 'audit.plugin' });

  host._onChildExit({ uuid: 'audit.plugin', name: 'Audit' }, oldChild, 0);

  assert.equal(host.sockets.get('audit.plugin'), newSocket);
  assert.equal(host.crashes.has('audit.plugin'), false);
});

test('a bad manifest does not abort scanning before an error listener exists', (t) => {
  const dir = fixture(t);
  const pluginDir = path.join(dir, 'bad.ulanziPlugin');
  fs.mkdirSync(pluginDir);
  fs.writeFileSync(path.join(pluginDir, 'manifest.json'), '{not json');

  const manager = new PluginManager({ dirs: [dir], appPluginsDir: dir });

  assert.doesNotThrow(() => manager.scan(), 'one bad manifest must not abort startup');
});

test('a recent connection does not clear the crash history', (t) => {
  const host = new PluginHost({ dirs: [fixture(t)], port: 3906, label: 'test' });
  host.crashes.set('p', { count: 3, last: Date.now() });
  host._noteConnected('p');
  assert.equal(host.crashes.has('p'), true, 'a quick reconnect must keep the crash count');

  host.crashes.set('p', { count: 3, last: Date.now() - 120_000 });
  host._noteConnected('p');
  assert.equal(host.crashes.has('p'), false, 'a stable run clears the history');
});

test('a plugin that gave up is not restarted by key or sync', (t) => {
  const { host, launches } = hostFixture(t);
  host.crashes.set('audit.plugin', { count: 6, last: Date.now(), giveUp: true });
  host._ensurePlugin('audit.plugin');
  assert.equal(launches.length, 0, 'the crash cap must survive key presses and syncs');
});

test('the websocket guard admits SDK and inspector origins only', () => {
  for (const origin of ['', undefined, 'file://', 'ulanzi-pi://local', 'sd-pi://local']) {
    assert.equal(isAllowedWsOrigin(origin), true, `allowed: ${origin}`);
  }
  for (const origin of ['null', 'https://evil.example', 'http://127.0.0.1', 'chrome-extension://abc', 'data:text/html,x']) {
    assert.equal(isAllowedWsOrigin(origin), false, `blocked: ${origin}`);
  }
});

test('Ulanzi global settings survive a manager restart', (t) => {
  const dir = fixture(t);
  const manager = new PluginManager({ dirs: [dir], appPluginsDir: dir });
  manager._onPluginMessage({
    cmd: 'setGlobalSettings',
    uuid: 'audit.plugin',
    settings: { token: 'persisted' },
  });

  const restarted = new PluginManager({ dirs: [dir], appPluginsDir: dir });
  assert.deepEqual(restarted.globalSettings.get('audit.plugin'), { token: 'persisted' });
});

test('plugin sync collects nested and alternate-trigger actions', () => {
  const ui = fs.readFileSync(path.join(__dirname, '../renderer/ui.js'), 'utf8');
  const start = ui.indexOf('function collectPluginActions(');
  const end = ui.indexOf('function syncPlugins(');
  assert.ok(start >= 0 && end > start, 'collectPluginActions must be available');

  let next = 0;
  const context = vm.createContext({
    uuid: () => `id-${++next}`,
    state: { plugins: [{ uuid: 'p', sdk: 'streamdeck' }] },
  });
  new vm.Script(ui.slice(start, end)).runInContext(context);

  const wanted = [];
  const seen = new Set();
  context.collectPluginActions(
    {
      type: 'multi',
      steps: [
        { action: { type: 'plugin', plugin: 'p', action: 'a' } },
        { type: 'plugin', plugin: 'p', action: 'b' },
        { delay: 100 },
      ],
    },
    '0_0',
    true,
    wanted,
    seen
  );

  assert.equal(wanted.length, 2, 'wrapped and bare plugin steps are both collected');
  assert.equal(wanted[0].sdk, 'streamdeck');
  assert.ok(wanted[0].actionid && wanted[1].actionid);
  assert.notEqual(wanted[0].actionid, wanted[1].actionid);
});

test('a zero sound volume is preserved', () => {
  const config = createDefaultConfig();
  config.pages[0].keys[0] = {
    emoji: '', label: '', color: '#1b2130',
    action: { type: 'sound', value: '/tmp/inert.mp3', volume: 0 },
  };
  const validated = validateConfig(config);
  assert.equal(validated.pages[0].keys[0].action.volume, 0);
});

test('reload clears negative Rosetta and Wine caches', (t) => {
  const host = new StreamDeckPlugins({ appPluginsDir: fixture(t) });
  host._rosetta = false;
  host._wine = false;
  host.scan = () => [];
  host.list = () => [];
  host.reload();
  assert.equal(host._rosetta, undefined);
  assert.equal(host._wine, null);
});

test('diagnostics redact nested settings names', () => {
  const parsed = JSON.parse(
    logSettings({ apiKey: 'a', nested: { token: 'b', keep: 1 }, list: [{ secret: 'c' }] })
  );
  assert.equal(parsed.apiKey, '***');
  assert.equal(parsed.nested.token, '***');
  assert.equal(parsed.nested.keep, 1);
  assert.equal(parsed.list[0].secret, '***');
});

test('the Stream Deck inspector bridge keeps its retry without a payload', () => {
  const sd = buildPiBridge({ connect: null, connectMode: true });
  assert.match(sd, /connectInspector/);
  assert.match(sd, /attempt/);
  const ulanzi = buildPiBridge({});
  assert.doesNotMatch(ulanzi, /connectInspector/);
});

test('a fresh store is not a recovery, an existing empty one is', (t) => {
  const dir = fixture(t);
  const first = new Store(dir);
  first.load();
  assert.equal(first.takeRecovery(), null, 'first use is not a recovery');

  fs.writeFileSync(first.file, JSON.stringify({ version: 6, pages: [] }));
  const second = new Store(dir);
  second.load();
  assert.equal(second.takeRecovery(), 'defaults', 'an empty existing config is reported');
});
