'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { pathToFileURL } = require('node:url');
const JSZip = require('jszip');

const { CH } = require('../lib/channels');
const importUlanzi = require('../lib/import-ulanzi');
const sdcatalog = require('../lib/sdcatalog');
const { StreamDeckPlugins } = require('../lib/streamdeck-plugins');

const ipcMain = {
  handle() {},
  on() {},
  removeListener() {},
};

const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  showMessageBox: async () => ({ response: 0 }),
  showSaveDialog: async () => ({ canceled: true }),
};

let exposedWorld = {};
const rendererCalls = [];
const ipcRenderer = {
  invoke(channel, ...args) {
    rendererCalls.push({ kind: 'invoke', channel, args });
    return Promise.resolve(null);
  },
  on(channel, listener) {
    rendererCalls.push({ kind: 'on', channel, listener });
  },
  removeListener() {},
};

const electron = {
  app: { getVersion: () => '9.9.9', getPath: () => os.tmpdir() },
  BrowserWindow: class {},
  contextBridge: {
    exposeInMainWorld(name, api) {
      exposedWorld[name] = api;
    },
  },
  dialog,
  ipcMain,
  ipcRenderer,
  screen: {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1000, height: 1000 } }),
  },
  shell: {
    openPath: async () => '',
    openExternal: async () => {},
    showItemInFolder() {},
  },
  systemPreferences: {
    getMediaAccessStatus: () => 'granted',
    askForMediaAccess: async () => true,
  },
};

let downloadImpl = null;
sdcatalog.download = (...args) => {
  if (!downloadImpl) throw new Error('download is not configured');
  return downloadImpl(...args);
};

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'electron') return electron;
  return originalLoad.call(this, request, parent, isMain);
};
let registerIpc;
try {
  ({ registerIpc } = require('../ipc'));
} finally {
  Module._load = originalLoad;
}

function trustedEvent() {
  return {
    senderFrame: {
      url: pathToFileURL(path.join(__dirname, '..', 'renderer', 'index.html')).href,
    },
  };
}

function makeCtx(overrides = {}) {
  return {
    store: {
      config: { settings: {} },
      save() {},
      takeRecovery: () => null,
    },
    deck: { status: () => ({}), connected: false },
    plugins: null,
    sdPlugins: null,
    sdCatalog: { resolve: async () => ({ url: '', version: '' }) },
    market: { resource: async () => ({}) },
    send() {},
    devRun() {},
    checkForUpdates: async () => ({}),
    scheduleUpdateCheck() {},
    allPluginList: () => [],
    syncAllPlugins() {},
    runPlugin() {},
    setPluginSettings() {},
    pluginInspectorUrl: () => '',
    findPluginOwner: () => null,
    getWin: () => null,
    getSeizeState: () => ({}),
    ...overrides,
  };
}

function harness(ctx) {
  const handlers = new Map();
  const listeners = new Map();
  ipcMain.handle = (channel, handler) => handlers.set(channel, handler);
  ipcMain.on = (channel, listener) => listeners.set(channel, listener);
  ipcMain.removeListener = (channel, listener) => {
    if (listeners.get(channel) === listener) listeners.delete(channel);
  };
  registerIpc(ctx);
  return { handlers, listeners };
}

function loadPreloadApi() {
  exposedWorld = {};
  rendererCalls.length = 0;
  const original = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return electron;
    return original.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../preload')];
    require('../preload');
  } finally {
    Module._load = original;
  }
  return { api: exposedWorld.deckApp || {}, calls: rendererCalls };
}

function mockImportPreview(t, { name = 'Imported', pages, report = {} }) {
  const cleanup = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-ipc-import-'));
  const original = importUlanzi.previewProfile;
  importUlanzi.previewProfile = async () => ({
    profiles: [
      {
        name,
        pages,
        report: { skipped: [], unmapped: [], missingPlugins: [], warnings: [], ...report },
      },
    ],
    cleanup,
  });
  t.after(() => {
    importUlanzi.previewProfile = original;
    fs.rmSync(cleanup, { recursive: true, force: true });
  });
  return cleanup;
}

function importContext(config) {
  const saves = [];
  return {
    saves,
    ctx: makeCtx({
      store: {
        config,
        save(value) {
          saves.push(value);
        },
        takeRecovery: () => null,
      },
    }),
  };
}

