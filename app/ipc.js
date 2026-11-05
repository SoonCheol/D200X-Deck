'use strict';

const { app, BrowserWindow, dialog, ipcMain, screen, shell, systemPreferences } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { fileURLToPath } = require('node:url');

const actions = require('./lib/actions');
const importUlanzi = require('./lib/import-ulanzi');
const { extractZip, inspectZip, readZipEntry } = require('./lib/archive');
const { appIconDataUrl, resolveAppPath } = require('./lib/appicon');
const { fetchSiteIcon } = require('./lib/siteicon');
const { childDir, parsePackId } = require('./lib/iconpacks');
const { imageByExtension } = require('./lib/mime');
const { CH } = require('./lib/channels');
const { download: downloadPluginPackage } = require('./lib/sdcatalog');
const { buildPage, buildKeyUpdate } = require('./lib/page');
const sysstats = require('./lib/sysstats');

const RENDERER_DIR = path.join(__dirname, 'renderer');

/** IPC handlers only accept calls from our own renderer page. */
function trustedSender(event) {
  try {
    const url = String(event.senderFrame?.url || '');
    if (!url) return false;
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:' || parsed.host || parsed.search || parsed.hash) return false;
    return path.resolve(fileURLToPath(parsed)) === path.join(RENDERER_DIR, 'index.html');
  } catch {
    return false;
  }
}

/** Register a handler that refuses calls from anywhere but the app page. */
function handle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trustedSender(event)) return { ok: false, error: 'untrusted sender' };
    return handler(event, ...args);
  });
}

/**
 * Register every IPC channel. `ctx` provides the live objects created during
 * app startup; `getWin()` is lazy because the window is created afterwards.
 */
function registerIpc(ctx) {
  const {
    store,
    deck,
    plugins,
    sdPlugins,
    sdCatalog,
    market,
    send,
    devRun,
    checkForUpdates,
    scheduleUpdateCheck,
    allPluginList,
    syncAllPlugins,
    runPlugin,
    setPluginSettings,
    pluginInspectorUrl,
    findPluginOwner,
  } = ctx;
  const getWin = () => ctx.getWin();
  let popWindow = null;

function listApps() {
  const roots = [
    '/Applications',
    '/System/Applications',
    '/System/Applications/Utilities',
    '/Applications/Utilities',
    path.join(os.homedir(), 'Applications'),
  ];
  const seen = new Set();
  const apps = [];
  for (const root of roots) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.name.toLowerCase().endsWith('.app')) continue;
      const full = path.join(root, entry.name);
      if (seen.has(full)) continue;
      seen.add(full);
      apps.push({ name: entry.name.replace(/\.app$/i, ''), path: full });
    }
  }
  apps.sort((a, b) => a.name.localeCompare(b.name));
  return apps;
}

// ---------------------------------------------------------------- IPC

handle(CH.appState, () => ({
  config: store.config,
  status: deck.status(),
  seize: ctx.getSeizeState(),
  recovery: store.takeRecovery(),
  platform: process.platform,
  version: app.getVersion(),
}));

handle(CH.configSave, (_evt, config) => {
  const before = store.config?.settings || {};
  store.save(config);
  const after = store.config.settings;
  if (before.updateCheck !== after.updateCheck || before.updateHours !== after.updateHours) {
    scheduleUpdateCheck(5_000);
  }
  return { ok: true };
});

handle(CH.commandOutput, (_evt, command) => actions.runCommandOutput(String(command || '')));

