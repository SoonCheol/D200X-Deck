'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
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

const createdWindows = [];
class FakeWindow extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.destroyed = false;
    this.sent = [];
    this.webContents = new EventEmitter();
    this.webContents.send = (channel, payload) => this.sent.push({ channel, payload });
    createdWindows.push(this);
  }

  loadFile() {
    return Promise.resolve();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit('closed');
  }

  show() {}
  focus() {}
  setPosition() {}
  setAlwaysOnTop() {}
  setVisibleOnAllWorkspaces() {}
}

const electron = {
  app: { getVersion: () => '9.9.9', getPath: () => os.tmpdir() },
  BrowserWindow: FakeWindow,
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

const fakeChildProcess = {
  execFile(file, args, options, callback) {
    const done = typeof options === 'function' ? options : callback;
    if (done) done(new Error(`no ${file} in tests`), '', '');
  },
  spawn() {
    throw new Error('unexpected spawn in IPC tests');
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
  if (request === 'node:child_process') return fakeChildProcess;
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
      expandImages: (value) => value,
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

test('deck:push-key builds and sends a one-slot package', async () => {
  const sent = [];
  const ctx = makeCtx({
    deck: { status: () => ({}), connected: true, pushKey: (zip) => sent.push(zip) },
  });
  const { handlers } = harness(ctx);
  const png = Buffer.from('png').toString('base64');

  const result = await handlers.get(CH.deckPushKey)(trustedEvent(), '2_1', png);

  assert.equal(result.ok, true);
  assert.equal(sent.length, 1);
  const zip = await JSZip.loadAsync(sent[0]);
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  assert.deepEqual(Object.keys(manifest), ['2_1']);
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

test('import:apply names a new profile with the chosen name, numbering a taken one', async (t) => {
  mockImportPreview(t, { name: 'Default Profile', pages: [{ id: 'incoming', name: 'Home', keys: {} }] });
  const make = () => ({
    profiles: [{ id: 'p1', name: 'Default Profile' }, { id: 'p2', name: 'Work' }],
    pages: [{ id: 'home', name: 'Home', profileId: 'p1', keys: {} }],
    activeProfileId: 'p1',
    activePageId: 'home',
  });
  const run = async (name) => {
    const config = make();
    const { handlers } = harness(importContext(config).ctx);
    const result = await handlers.get(CH.importApply)(trustedEvent(), { target: 'x', mode: 'new', name });
    return { result, config };
  };

  assert.equal((await run('Studio import')).result.profileName, 'Studio import');
  assert.equal((await run('  work  ')).result.profileName, 'work (2)');
  assert.equal((await run('')).result.profileName, 'Default Profile (2)');
  const { config } = await run('Studio import');
  assert.equal(config.profiles[2].name, 'Studio import');
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

test('icon packs install, list, read and remove safely', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-icon-ipc-'));
  const oldConfig = process.env.ULANZI_CONFIG_DIR;
  process.env.ULANZI_CONFIG_DIR = root;
  t.after(() => {
    if (oldConfig === undefined) delete process.env.ULANZI_CONFIG_DIR;
    else process.env.ULANZI_CONFIG_DIR = oldConfig;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const market = {
    resource: async (id) => ({
      id,
      name: 'Test Pack',
      author: 'Tester',
      icon: null,
      files: 'https://ugc.ulanzistudio.com/pack.zip',
    }),
    download: async (_url, destination) => {
      const zip = new JSZip();
      zip.file('a.png', Buffer.from('one'));
      zip.file('nested/a.png', Buffer.from('two'));
      zip.file('notes.txt', 'ignore me');
      fs.writeFileSync(destination, await zip.generateAsync({ type: 'nodebuffer' }));
    },
  };
  const { handlers } = harness(makeCtx({ market }));
  const install = await handlers.get(CH.storeInstallIcons)(trustedEvent(), '42');

  assert.equal(install.ok, true);
  assert.equal(install.pack.id, 'test-pack-42');
  assert.equal(install.pack.count, 2);
  assert.equal(fs.existsSync(path.join(root, 'Icons', 'test-pack-42', 'a-1.png')), true);
  assert.equal(fs.existsSync(path.join(root, 'Icons', 'test-pack-42', 'notes.txt')), false);

  const packs = await handlers.get(CH.iconsList)(trustedEvent());
  const pack = packs.find((item) => item.id === 'app:test-pack-42');
  assert.equal(pack.name, 'Test Pack');
  assert.deepEqual(pack.files.sort(), ['a-1.png', 'a.png']);

  const image = await handlers.get(CH.iconsRead)(trustedEvent(), 'app:test-pack-42', 'a.png');
  assert.match(image, /^data:image\/png;base64,/);
  assert.equal(await handlers.get(CH.iconsRead)(trustedEvent(), 'app:test-pack-42', '../../evil.png'), null);

  assert.deepEqual(await handlers.get(CH.iconsRemove)(trustedEvent(), 'ulanzi:other'), {
    ok: false,
    error: 'Icon packs installed by Ulanzi Studio are read-only',
  });
  assert.deepEqual(await handlers.get(CH.iconsRemove)(trustedEvent(), 'app:test-pack-42'), { ok: true });
  assert.equal(fs.existsSync(path.join(root, 'Icons', 'test-pack-42')), false);
});

test('plugin install asks for consent and installs the selected folder', async (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-plugin-ipc-'));
  const pluginDir = path.join(folder, 'Demo.sdPlugin');
  fs.mkdirSync(pluginDir);
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const installed = [];
  const sent = [];
  const sdPlugins = {
    install: async (source) => {
      installed.push(source);
      return { uuid: 'Demo.sdPlugin', name: 'Demo' };
    },
  };
  const { handlers } = harness(makeCtx({
    sdPlugins,
    send: (channel) => sent.push(channel),
    allPluginList: () => [{ uuid: 'Demo.sdPlugin' }],
  }));
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pluginDir] });
  dialog.showMessageBox = async () => ({ response: 1 });

  const result = await handlers.get(CH.pluginsInstallFolder)(trustedEvent());

  assert.equal(result.ok, true);
  assert.equal(result.sdk, 'streamdeck');
  assert.deepEqual(installed, [pluginDir]);
  assert.deepEqual(sent, [CH.pluginsChanged]);
});

test('declining plugin consent does not install anything', async (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-plugin-ipc-'));
  const pluginDir = path.join(folder, 'Demo.sdPlugin');
  fs.mkdirSync(pluginDir);
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  let installed = false;
  const sdPlugins = {
    install: async () => {
      installed = true;
      return { uuid: 'Demo.sdPlugin' };
    },
  };
  const { handlers } = harness(makeCtx({ sdPlugins }));
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pluginDir] });
  dialog.showMessageBox = async () => ({ response: 0 });

  const result = await handlers.get(CH.pluginsInstallFolder)(trustedEvent());

  assert.deepEqual(result, { ok: false, canceled: true });
  assert.equal(installed, false);
});

test('plugin remove and import delegate to the owning manager', async (t) => {
  const removed = [];
  const imported = [];
  const manager = {
    remove(uuid) {
      removed.push(uuid);
    },
    import(uuid) {
      imported.push(uuid);
      return { uuid, list: [] };
    },
  };
  const sent = [];
  const { handlers } = harness(makeCtx({
    findPluginOwner: () => manager,
    send: (channel) => sent.push(channel),
    allPluginList: () => [],
  }));

  const remove = await handlers.get(CH.pluginsRemove)(trustedEvent(), 'plugin');
  const importResult = await handlers.get(CH.pluginsImport)(trustedEvent(), 'vendor-plugin');

  assert.deepEqual(remove, { ok: true, list: [] });
  assert.deepEqual(importResult, { ok: true, uuid: 'vendor-plugin', list: [] });
  assert.deepEqual(removed, ['plugin']);
  assert.deepEqual(imported, ['vendor-plugin']);
  assert.deepEqual(sent, [CH.pluginsChanged, CH.pluginsChanged]);
});

test('dialog pickers return image data and audio paths', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-dialog-ipc-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const image = path.join(dir, 'icon.png');
  fs.writeFileSync(image, Buffer.from('fake-png'));
  const audio = path.join(dir, 'tone.mp3');
  fs.writeFileSync(audio, 'fake-audio');
  const { handlers } = harness(makeCtx());
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [image] });

  const picked = await handlers.get(CH.dialogPickImage)(trustedEvent());
  assert.equal(picked.ok, true);
  assert.match(picked.data, /^data:image\/png;base64,/);

  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [audio] });
  assert.equal(await handlers.get(CH.dialogPickAudio)(trustedEvent()), audio);
  dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  assert.deepEqual(await handlers.get(CH.dialogPickImage)(trustedEvent()), { canceled: true });
  assert.equal(await handlers.get(CH.dialogPickAudio)(trustedEvent()), null);
});