test('preload only invokes declared channels that have handlers', () => {
  const { api, calls } = loadPreloadApi();
  const { handlers } = harness(makeCtx());
  const known = new Set(Object.values(CH));

  assert.ok(Object.keys(api).length > 50, 'expected the full preload API');
  for (const fn of Object.values(api)) {
    if (typeof fn === 'function') fn();
  }

  const invoked = calls.filter((call) => call.kind === 'invoke').map((call) => call.channel);
  const subscribed = calls.filter((call) => call.kind === 'on').map((call) => call.channel);
  assert.ok(invoked.length > 50, 'expected the preload bridge to invoke channels');
  assert.ok(subscribed.length > 10, 'expected the preload bridge to subscribe to channels');

  for (const channel of invoked) {
    assert.ok(known.has(channel), `preload invokes an undeclared channel: ${channel}`);
    assert.ok(handlers.has(channel), `no handler for preload channel: ${channel}`);
  }
  for (const channel of subscribed) {
    assert.ok(known.has(channel), `preload subscribes to an undeclared channel: ${channel}`);
  }
});

test('every IPC handler rejects an untrusted sender', async () => {
  const { handlers } = harness(makeCtx());
  assert.ok(handlers.size >= 60, `expected all handlers, got ${handlers.size}`);

  const renderer = pathToFileURL(path.join(__dirname, '..', 'renderer', 'index.html')).href;
  const events = [
    { senderFrame: { url: 'https://evil.example/' } },
    { senderFrame: { url: 'file:///etc/passwd' } },
    { senderFrame: { url: pathToFileURL(path.join(__dirname, '..', 'renderer', 'other.html')).href } },
    { senderFrame: { url: `${renderer}?query=1` } },
    { senderFrame: { url: `${renderer}#hash` } },
    { senderFrame: { url: renderer.replace('/renderer/index.html', '/renderer/../index.html') } },
    { senderFrame: {} },
    {},
  ];

  for (const [channel, handler] of handlers) {
    for (const event of events) {
      const result = await handler(event, {});
      assert.deepEqual(
        result,
        { ok: false, error: 'untrusted sender' },
        `${channel} accepted ${JSON.stringify(event)}`
      );
    }
  }
});

test('the exact renderer page is a trusted sender', async () => {
  const ctx = makeCtx({
    deck: { status: () => ({ ok: true }), connected: false },
  });
  const { handlers } = harness(ctx);

  const result = await handlers.get(CH.appState)(trustedEvent());

  assert.equal(result.version, '9.9.9');
  assert.equal(result.platform, process.platform);
  assert.deepEqual(result.status, { ok: true });
});

test('an untrusted sender never reaches the store', async () => {
  let saved = false;
  const ctx = makeCtx({
    store: {
      config: { settings: {} },
      save() {
        saved = true;
      },
      takeRecovery: () => null,
    },
  });
  const { handlers } = harness(ctx);

  const rejected = await handlers.get(CH.configSave)(
    { senderFrame: { url: 'https://evil.example/' } },
    { settings: {} }
  );
  assert.deepEqual(rejected, { ok: false, error: 'untrusted sender' });
  assert.equal(saved, false, 'an untrusted sender must not reach the store');

  const accepted = await handlers.get(CH.configSave)(trustedEvent(), { settings: {} });
  assert.deepEqual(accepted, { ok: true });
  assert.equal(saved, true, 'a trusted sender reaches the store');
});

test('every channel the main process sends is declared', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'ipc.js'), 'utf8');
  const names = [...source.matchAll(/send\(CH\.(\w+)/g)].map((match) => match[1]);
  assert.ok(names.length > 0, 'expected send(CH.*) calls');
  for (const name of names) assert.equal(typeof CH[name], 'string', `unknown send channel: ${name}`);
});

