'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');

const { Store, createDefaultConfig } = require('../lib/store');
const { PluginManager } = require('../lib/plugins');
const { PluginHost } = require('../lib/plugin-host');

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

test('installing an already-managed plugin folder preserves its files', (t) => {
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
    manager.install(source);
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