test('profile export validates the payload and writes the file', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-profile-ipc-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const destination = path.join(dir, 'profile.json');
  const { handlers } = harness(makeCtx());
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination });

  assert.deepEqual(
    await handlers.get(CH.profileExport)(trustedEvent(), { format: 'wrong' }),
    { ok: false, error: 'invalid profile payload' }
  );
  const payload = { format: 'ulanzi-deck-open-profile', name: 'My Profile', pages: [{ id: 'p' }] };
  const result = await handlers.get(CH.profileExport)(trustedEvent(), payload);
  assert.deepEqual(result, { ok: true, path: destination });
  assert.deepEqual(JSON.parse(fs.readFileSync(destination, 'utf8')), payload);
});

test('the import picker tells a Deck Open profile from a Ulanzi Studio file and validates it', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-profile-ipc-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'profile.json');
  const { handlers } = harness(makeCtx());
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });

  fs.writeFileSync(file, JSON.stringify({ format: 'wrong', pages: [] }));
  const invalid = await handlers.get(CH.importPick)(trustedEvent());
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /Not a Ulanzi Deck Open profile/);

  const payload = { format: 'ulanzi-deck-open-profile', pages: [{ id: 'p' }] };
  fs.writeFileSync(file, JSON.stringify(payload));
  const valid = await handlers.get(CH.importPick)(trustedEvent());
  assert.deepEqual(valid, { ok: true, kind: 'deckopen', data: payload, path: file });
});