test('import:apply creates a new profile and keeps page links', async (t) => {
  const cleanup = mockImportPreview(t, {
    name: 'Imported',
    pages: [
      {
        id: 'incoming',
        name: 'Home',
        keys: { 0: { action: { type: 'page', op: 'goto', value: 'child' } } },
      },
      { id: 'child', name: 'Child', keys: {}, parentId: 'incoming' },
    ],
    report: { unmapped: [{ action: 'x' }], missingPlugins: ['p', 'p'] },
  });
  const config = {
    profiles: [{ id: 'p1', name: 'Imported', pinned: { 0: { label: 'pin' } } }],
    pages: [{ id: 'home', name: 'Home', profileId: 'p1', keys: {} }],
    activeProfileId: 'p1',
    activePageId: 'home',
  };
  const { saves, ctx } = importContext(config);
  const { handlers } = harness(ctx);

  const result = await handlers.get(CH.importApply)(trustedEvent(), { target: 'x', mode: 'new' });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'new');
  assert.equal(result.profileName, 'Imported (2)');
  assert.equal(result.importedProfiles, 1);
  assert.equal(result.importedPages, 2);
  assert.equal(result.importedKeys, 1);
  assert.deepEqual(result.missingPlugins, ['p']);
  assert.equal(config.profiles.length, 2);
  assert.equal(config.pages.length, 3);
  const importedProfile = config.profiles[1];
  assert.equal(config.activeProfileId, importedProfile.id);
  assert.equal(config.activePageId, 'incoming');
  assert.equal(fs.existsSync(cleanup), false, 'the preview temp directory is removed');
  assert.equal(saves.length, 1);
});

test('import:apply merge remaps colliding pages, parents and goto links', async (t) => {
  const cleanup = mockImportPreview(t, {
    pages: [
      {
        id: 'page',
        name: 'Home',
        keys: { 0: { action: { type: 'page', op: 'goto', value: 'child' } } },
      },
      { id: 'child', name: 'Child', keys: {}, parentId: 'page' },
    ],
  });
  const config = {
    profiles: [{ id: 'p1', name: 'Default', pinned: { 0: { label: 'pin' } } }],
    pages: [
      { id: 'page', name: 'Home', profileId: 'p1', keys: {} },
      { id: 'child', name: 'Child', profileId: 'p1', keys: {} },
    ],
    activeProfileId: 'p1',
    activePageId: 'page',
  };
  const { ctx } = importContext(config);
  const { handlers } = harness(ctx);

  const result = await handlers.get(CH.importApply)(trustedEvent(), {
    target: 'x',
    mode: 'merge',
    pageIds: ['page', 'child'],
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'merge');
  assert.equal(result.importedProfiles, 0);
  assert.equal(result.importedPages, 2);
  assert.equal(config.pages.length, 4);
  const importedPage = config.pages.find((page) => page.name === 'Home (2)');
  const importedChild = config.pages.find((page) => page.name === 'Child (2)');
  assert.ok(importedPage && importedChild);
  assert.notEqual(importedPage.id, 'page');
  assert.notEqual(importedChild.id, 'child');
  assert.equal(importedPage.keys[0].action.value, importedChild.id);
  assert.equal(importedChild.parentId, importedPage.id);
  assert.equal(config.profiles[0].pinned[0].label, 'pin');
  assert.equal(config.activePageId, importedPage.id);
  assert.equal(fs.existsSync(cleanup), false);
});

test('import:apply replace removes only the active profile pages', async (t) => {
  mockImportPreview(t, { pages: [{ id: 'new-page', name: 'Home', keys: {} }] });
  const config = {
    profiles: [
      { id: 'p1', name: 'One', pinned: { 0: { label: 'pin' } } },
      { id: 'p2', name: 'Two' },
    ],
    pages: [
      { id: 'a', name: 'A', profileId: 'p1', keys: {} },
      { id: 'b', name: 'B', profileId: 'p1', keys: {} },
      { id: 'c', name: 'C', profileId: 'p2', keys: {} },
    ],
    activeProfileId: 'p1',
    activePageId: 'a',
  };
  const { ctx } = importContext(config);
  const { handlers } = harness(ctx);

  const result = await handlers.get(CH.importApply)(trustedEvent(), { target: 'x', mode: 'replace' });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'replace');
  assert.equal(result.importedProfiles, 0);
  assert.equal(result.importedPages, 1);
  assert.deepEqual(config.pages.map((page) => page.profileId).sort(), ['p1', 'p2']);
  assert.equal(config.pages.find((page) => page.profileId === 'p1').id, 'new-page');
  assert.equal(config.pages.find((page) => page.profileId === 'p2').id, 'c');
  assert.equal(config.profiles[0].pinned[0].label, 'pin');
  assert.equal(config.activePageId, 'new-page');
});