handle(CH.deckPush, async (_evt, images, wideMode) => {
  if (!deck.connected) return { ok: false, error: 'not connected' };
  try {
    const zip = await buildPage(images, wideMode);
    deck.pushPage(zip);
    deck.setWideMode(wideMode);
    console.log(`[deck] pushed page: ${images.length} keys, ${(zip.length / 1024).toFixed(1)} KB`);
    return { ok: true, bytes: zip.length };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.deckPushKey, async (_evt, slot, png) => {
  if (!deck.connected) return { ok: false, error: 'not connected' };
  if (!/^[0-4]_[0-2]$/.test(String(slot || ''))) return { ok: false, error: 'invalid slot' };
  if (typeof png !== 'string' || !png || png.length > 1_500_000) {
    return { ok: false, error: 'invalid key image' };
  }
  try {
    const zip = await buildKeyUpdate(String(slot), png);
    deck.pushKey(zip);
    return { ok: true, bytes: zip.length };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.systemStats, () =>
  new Promise((resolve) => sysstats.sample(resolve))
);

handle(CH.deckWideMode, (_evt, mode) => {
  if (!deck.connected) return { ok: false, error: 'not connected' };
  try {
    deck.setWideMode(mode);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.deckBrightness, (_evt, level) => {
  try {
    deck.setBrightness(level);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.deckSleep, (_evt, seconds) => {
  try {
    deck.setSleepTime(seconds);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.deckReconnect, () => {
  deck.disconnect('Reconnecting');
  return { ok: deck.connect(), status: deck.status() };
});

handle(CH.appOpenExternal, (event, url) => {
  const target = String(url || '');
  if (!/^https?:|^mailto:/i.test(target)) return { ok: false, error: 'Unsupported URL' };
  shell.openExternal(target);
  return { ok: true };
});

handle(CH.appCheckUpdates, () => checkForUpdates());
handle(CH.appUpdateState, () => ({ ok: true, ...ctx.getUpdateState() }));
handle(CH.appUpdateSettingsChanged, () => {
  scheduleUpdateCheck(5_000);
  return { ok: true };
});

handle(CH.appAccessibility, () => ({
  trusted: systemPreferences.isTrustedAccessibilityClient(false),
}));

handle(CH.appRequestAccessibility, () => {
  const trusted = systemPreferences.isTrustedAccessibilityClient(true);
  // Always surface the pane: users press "Grant…" to inspect or change the
  // permission, even when it is currently granted.
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  return { trusted };
});

handle(CH.appOpenInputMonitoring, () => {
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent');
  return { ok: true };
});

handle(CH.actionRun, async (_evt, action, meta) => actions.execute(action, meta));

// ------------------------------------------------------------- store

handle(CH.storeSession, () => market.session());

handle(CH.storeLogin, async (_evt, userName, password) => {
  try {
    return { ok: true, ...(await market.login(String(userName || ''), String(password || ''))) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.storeLogout, () => {
  market.logout();
  return { ok: true };
});

handle(CH.storeCategories, async () => {
  try {
    return { ok: true, categories: await market.categories() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.storeList, async (_evt, query) => {
  try {
    return { ok: true, ...(await market.list(query || {})) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.storeCheckFile, async (_evt, id) => {
  try {
    const resource = await market.resource(String(id));
    return { ok: true, ...(await market.checkFile(resource.files)) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.storeResource, async (_evt, id) => {
  try {
    return { ok: true, resource: await market.resource(String(id)) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

const ICON_EXT = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif']);

function iconsRoot() {
  return path.join(process.env.ULANZI_CONFIG_DIR || app.getPath('userData'), 'Icons');
}

function officialIconsRoot() {
  return path.join(os.homedir(), 'Library/Application Support/Ulanzi/UlanziDeck/Icons');
}

/**
 * "app:<dir>" for packs managed here, "ulanzi:<dir>" for Ulanzi Studio's packs.
 * Returns null unless the id names a direct child of one of those roots.
 */
function packDir(id) {
  const parsed = parsePackId(id);
  if (!parsed) return null;
  return childDir(parsed.scope === 'ulanzi' ? officialIconsRoot() : iconsRoot(), parsed.name);
}

function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

handle(CH.storeInstallIcons, async (_evt, id) => {
  const tempZip = path.join(os.tmpdir(), `ulanzi-icons-${Date.now()}.zip`);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-icons-'));
  try {
    const resource = await market.resource(String(id));
    if (!resource.files) throw new Error('This icon pack has no downloadable file');
    await market.download(resource.files, tempZip);
    await extractZip(tempZip, tempDir);

    const slugify = (value) =>
      String(value || '')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
    const slug = `${slugify(resource.name) || 'icons'}-${slugify(id) || 'pack'}`;
    const dest = path.join(iconsRoot(), slug);
    if (path.dirname(dest) !== iconsRoot()) throw new Error('Invalid icon pack name');
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });

    const images = walkFiles(tempDir).filter((file) => ICON_EXT.has(path.extname(file).toLowerCase()));
    let count = 0;
    for (const file of images) {
      let name = path.basename(file);
      let target = path.join(dest, name);
      let n = 1;
      while (fs.existsSync(target)) {
        target = path.join(dest, `${path.basename(name, path.extname(name))}-${n++}${path.extname(name)}`);
      }
      fs.copyFileSync(file, target);
      count += 1;
    }
    fs.writeFileSync(
      path.join(dest, 'pack.json'),
      JSON.stringify({ name: resource.name, author: resource.author, id: String(id), icon: resource.icon }, null, 2)
    );
    return { ok: true, pack: { id: slug, name: resource.name, count } };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    try { fs.rmSync(tempZip, { force: true }); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

handle(CH.iconsList, () => {
  const packs = [];
  for (const [scope, root] of [['app', iconsRoot()], ['ulanzi', officialIconsRoot()]]) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      let meta = {};
      try {
        meta = JSON.parse(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8'));
      } catch {
        /* no metadata */
      }
      let files = [];
      try {
        files = fs
          .readdirSync(dir)
          .filter((f) => !f.startsWith('.')) // hide macOS AppleDouble/resource forks
          .filter((f) => ICON_EXT.has(path.extname(f).toLowerCase()));
      } catch {
        continue;
      }
      if (!files.length) continue;
      packs.push({
        id: `${scope}:${entry.name}`,
        name: meta.name || entry.name,
        icon: meta.icon || null,
        files,
        source: scope,
        readOnly: scope === 'ulanzi',
      });
    }
  }
  return packs;
});

handle(CH.iconsRead, (_evt, pack, file) => {
  try {
    const dir = packDir(pack);
    if (!dir) return null;
    const target = path.join(dir, path.basename(String(file)));
    if (path.dirname(target) !== dir || !fs.existsSync(target)) return null;
    const mime = imageByExtension(path.extname(target)) || 'image/png';
    return `data:${mime};base64,${fs.readFileSync(target).toString('base64')}`;
  } catch {
    return null;
  }
});

handle(CH.iconsOpenFolder, () => {
  fs.mkdirSync(iconsRoot(), { recursive: true });
  shell.openPath(iconsRoot());
  return { ok: true };
});

handle(CH.iconsRemove, (_evt, pack) => {
  const id = String(pack);
  if (!id.startsWith('app:')) {
    return { ok: false, error: 'Icon packs installed by Ulanzi Studio are read-only' };
  }
  const dir = packDir(id);
  if (!dir) return { ok: false, error: 'Unknown icon pack' };
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: true };
});

handle(CH.storeInstall, async (_evt, id) => {
  const temp = path.join(os.tmpdir(), `ulanzi-store-${Date.now()}.zip`);
  try {
    const resource = await market.resource(String(id));
    if (!resource.files) throw new Error('This store item has no downloadable file');
    await market.download(resource.files, temp);
    const out = await plugins.install(temp);
    send(CH.pluginsChanged);
    return { ok: true, ...out, list: allPluginList() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    try { fs.rmSync(temp, { force: true }); } catch { /* ignore */ }
  }
});

handle(CH.sdstoreList, (event) => {
  return sdCatalog.list();
});

handle(CH.sdstoreUpdates, (event, installed) => {
  return sdCatalog.updates(installed || []);
});

handle(CH.sdstoreInstall, async (event, id) => {
  if (!sdPlugins) return { ok: false, error: 'Plugin host is not ready' };
  const temp = path.join(os.tmpdir(), `ulanzi-sdstore-${Date.now()}.zip`);
  try {
    const resolved = await sdCatalog.resolve(String(id));
    await downloadPluginPackage(resolved.url, temp);
    const out = await sdPlugins.install(temp);
    send(CH.pluginsChanged);
    return { ok: true, ...out, version: resolved.version, list: allPluginList() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    try { fs.rmSync(temp, { force: true }); } catch { /* ignore */ }
  }
});

handle(CH.pluginsList, () => allPluginList());

handle(CH.pluginsSync, (_evt, wanted) => {
  syncAllPlugins(wanted);
  return { ok: true };
});

handle(CH.pluginsRun, (_evt, actionid) => ({ ok: runPlugin(String(actionid)) }));

handle(CH.pluginsRestart, (_evt, uuid) => {
  const id = String(uuid);
  const owner = findPluginOwner(id);
  if (!owner) return { ok: false, error: 'Plugin not found' };
  owner.restart(id);
  return { ok: true };
});

handle(CH.pluginsKey, (_evt, actionid, pressed) => ({
  ok: Boolean(sdPlugins?.key(String(actionid), Boolean(pressed))),
}));

handle(CH.pluginsInstallRosetta, () => {
  const command = 'softwareupdate --install-rosetta --agree-to-license';
  try {
    spawn(
      'osascript',
      ['-e', `tell application "Terminal" to do script "${command}"`, '-e', 'tell application "Terminal" to activate'],
      { detached: true, stdio: 'ignore' }
    ).unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

async function looksLikeStreamDeckPlugin(source) {
  try {
    if (fs.statSync(source).isDirectory()) {
      if (source.endsWith('.sdPlugin')) return true;
      const walk = (dir, depth = 0) => {
        if (depth > 2) return false;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          if (entry.name.endsWith('.sdPlugin')) return true;
          if (walk(path.join(dir, entry.name), depth + 1)) return true;
        }
        return false;
      };
      if (walk(source)) return true;
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
        return !manifest.UUID && Boolean(manifest.CodePathMac || manifest.CodePath || manifest.CodePaths || manifest.OS);
      } catch {
        return false;
      }
    }
    const { names } = inspectZip(source);
    const listing = names.join('\n');
    if (/(^|\/)[^/]+\.sdPlugin(\/|$)/m.test(listing)) return true;
    if (/(^|\/)[^/]+\.ulanziPlugin(\/|$)/m.test(listing)) return false;
    try {
      const raw = (await readZipEntry(source, 'manifest.json')).replace(/^\uFEFF/, '');
      const manifest = JSON.parse(raw);
      return !manifest.UUID && Boolean(manifest.CodePathMac || manifest.CodePath || manifest.CodePaths || manifest.OS);
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

async function confirmPluginInstall() {
  const { response } = await dialog.showMessageBox(getWin(), {
    type: 'warning',
    buttons: ['Cancel', 'Install'],
    defaultId: 0,
    cancelId: 0,
    message: 'Install this plugin?',
    detail:
      'Plugins run on your Mac with your user permissions, outside the app sandbox. Only install plugins you trust.',
  });
  return response === 1;
}

async function installAnyPlugin(source) {
  const manager = (await looksLikeStreamDeckPlugin(source)) ? sdPlugins : plugins;
  const out = await manager.install(source);
  return { ...out, sdk: manager === sdPlugins ? 'streamdeck' : 'ulanzi', list: allPluginList() };
}

handle(CH.pluginsInstallFolder, async () => {
  const res = await dialog.showOpenDialog(getWin(), {
    title: 'Select a plugin folder (.ulanziPlugin or .sdPlugin)',
    properties: ['openDirectory'],
  });
  if (res.canceled || res.filePaths.length === 0) return { canceled: true };
  if (!(await confirmPluginInstall())) return { ok: false, canceled: true };
  try {
    const out = await installAnyPlugin(res.filePaths[0]);
    send(CH.pluginsChanged);
    return { ok: true, ...out };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.pluginsInstallZip, async () => {
  const res = await dialog.showOpenDialog(getWin(), {
    title: 'Select a plugin ZIP',
    properties: ['openFile'],
    filters: [{ name: 'Plugin package', extensions: ['zip', 'streamdeckplugin'] }],
  });
  if (res.canceled || res.filePaths.length === 0) return { canceled: true };
  if (!(await confirmPluginInstall())) return { ok: false, canceled: true };
  try {
    const out = await installAnyPlugin(res.filePaths[0]);
    send(CH.pluginsChanged);
    return { ok: true, ...out };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.pluginsInspectorUrl, (_evt, payload) => pluginInspectorUrl(payload || {}));

handle(CH.pluginsSetSettings, (_evt, actionid, settings) => ({
  ok: setPluginSettings(String(actionid), settings || {}),
}));

handle(CH.pluginsReload, () => {
  plugins?.reload();
  sdPlugins?.reload();
  const list = allPluginList();
  send(CH.pluginsChanged);
  return { ok: true, list };
});

handle(CH.pluginsImport, (_evt, uuid) => {
  try {
    const manager = findPluginOwner(String(uuid)) || plugins;
    const out = manager.import(String(uuid));
    send(CH.pluginsChanged);
    return { ok: true, ...out, list: allPluginList() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.pluginsRemove, (_evt, uuid) => {
  try {
    const manager = findPluginOwner(String(uuid)) || plugins;
    manager.remove(String(uuid));
    send(CH.pluginsChanged);
    return { ok: true, list: allPluginList() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.pluginsOpenFolder, () => {
  fs.mkdirSync(plugins.appPluginsDir, { recursive: true });
  shell.openPath(plugins.appPluginsDir);
  return { ok: true };
});

handle(CH.pluginsOpenSdFolder, () => {
  fs.mkdirSync(sdPlugins.appPluginsDir, { recursive: true });
  shell.openPath(sdPlugins.appPluginsDir);
  return { ok: true };
});

handle(CH.pluginsOpenLog, () => {
  const file = path.join(process.env.ULANZI_CONFIG_DIR || app.getPath('userData'), 'streamdeck.log');
  try {
    if (!fs.existsSync(file)) fs.writeFileSync(file, '');
  } catch { /* ignore */ }
  shell.openPath(file);
  return { ok: true, file };
});

handle(CH.pluginsReveal, (_evt, uuid) => {
  const owner = findPluginOwner(String(uuid));
  const meta = owner?.plugins.get(String(uuid));
  if (!meta) return { ok: false };
  shell.showItemInFolder(meta.dir);
  return { ok: true };
});

// ---------------------------------------------------------------- import

async function readImportTarget(target) {
  return importUlanzi.previewProfile(target);
}

handle(CH.importScan, () => {
  try {
    return { ok: true, profiles: importUlanzi.listProfiles() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.importPick, async () => {
  const res = await dialog.showOpenDialog(getWin(), {
    title: 'Choose a Ulanzi profile',
    properties: ['openFile'],
    filters: [{ name: 'Ulanzi profile', extensions: ['ulanziDeckProfile', 'zip', 'ulanziDeckProfilePack'] }],
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  try {
    const { profiles, cleanup } = await readImportTarget(res.filePaths[0]);
    if (cleanup) fs.rmSync(cleanup, { recursive: true, force: true });
    return { ok: true, file: res.filePaths[0], profiles: profiles.map((p) => ({ ...p, path: res.filePaths[0] })) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.importPreview, async (_evt, target) => {
  try {
    const { profiles, cleanup } = await readImportTarget(String(target));
    if (cleanup) fs.rmSync(cleanup, { recursive: true, force: true });
    return { ok: true, profiles };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.importApply, async (_evt, payload) => {
  const { target, pageIds } = payload || {};
  let cleanup = null;
  try {
    const { profiles, cleanup: temp } = await readImportTarget(String(target));
    cleanup = temp;
    const profile = profiles[0];
    if (!profile) throw new Error('No pages found in this profile');
    const wanted = new Set((pageIds || profile.pages.map((p) => p.id)).map(String));
    const incoming = profile.pages.filter((p) => wanted.has(p.id)).map((p) => JSON.parse(JSON.stringify(p)));
    if (!incoming.length) throw new Error('Select at least one page to import');

    const mode = ['new', 'merge', 'replace'].includes(payload.mode) ? payload.mode : 'new';
    if (!Array.isArray(store.config.profiles)) store.config.profiles = [];
    const activeProfile =
      store.config.profiles.find((p) => p.id === store.config.activeProfileId) || store.config.profiles[0];
    if (!activeProfile) throw new Error('No profile to import into');

    // Replacing a profile keeps the profile itself (and its pinned keys); only
    // its pages are replaced. Creating a new profile leaves everything alone.
    if (mode === 'replace') {
      store.config.pages = store.config.pages.filter((p) => p.profileId !== activeProfile.id);
    }

    const usedIds = new Set(store.config.pages.map((p) => p.id));
    const idMap = new Map();
    for (const page of incoming) {
      if (usedIds.has(page.id)) {
        const next = randomUUID();
        idMap.set(page.id, next);
        page.id = next;
      } else {
        idMap.set(page.id, page.id);
      }
      usedIds.add(page.id);
    }

    const remapAction = (action) => {
      if (!action || typeof action !== 'object') return action;
      if (action.type === 'page' && action.op === 'goto' && idMap.has(action.value)) {
        action.value = idMap.get(action.value);
      }
      if (Array.isArray(action.steps)) {
        for (const step of action.steps) if (step?.action) step.action = remapAction(step.action);
      }
      return action;
    };
    for (const page of incoming) {
      if (page.parentId) {
        if (idMap.has(page.parentId)) page.parentId = idMap.get(page.parentId);
        else delete page.parentId;
      }
      for (const key of Object.values(page.keys || {})) {
        for (const field of ['action', 'holdAction', 'doubleAction']) {
          if (key[field]) remapAction(key[field]);
        }
      }
    }

    let targetProfile;
    let profileName;
    if (mode === 'new') {
      const takenProfiles = new Set(store.config.profiles.map((p) => String(p.name).toLowerCase()));
      profileName = profile.name || 'Imported profile';
      for (let i = 2; takenProfiles.has(profileName.toLowerCase()); i += 1) {
        profileName = `${profile.name || 'Imported profile'} (${i})`;
      }
      targetProfile = { id: randomUUID(), name: profileName };
      store.config.profiles.push(targetProfile);
    } else {
      targetProfile = activeProfile;
      profileName = activeProfile.name;
    }

    const takenPages = new Set(
      store.config.pages.filter((p) => p.profileId === targetProfile.id).map((p) => p.name.toLowerCase())
    );
    for (const page of incoming) {
      const base = page.name || 'Page';
      let name = base;
      for (let i = 2; takenPages.has(name.toLowerCase()); i += 1) name = `${base} (${i})`;
      page.name = name;
      page.profileId = targetProfile.id;
      takenPages.add(name.toLowerCase());
    }

    store.config.pages.push(...incoming);
    store.config.activeProfileId = targetProfile.id;
    store.config.activePageId = incoming[0].id;
    store.save(store.config);

    return {
      ok: true,
      mode,
      profileName,
      importedProfiles: mode === 'new' ? 1 : 0,
      importedPages: incoming.length,
      importedKeys: incoming.reduce((sum, p) => sum + Object.keys(p.keys || {}).length, 0),
      skipped: profile.report.skipped,
      unmapped: profile.report.unmapped,
      missingPlugins: [...new Set(profile.report.missingPlugins)],
      warnings: profile.report.warnings,
    };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    if (cleanup) fs.rmSync(cleanup, { recursive: true, force: true });
  }
});

handle(CH.dialogPickAudio, async () => {
  const res = await dialog.showOpenDialog(getWin(), {
    title: 'Choose an audio file',
    properties: ['openFile'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aiff', 'aif', 'ogg', 'flac'] }],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

handle(CH.dialogPickImage, async () => {
  const res = await dialog.showOpenDialog(getWin(), {
    title: 'Choose a key image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }],
  });
  if (res.canceled || res.filePaths.length === 0) return { canceled: true };
  try {
    const file = res.filePaths[0];
    const mime = imageByExtension(path.extname(file)) || 'application/octet-stream';
    const data = fs.readFileSync(file);
    return { ok: true, data: `data:${mime};base64,${data.toString('base64')}` };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

const execFileAsync = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(file, args, options, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });

let frontmostCache = { at: 0, value: null, pending: null };

/**
 * Non-blocking frontmost-app lookup. The renderer polls this every few seconds,
 * so spawning `lsappinfo` synchronously here would stutter the whole UI.
 */
function frontmostApp({ fresh = false } = {}) {
  if (!fresh && Date.now() - frontmostCache.at < 1000) return Promise.resolve(frontmostCache.value);
  if (frontmostCache.pending) return frontmostCache.pending;
  frontmostCache.pending = (async () => {
    try {
      const asn = (await execFileAsync('lsappinfo', ['front'], { encoding: 'utf8' }))
        .trim()
        .replace(/:$/, '');
      if (!asn) return null;
      const info = await execFileAsync(
        'lsappinfo',
        ['info', '-only', 'name', asn, '-only', 'bundleid', asn, '-only', 'bundlepath', asn],
        { encoding: 'utf8' }
      );
      const bundleId = /bundleID="([^"]+)"/.exec(info)?.[1] || '';
      const appPath = /bundle path="([^"]+)"/.exec(info)?.[1] || '';
      const name = /^"([^"]+)"/.exec(info.trim())?.[1] || path.basename(appPath, '.app');
      return { bundleId, name, path: appPath };
    } catch {
      return null;
    } finally {
      frontmostCache.pending = null;
    }
  })();
  return frontmostCache.pending.then((value) => {
    frontmostCache = { at: Date.now(), value, pending: null };
    return value;
  });
}

handle(CH.appLoginItem, (event, enabled) => {
  try {
    if (!devRun) {
      app.setLoginItemSettings({ openAtLogin: enabled === true, openAsHidden: true });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.profileExport, async (event, payload) => {
  if (!payload || payload.format !== 'ulanzi-deck-open-profile') {
    return { ok: false, error: 'invalid profile payload' };
  }
  const safe = String(payload.name || 'Profile').replace(/[^A-Za-z0-9 ._-]/g, '').trim() || 'Profile';
  const result = await dialog.showSaveDialog(getWin(), {
    title: 'Export profile',
    defaultPath: path.join(app.getPath('documents'), `${safe}.ulanzideckprofile`),
    filters: [{ name: 'Ulanzi Deck Open profile', extensions: ['ulanzideckprofile'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    // Profiles are shared, so image refs become self-contained data URLs.
    fs.writeFileSync(result.filePath, JSON.stringify(store.expandImages(payload), null, 2));
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.profileImport, async (event) => {
  const result = await dialog.showOpenDialog(getWin(), {
    title: 'Import profile',
    properties: ['openFile'],
    filters: [{ name: 'Ulanzi Deck Open profile', extensions: ['ulanzideckprofile', 'json'] }],
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
  try {
    const file = result.filePaths[0];
    if (fs.statSync(file).size > 128 * 1024 * 1024) throw new Error('Profile file is too large (max 128 MB)');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || data.format !== 'ulanzi-deck-open-profile') throw new Error('Not a Ulanzi Deck Open profile');
    if (!Array.isArray(data.pages) || !data.pages.length) throw new Error('Profile has no pages');
    return { ok: true, data, path: file };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle(CH.popShow, async (event, items) => {
  if (!Array.isArray(items) || !items.length) return -1;
  const clean = items.slice(0, 9).map((item) => {
    const fontSize = Number(item?.fontSize);
    return {
      label: String(item?.label || '').slice(0, 60),
      emoji: String(item?.emoji || '').slice(0, 8),
      icon: /^assets\/[a-z0-9/_-]+\.svg$/i.test(String(item?.icon || '')) ? String(item.icon) : '',
      text: item?.text === true,
      fontSize: Number.isFinite(fontSize)
        ? Math.min(20, Math.max(10, Math.round(fontSize)))
        : 0,
      title: String(item?.title || '').slice(0, 160),
    };
  });
  if (popWindow) {
    // A second POP press toggles the open palette closed instead of replacing it.
    try { popWindow.destroy(); } catch { /* ignore */ }
    popWindow = null;
    return -1;
  }
  // The palette takes keyboard focus, so remember the app the user came from
  // and restore it before the chosen action runs.
  const previous = await frontmostApp({ fresh: true });
  const fromThisApp = previous?.bundleId === 'com.edufalcao.ulanzideckopen';
  const width = 430;
  const rows = Math.ceil(clean.length / 3);
  // Header + three 84px item rows with 8px gaps, plus room for the panel
  // padding so nine actions never need a scrollbar.
  const height = Math.min(520, Math.max(170, 62 + rows * 92));
  return new Promise((resolve) => {
    const popup = new BrowserWindow({
      width,
      height,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: true,
      acceptFirstMouse: true,
      hasShadow: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'pop-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    popWindow = popup;
    let settled = false;
    let armed = false;
    const restorePrevious = async () => {
      if (!previous?.path || fromThisApp) return;
      try { await actions.openApp(previous.path); } catch { /* focus is best-effort */ }
    };
    const finish = async (index, { restore = true } = {}) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener(CH.popChoice, onChoice);
      if (popWindow === popup) popWindow = null;
      try { popup.destroy(); } catch { /* already gone */ }
      if (restore) await restorePrevious();
      resolve(Number.isInteger(index) ? index : -1);
    };
    const onChoice = (choiceEvent, index) => {
      if (choiceEvent.sender === popup.webContents) finish(index);
    };
    ipcMain.on(CH.popChoice, onChoice);
    popup.on('closed', () => finish(-1));
    popup.webContents.once('did-finish-load', () => popup.webContents.send(CH.popItems, clean));
    popup.once('ready-to-show', () => {
      const cursor = screen.getCursorScreenPoint();
      const area = screen.getDisplayNearestPoint(cursor).workArea;
      const x = Math.max(area.x + 8, Math.min(area.x + area.width - width - 8, Math.round(cursor.x - width / 2)));
      const y = Math.max(area.y + 8, Math.min(area.y + area.height - height - 8, Math.round(cursor.y - height / 2)));
      popup.setPosition(x, y);
      popup.setAlwaysOnTop(true, 'floating');
      popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      popup.show();
      popup.focus();
      // Ignore the activation blur while the window is settling.
      setTimeout(() => { armed = true; }, 250);
    });
    popup.on('blur', () => {
      if (armed) finish(-1, { restore: false });
    });
    popup.loadFile(path.join(__dirname, 'renderer', 'pop.html')).catch(() => finish(-1));
    setTimeout(() => finish(-1), 15_000);
  });
});

handle(CH.appsFrontmost, () => frontmostApp());

handle(CH.appsList, () => listApps());

handle(CH.appsIcon, async (_evt, appPath) => {
  if (typeof appPath !== 'string' || !appPath.trim()) return null;
  const resolved = await resolveAppPath(appPath);
  return resolved ? appIconDataUrl(resolved) : null;
});

handle(CH.fetchSiteIcon, async (_evt, url) => {
  try {
    const icon = await fetchSiteIcon(url);
    return { ok: true, ...icon };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

}

module.exports = { registerIpc };