test('openExternal only accepts web and mail links', async () => {
  const opened = [];
  const original = electron.shell.openExternal;
  electron.shell.openExternal = async (url) => opened.push(url);
  try {
    const { handlers } = harness(makeCtx());
    assert.deepEqual(await handlers.get(CH.appOpenExternal)(trustedEvent(), 'file:///etc/passwd'), {
      ok: false,
      error: 'Unsupported URL',
    });
    assert.deepEqual(await handlers.get(CH.appOpenExternal)(trustedEvent(), 'https://example.com'), { ok: true });
    assert.deepEqual(opened, ['https://example.com']);
  } finally {
    electron.shell.openExternal = original;
  }
});

test('appState reports recovery once', async () => {
  let recovery = 'backup';
  const ctx = makeCtx({
    store: {
      config: { settings: {} },
      save() {},
      takeRecovery: () => {
        const value = recovery;
        recovery = null;
        return value;
      },
    },
  });
  const { handlers } = harness(ctx);

  assert.equal((await handlers.get(CH.appState)(trustedEvent())).recovery, 'backup');
  assert.equal((await handlers.get(CH.appState)(trustedEvent())).recovery, null);
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

test('POP sanitizes items and resolves the chosen index', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  createdWindows.length = 0;
  const actions = require('../lib/actions');
  const originalOpenApp = actions.openApp;
  actions.openApp = async () => ({ ok: true });
  t.after(() => {
    actions.openApp = originalOpenApp;
  });
  const { handlers, listeners } = harness(makeCtx());
  const promise = handlers.get(CH.popShow)(trustedEvent(), [
    {
      label: 'x'.repeat(100),
      emoji: '😀'.repeat(20),
      icon: 'https://evil.example/icon.png',
      text: true,
      fontSize: 99,
      title: 't'.repeat(200),
    },
    { label: 'Second', icon: 'assets/actions/page-next.svg', fontSize: 8 },
  ]);
  for (let i = 0; i < 100 && !createdWindows.length; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const win = createdWindows.at(-1);
  assert.ok(win, 'the POP window is created');
  win.emit('ready-to-show');
  win.webContents.emit('did-finish-load');

  const sent = win.sent.find((entry) => entry.channel === CH.popItems);
  assert.ok(sent);
  assert.equal(sent.payload[0].label.length, 60);
  assert.equal(sent.payload[0].emoji.length, 8);
  assert.equal(sent.payload[0].icon, '');
  assert.equal(sent.payload[0].fontSize, 20);
  assert.equal(sent.payload[0].title.length, 160);
  assert.equal(sent.payload[1].icon, 'assets/actions/page-next.svg');

  const onChoice = listeners.get(CH.popChoice);
  assert.ok(onChoice);
  onChoice({ sender: win.webContents }, 1);

  assert.equal(await promise, 1);
  assert.equal(win.destroyed, true);
});

test('a second POP press closes the open palette', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  createdWindows.length = 0;
  const actions = require('../lib/actions');
  const originalOpenApp = actions.openApp;
  actions.openApp = async () => ({ ok: true });
  t.after(() => {
    actions.openApp = originalOpenApp;
  });
  const { handlers } = harness(makeCtx());
  const first = handlers.get(CH.popShow)(trustedEvent(), [{ label: 'One' }]);
  for (let i = 0; i < 100 && !createdWindows.length; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const win = createdWindows.at(-1);
  assert.ok(win);
  win.emit('ready-to-show');

  const second = await handlers.get(CH.popShow)(trustedEvent(), [{ label: 'Two' }]);

  assert.equal(second, -1);
  assert.equal(win.destroyed, true);
  assert.equal(await first, -1);
});

test('POP closes on blur after it is armed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  createdWindows.length = 0;
  const actions = require('../lib/actions');
  const originalOpenApp = actions.openApp;
  actions.openApp = async () => ({ ok: true });
  t.after(() => {
    actions.openApp = originalOpenApp;
  });
  const { handlers } = harness(makeCtx());
  const promise = handlers.get(CH.popShow)(trustedEvent(), [{ label: 'One' }]);
  for (let i = 0; i < 100 && !createdWindows.length; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const win = createdWindows.at(-1);
  assert.ok(win);
  win.emit('ready-to-show');
  t.mock.timers.tick(250);
  win.emit('blur');

  assert.equal(await promise, -1);
  assert.equal(win.destroyed, true);
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