test('import:apply rejects an empty page selection and cleans up', async (t) => {
  const cleanup = mockImportPreview(t, { pages: [{ id: 'only', name: 'Only', keys: {} }] });
  const config = {
    profiles: [{ id: 'p1', name: 'Default' }],
    pages: [],
    activeProfileId: 'p1',
    activePageId: '',
  };
  const { ctx } = importContext(config);
  const { handlers } = harness(ctx);

  const result = await handlers.get(CH.importApply)(trustedEvent(), {
    target: 'x',
    mode: 'merge',
    pageIds: ['missing'],
  });

  assert.deepEqual(result, { ok: false, error: 'Select at least one page to import' });
  assert.equal(fs.existsSync(cleanup), false);
});

test('import:apply rejects a preview with no profiles and cleans up', async (t) => {
  const cleanup = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-ipc-import-'));
  const original = importUlanzi.previewProfile;
  importUlanzi.previewProfile = async () => ({ profiles: [], cleanup });
  t.after(() => {
    importUlanzi.previewProfile = original;
    fs.rmSync(cleanup, { recursive: true, force: true });
  });
  const { ctx } = importContext({
    profiles: [{ id: 'p1', name: 'Default' }],
    pages: [],
    activeProfileId: 'p1',
    activePageId: '',
  });
  const { handlers } = harness(ctx);

  const result = await handlers.get(CH.importApply)(trustedEvent(), { target: 'x' });

  assert.deepEqual(result, { ok: false, error: 'No pages found in this profile' });
  assert.equal(fs.existsSync(cleanup), false);
});

test('dialog handlers resolve getWin lazily after registration', async () => {
  const calls = [];
  dialog.showOpenDialog = async (...args) => {
    calls.push(args);
    return { canceled: true, filePaths: [] };
  };
  const ctx = makeCtx({ getWin: () => null });
  const { handlers } = harness(ctx);

  const win = { id: 'window-created-later' };
  ctx.getWin = () => win;

  const result = await handlers.get(CH.pluginsInstallFolder)(trustedEvent());

  assert.deepEqual(result, { canceled: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], win, 'the dialog must receive the window that exists when it opens');
});

test('SD store install downloads and installs the resolved package', async (t) => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-ipc-store-'));
  const host = new StreamDeckPlugins({ appPluginsDir: appDir });
  const downloads = [];
  const sent = [];
  let downloadedFile = null;

  downloadImpl = async (url, destination) => {
    downloads.push(url);
    downloadedFile = destination;
    const zip = new JSZip();
    zip.file(
      'com.test.sdPlugin/manifest.json',
      JSON.stringify({
        Name: 'Store Test',
        Author: 'Test',
        Version: '1.2.3',
        Category: 'Test',
        CodePath: 'plugin.js',
        OS: [{ Platform: 'mac' }],
        Actions: [],
      })
    );
    zip.file('com.test.sdPlugin/plugin.js', 'process.exit(0);\n');
    fs.writeFileSync(destination, await zip.generateAsync({ type: 'nodebuffer' }));
  };

  t.after(() => {
    downloadImpl = null;
    fs.rmSync(appDir, { recursive: true, force: true });
  });

  const ctx = makeCtx({
    sdPlugins: host,
    sdCatalog: {
      resolve: async (id) => {
        assert.equal(id, 'com.test');
        return { url: 'https://example.invalid/com.test.zip', version: '1.2.3' };
      },
    },
    allPluginList: () => host.list(),
    send: (channel) => sent.push(channel),
  });
  const { handlers } = harness(ctx);

  const result = await handlers.get(CH.sdstoreInstall)(trustedEvent(), 'com.test');

  assert.equal(result.ok, true);
  assert.equal(result.uuid, 'com.test.sdPlugin');
  assert.equal(result.version, '1.2.3');
  assert.deepEqual(downloads, ['https://example.invalid/com.test.zip']);
  assert.deepEqual(sent, [CH.pluginsChanged]);
  assert.ok(fs.existsSync(path.join(appDir, 'com.test.sdPlugin', 'manifest.json')));
  assert.equal(fs.existsSync(downloadedFile), false, 'the downloaded archive is removed');
});
