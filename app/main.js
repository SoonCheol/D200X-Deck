'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, shell, Tray, nativeImage, protocol, session, systemPreferences, powerMonitor, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

const { Deck } = require('./lib/deck');
const { Store } = require('./lib/store');
const { buildPage } = require('./lib/page');
const sysstats = require('./lib/sysstats');
const { PluginManager, pluginRootDirs } = require('./lib/plugins');
const { StreamDeckPlugins } = require('./lib/streamdeck-plugins');
const { fetchLatestRelease, isNewer, plainNotes } = require('./lib/updates');
const { StreamDeckCatalog, download: downloadPluginPackage } = require('./lib/sdcatalog');
const { fetchSiteIcon } = require('./lib/siteicon');
const { appIconDataUrl, resolveAppPath } = require('./lib/appicon');
const { Market } = require('./lib/market');
const importUlanzi = require('./lib/import-ulanzi');
const { execFileSync } = require('node:child_process');
const actions = require('./lib/actions');

let win = null;
let store = null;
let deck = null;
let plugins = null;
let sdPlugins = null;
const sdCatalog = new StreamDeckCatalog();
let market = null;
let seizeProc = null;
let seizeWarned = false;
let reconnectTimer = null;
let tray = null;
let isQuitting = false;
let quitPromptOpen = false;
let popWindow = null;

// A second launch would fight over the HID device and the plugin port. Dev and
// screenshot runs set ULANZI_CONFIG_DIR, so they are allowed to coexist.
const devRun = Boolean(process.env.ULANZI_SHOT || process.env.ULANZI_CONFIG_DIR);
// Started by the login item: stay in the menu bar instead of opening the editor.
const launchHidden = app.isPackaged && !devRun && app.getLoginItemSettings().wasOpenedAsHidden;
if (!devRun && !app.requestSingleInstanceLock()) {
  app.quit();
}
app.on('second-instance', () => showWindow());

/** IPC handlers only accept calls from our own renderer page. */
function trustedSender(event) {
  try {
    const url = event.senderFrame?.url || '';
    return url.startsWith('file://') && url.includes('/renderer/index.html');
  } catch {
    return false;
  }
}

function guarded(handler) {
  return (event, ...args) => {
    if (!trustedSender(event)) return { ok: false, error: 'untrusted sender' };
    return handler(event, ...args);
  };
}

function setDockVisible(visible) {
  // Menu-bar-only while the editor is closed; a normal Dock icon while it is open.
  if (process.platform !== 'darwin' || !app.dock) return;
  try {
    if (visible) app.dock.show();
    else app.dock.hide();
    console.log(`[dock] ${visible ? 'shown' : 'hidden'}`);
  } catch {
    /* dock not available (e.g. non-macOS) */
  }
}

function createWindow() {
  const [wantedW, wantedH] = String(process.env.ULANZI_SIZE || '').split('x').map(Number);
  const area = screen.getPrimaryDisplay().workAreaSize;
  const defaultW = Math.min(1600, Math.max(1080, area.width - 80));
  const defaultH = Math.min(900, Math.max(700, area.height - 80));
  win = new BrowserWindow({
    width: Number.isFinite(wantedW) && wantedW > 0 ? wantedW : defaultW,
    height: Number.isFinite(wantedH) && wantedH > 0 ? wantedH : defaultH,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#0b0e14',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    acceptFirstMouse: true,
    show: !launchHidden,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  win.webContents.on('console-message', (event) => {
    console.log(`[renderer:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
  });
  win.webContents.on('preload-error', (_e, p, err) => console.error('[preload]', p, err));
  win.webContents.on('did-fail-load', (_e, code, desc) => console.error('[load]', code, desc));
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
      setDockVisible(false);
    }
  });
  win.on('show', () => setDockVisible(true));
  win.on('hide', () => setDockVisible(false));

  // The window only ever shows our own file. Anything trying to navigate
  // elsewhere (a plugin inspector link, injected content, a future import) is
  // refused so it can never inherit the preload bridge.
  const isLocalPage = (url) => String(url).startsWith('file://') && String(url).includes('/renderer/');
  win.webContents.on('will-navigate', (event, url) => {
    if (!isLocalPage(url)) event.preventDefault();
  });
  win.webContents.on('will-redirect', (event, url) => {
    if (!isLocalPage(url)) event.preventDefault();
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] gone:', details.reason);
    if (win && !win.isDestroyed()) win.reload();
  });
  win.webContents.on('unresponsive', () => console.error('[renderer] unresponsive'));

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(String(url))) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });

  setDockVisible(!launchHidden);

  if (process.env.ULANZI_SHOT) {
    require('./scripts/harness').attachScreenshotHarness({
      win,
      send,
      quitNow: () => {
        isQuitting = true;
        app.quit();
      },
    });
  }
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function showWindow() {
  setDockVisible(true);
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'tray.png')
    : path.join(__dirname, 'build', 'tray.png');
  const image = nativeImage.createFromPath(iconPath);
  image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip('Ulanzi Deck Open');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Ulanzi Deck Open', click: showWindow },
      { type: 'separator' },
      { label: 'Quit Ulanzi Deck Open', click: requestQuit },
    ])
  );
  tray.on('click', showWindow);
}

async function requestQuit() {
  if (isQuitting || quitPromptOpen) return;
  quitPromptOpen = true;
  // A message box shown while the app is hidden is dismissed immediately by
  // macOS and resolves with the first button, so surface the window first.
  const wasHidden = !win || win.isDestroyed() || !win.isVisible();
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  }
  app.focus({ steal: true });
  const parent = win && !win.isDestroyed() && win.isVisible() ? win : null;
  const { response } = await dialog.showMessageBox(parent, {
    type: 'question',
    // Cancel is the default and the first button: if macOS ever dismisses the
    // box on its own it resolves to Cancel, never to Quit.
    buttons: ['Cancel', 'Quit'],
    defaultId: 0,
    cancelId: 0,
    message: 'Quit Ulanzi Deck Open?',
    detail:
      'The deck will keep its last page. Plugins, hotkeys and the clock will stop until you reopen the app.',
  });
  quitPromptOpen = false;
  console.log('[quit] confirmation response', response);
  if (response === 1) {
    isQuitting = true;
    app.quit();
    return;
  }
  if (wasHidden && win && !win.isDestroyed()) win.hide();
}

let checkingForUpdates = false;
let updateTimer = null;
let notifiedVersion = '';
let updateState = {
  current: app.getVersion(),
  latest: '',
  url: '',
  notes: '',
  update: false,
  checkedAt: 0,
  error: '',
};

async function checkForUpdates() {
  if (checkingForUpdates) return { ok: false, error: 'Already checking', ...updateState };
  checkingForUpdates = true;
  try {
    const release = await fetchLatestRelease();
    const current = app.getVersion();
    if (!release) {
      updateState = { current, latest: '', url: '', notes: '', update: false, checkedAt: Date.now(), error: '' };
      return { ok: true, ...updateState };
    }
    updateState = {
      current,
      latest: release.version,
      url: release.url,
      notes: plainNotes(release.notes),
      update: isNewer(release.version, current),
      checkedAt: Date.now(),
      error: '',
    };
    return { ok: true, ...updateState };
  } catch (err) {
    updateState = {
      ...updateState,
      current: app.getVersion(),
      checkedAt: Date.now(),
      error: err.message || String(err),
    };
    return { ok: false, error: updateState.error, ...updateState };
  } finally {
    checkingForUpdates = false;
  }
}

function updateSettings() {
  return store?.config?.settings || {};
}

function scheduleUpdateCheck(delayMs) {
  clearTimeout(updateTimer);
  if (updateSettings().updateCheck === false) return;
  updateTimer = setTimeout(runScheduledUpdateCheck, delayMs);
}

async function runScheduledUpdateCheck() {
  const settings = updateSettings();
  if (settings.updateCheck === false) return;
  const result = await checkForUpdates();
  if (result.ok && result.update && result.latest && result.latest !== notifiedVersion) {
    notifiedVersion = result.latest;
    send('app:update-available', {
      current: result.current,
      latest: result.latest,
      url: result.url,
      notes: result.notes,
    });
  }
  scheduleUpdateCheck(Math.max(1, Number(settings.updateHours) || 6) * 3_600_000);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { label: 'Check for Updates…', click: () => checkForUpdates() },
            { type: 'separator' },
            { label: 'Show Main Window', accelerator: 'CmdOrCtrl+0', click: showWindow },
            { label: 'Reconnect Deck', click: () => deck.connect() },
            { type: 'separator' },
            { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
            { type: 'separator' }, { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            if (win && !win.isDestroyed()) win.close();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const noDeck = Boolean(process.env.ULANZI_NO_DECK);

function initDeck() {
  // The official app re-sends the current page when the Mac unlocks; without
  // that, a deck that fell back to its stored standby image stays there.
  powerMonitor.on('lock-screen', () => send('app:lock-screen'));
  powerMonitor.on('unlock-screen', () => send('app:display-restore'));
  powerMonitor.on('resume', () => send('app:display-restore'));
  deck = new Deck();
  deck.on('status', (status) => {
    console.log(`[deck] ${status.connected ? 'connected' : 'offline'}: ${status.message}`);
    send('deck:status', status);
  });
  deck.on('key', (event) => {
    console.log(
      `[deck] key index=${event.index} ${event.pressed ? 'down' : 'up'} t=${Date.now()} flags=${event.flags}`
    );
    send('deck:key', event);
  });
  deck.on('brightness', (level) => send('deck:brightness', level));
  deck.on('error', (message) => send('deck:error', message));

  const tryConnect = () => {
    if (noDeck) {
      send('deck:status', { connected: false, message: 'Disconnected', info: null });
      return;
    }
    if (!deck.connected) {
      const ok = deck.connect();
      if (!ok) send('deck:status', deck.status());
    }
  };
  tryConnect();
  reconnectTimer = setInterval(tryConnect, 4000);
}

function listApps() {
  const os = require('node:os');
const { randomUUID } = require('node:crypto');
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

const htmlPluginWindows = new Map();
const sdHtmlWindows = new Map();

function initPlugins() {
  const baseDir = process.env.ULANZI_CONFIG_DIR || app.getPath('userData');
  const dirs = [path.join(baseDir, 'Plugins'), ...pluginRootDirs()];
  plugins = new PluginManager({ dirs, appPluginsDir: dirs[0], port: 3906, appVersion: app.getVersion() });
  plugins.launchHtml = (meta) => {
    if (htmlPluginWindows.has(meta.uuid)) return;
    const frame = new BrowserWindow({
      show: false,
      width: 420,
      height: 320,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    htmlPluginWindows.set(meta.uuid, frame);
    frame.webContents.on('console-message', (event) => {
      if (event.level === 'error') console.log(`[plugin:${meta.uuid}]`, String(event.message).slice(0, 200));
    });
    frame.on('closed', () => {
      htmlPluginWindows.delete(meta.uuid);
      plugins?.htmlExited(meta.uuid);
    });
    frame.loadFile(meta.codePath).catch((err) => {
      console.error(`[plugin:${meta.uuid}] could not load ${meta.codePath}:`, err.message);
      try { frame.close(); } catch { /* ignore */ }
    });
  };
  plugins.openView = (msg, action) => {
    let target = String(msg.url || '');
    if (msg.param && typeof msg.param === 'object') {
      const qs = new URLSearchParams(msg.param).toString();
      if (qs) target += (target.includes('?') ? '&' : '?') + qs;
    }
    if (!/^https?:/i.test(target) && action) {
      const file = path.resolve(action.meta.dir, target.replace(/^\.?\//, ''));
      if (!file.startsWith(action.meta.dir)) return;
      const view = new BrowserWindow({
        width: 760,
        height: 680,
        title: action.meta.name || 'Plugin',
        backgroundColor: '#0b0e14',
      });
      view.loadFile(file).catch((err) => console.error('[plugin view]', err.message));
      return;
    }
    if (/^https?:|^mailto:/i.test(target)) shell.openExternal(target);
  };

  plugins.selectDialog = async (msg) => {
    const type = msg.type === 'folder' ? 'folder' : 'file';
    const filters = [];
    const extensions = [...String(msg.filter || '').matchAll(/\*\.([a-z0-9]+)/gi)].map((m) => m[1]);
    if (extensions.length) filters.push({ name: 'Supported files', extensions });
    const options = {
      title: type === 'folder' ? 'Choose a folder' : 'Choose a file',
      properties: type === 'folder' ? ['openDirectory', 'createDirectory'] : ['openFile'],
      ...(filters.length ? { filters } : {}),
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled || !result.filePaths.length
      ? { canceled: true, path: '' }
      : { canceled: false, path: result.filePaths[0] };
  };

  plugins.stopHtml = (uuid) => {
    const frame = htmlPluginWindows.get(uuid);
    if (frame) {
      htmlPluginWindows.delete(uuid);
      try { frame.destroy(); } catch { /* ignore */ }
    }
  };
  plugins.scan();
  plugins.start();
  plugins.on('state', (payload) => send('plugin:state', payload));
  plugins.on('state-index', (payload) => send('plugin:state-index', payload));
  plugins.on('title', (payload) => send('plugin:title', payload));
  plugins.on('settings', (payload) => send('plugin:settings', payload));
  plugins.on('toast', (payload) => send('plugin:toast', payload));
  plugins.on('alert', (payload) => send('plugin:alert', payload));
  plugins.on('error', (message) => {
    console.error('[plugins]', message);
    send('plugin:error', message);
  });
  plugins.on('connected', (uuid) => console.log('[plugins] connected', uuid));
}

function initSdPlugins() {
  const baseDir = process.env.ULANZI_CONFIG_DIR || app.getPath('userData');
  sdPlugins = new StreamDeckPlugins({
    appPluginsDir: path.join(baseDir, 'StreamDeckPlugins'),
    language: 'en',
    appVersion: app.getVersion(),
    logFile: path.join(baseDir, 'streamdeck.log'),
  });
  sdPlugins.launchHtml = (meta, info) => {
    if (sdHtmlWindows.has(meta.uuid)) return;
    const frame = new BrowserWindow({
      show: false,
      width: 420,
      height: 320,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    sdHtmlWindows.set(meta.uuid, frame);
    frame.on('closed', () => {
      sdHtmlWindows.delete(meta.uuid);
      sdPlugins?.htmlExited(meta.uuid);
    });
    const file = path.join(meta.dir, meta.code.path);
    frame.loadFile(file).then(() => {
      let tries = 0;
      const connect = () => {
        if (tries++ > 100) return;
        const payload = [sdPlugins.port, meta.uuid, 'registerPlugin', info];
        frame.webContents
          .executeJavaScript(
            `(() => {
              try {
                if (typeof connectOpenActionSocket === 'function') return connectOpenActionSocket(${JSON.stringify(
                  payload[0]
                )}, ${JSON.stringify(payload[1])}, ${JSON.stringify(payload[2])}, ${JSON.stringify(payload[3])}), true;
                if (typeof connectElgatoStreamDeckSocket === 'function') return connectElgatoStreamDeckSocket(${JSON.stringify(
                  payload[0]
                )}, ${JSON.stringify(payload[1])}, ${JSON.stringify(payload[2])}, ${JSON.stringify(payload[3])}), true;
              } catch (err) { console.error(err); }
              return false;
            })()`
          )
          .then((ok) => { if (!ok) setTimeout(connect, 100); })
          .catch(() => setTimeout(connect, 100));
      };
      connect();
    }).catch((err) => {
      console.error(`[sd:${meta.uuid}] could not load ${file}:`, err.message);
      try { frame.close(); } catch { /* ignore */ }
    });
  };
  sdPlugins.stopHtml = (uuid) => {
    const frame = sdHtmlWindows.get(uuid);
    if (frame) {
      sdHtmlWindows.delete(uuid);
      try { frame.destroy(); } catch { /* ignore */ }
    }
  };
  sdPlugins.scan();
  sdPlugins.start();
  sdPlugins.on('state', (payload) => send('plugin:state', payload));
  sdPlugins.on('state-index', (payload) => send('plugin:state-index', payload));
  sdPlugins.on('title', (payload) => send('plugin:title', payload));
  sdPlugins.on('settings', (payload) => send('plugin:settings', payload));
  sdPlugins.on('alert', (payload) => send('plugin:alert', payload));
  sdPlugins.on('ok', (payload) => send('plugin:ok', payload));
  sdPlugins.on('error', (message) => {
    console.error('[sd-plugins]', message);
    send('plugin:error', message);
  });
  sdPlugins.on('connected', (uuid) => console.log('[sd-plugins] connected', uuid));
  sdPlugins.on('switch-profile', (payload) => send('plugin:switch-profile', payload));
  sdPlugins.on('brightness', (payload) => {
    const value = Number(payload.value) || 0;
    const current = Number(store.config.settings.brightness) || 0;
    const next = Math.max(0, Math.min(100, payload.action === 'increase' ? current + value : payload.action === 'decrease' ? current - value : value));
    store.config.settings.brightness = next;
    store.save(store.config);
    try { deck?.setBrightness(next); } catch { /* ignore */ }
    send('deck:brightness', next);
  });
}

function allPluginManagers() {
  return [plugins, sdPlugins].filter(Boolean);
}

function allPluginList() {
  return allPluginManagers().flatMap((manager) => manager.list());
}

function findPluginOwner(uuid) {
  for (const manager of allPluginManagers()) {
    if (manager.plugins?.has(uuid)) return manager;
  }
  return null;
}

function syncAllPlugins(wanted) {
  const list = Array.isArray(wanted) ? wanted : [];
  plugins?.sync(list.filter((item) => (item.sdk || 'ulanzi') !== 'streamdeck'));
  sdPlugins?.sync(list.filter((item) => item.sdk === 'streamdeck'));
}

function runPlugin(actionid) {
  if (sdPlugins?.run(actionid)) return true;
  return Boolean(plugins?.run(actionid));
}

function setPluginSettings(actionid, settings) {
  if (sdPlugins?.setActionSettings(actionid, settings)) return true;
  return Boolean(plugins?.setActionSettings(actionid, settings));
}

function pluginInspectorUrl(payload) {
  if (payload?.sdk === 'streamdeck') return sdPlugins?.inspectorUrl(payload) || null;
  const url = plugins?.inspectorUrl(payload) || null;
  return url || sdPlugins?.inspectorUrl(payload) || null;
}

function startHidSeize() {
  const bin = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'hidseize')
    : path.join(__dirname, 'bin', 'hidseize');
  if (!fs.existsSync(bin)) return;
  if (seizeProc && seizeProc.exitCode === null) return;
  seizeProc = spawnHelper(bin);
}

function spawnHelper(bin) {
  const { spawn } = require('node:child_process');
  const proc = spawn(bin, [], { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.on('error', (err) => {
    console.error('[seize] helper failed:', err.message);
    if (seizeProc === proc) seizeProc = null;
  });
  proc.stdout.on('data', (d) => console.log('[seize]', d.toString().trim()));
  proc.stderr.on('data', (d) => {
    const text = d.toString().trim();
    console.log('[seize]', text);
    if (text.includes('notpermitted') && !seizeWarned) {
      seizeWarned = true;
      send('seize:permission', true);
    }
    if (text.startsWith('seized')) {
      seizeWarned = false;
      send('seize:permission', false);
    }
  });
  proc.on('exit', () => {
    if (seizeProc === proc) seizeProc = null;
  });
  return proc;
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'ulanzi-pi',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
  {
    scheme: 'sd-pi',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

const SD_PI_THEME = `
<style id="ulanzi-sd-theme">
  :root, html {
    color-scheme: dark;
    --bg: #0b0f16 !important;
    --field: #141a25 !important;
    --text: #e8ecf4 !important;
    --label: #8b95a7 !important;
    --sdpi-bgcolor: #0b0f16 !important;
    --sdpi-color: #e8ecf4 !important;
    --sdpi-background: #141a25 !important;
  }
  html, body {
    background: #0b0f16 !important;
    color: #e8ecf4 !important;
  }
  select, input, textarea, button {
    box-sizing: border-box !important;
    min-width: 0 !important;
    max-width: 100% !important;
    background: #141a25 !important;
    color: #e8ecf4 !important;
    border-color: #2a3342 !important;
    border-radius: 8px !important;
  }
  /* A custom background removes the native select arrow; draw our own. */
  select {
    -webkit-appearance: none !important;
    appearance: none !important;
    background-image: linear-gradient(45deg, transparent 50%, #8b97ab 50%), linear-gradient(135deg, #8b97ab 50%, transparent 50%) !important;
    background-position: calc(100% - 16px) 50%, calc(100% - 11px) 50% !important;
    background-size: 5px 5px, 5px 5px !important;
    background-repeat: no-repeat !important;
    background-color: #141a25 !important;
    padding-right: 28px !important;
  }
  select:focus, input:focus, textarea:focus, button:focus {
    outline: none !important;
    border-color: #4f8cff !important;
  }
  input[type="checkbox"], input[type="radio"] { accent-color: #4f8cff !important; }
  a { color: #6ea8ff !important; }
</style>`;

const PI_THEME = `
<style id="ulanzi-deck-open-theme">
  :root { color-scheme: dark; }
  html { scrollbar-gutter: stable; }
  html, body {
    background: #0b0f16 !important;
    color: #e8ecf4 !important;
    font-family: -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif !important;
    font-size: 12px !important;
    margin: 0 !important;
  }
  body { padding: 0 12px 8px 0 !important; }
  .udpi-wrapper, .uspi-wrapper { background: transparent !important; }
  .uspi-heading, .udpi-heading {
    color: #8b95a7 !important;
    font-size: 10.5px !important;
    font-weight: 600 !important;
    letter-spacing: 1.2px !important;
    text-transform: uppercase !important;
    border-bottom: 1px solid #232a36 !important;
    padding: 10px 0 6px !important;
    margin: 0 0 8px !important;
  }
  input, select, textarea {
    box-sizing: border-box !important;
    min-width: 0 !important;
    max-width: 100% !important;
    background: #141a25 !important;
    border: 1px solid #2a3342 !important;
    border-radius: 8px !important;
    color: #e8ecf4 !important;
    font-family: inherit !important;
    font-size: 12px !important;
    padding: 7px 9px !important;
  }
  /* A custom background removes the native select arrow; draw our own. */
  select {
    -webkit-appearance: none !important;
    appearance: none !important;
    background-image: linear-gradient(45deg, transparent 50%, #8b97ab 50%), linear-gradient(135deg, #8b97ab 50%, transparent 50%) !important;
    background-position: calc(100% - 16px) 50%, calc(100% - 11px) 50% !important;
    background-size: 5px 5px, 5px 5px !important;
    background-repeat: no-repeat !important;
    background-color: #141a25 !important;
    padding-right: 28px !important;
  }
  /* Buttons keep the plugin's own layout (height/line-height/padding) and only
     borrow the app's colour and border treatment. */
  button {
    background: #141a25 !important;
    border: 1px solid #2a3342 !important;
    border-radius: 8px !important;
    color: #e8ecf4 !important;
    font-family: inherit !important;
    font-size: 12px !important;
  }
  input[type="checkbox"], input[type="radio"] { accent-color: #4f8cff !important; width: 14px; height: 14px; }
  input:focus, select:focus, textarea:focus { outline: none !important; border-color: #4f8cff !important; }
  label { color: #e8ecf4 !important; }
  a { color: #6ea8ff !important; }
  ::-webkit-scrollbar { width: 12px; height: 12px; }
  ::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.035) !important;
    border-radius: 8px !important;
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.24) !important;
    border: 2px solid transparent !important;
    background-clip: content-box !important;
    border-radius: 8px !important;
  }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.38) !important; background-clip: content-box !important; }
  ::-webkit-scrollbar-thumb:active { background: rgba(255, 255, 255, 0.5) !important; background-clip: content-box !important; }
  ::-webkit-scrollbar-corner { background: transparent !important; }
</style>
<script>
  (function () {
    function report() {
      try {
        var vh = window.innerHeight;
        function visible(el) {
          var style = getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
        }
        // Full-height wrappers (.udpi-wrapper is height:100%) would report the
        // frame's own height and grow it forever; measure their children instead.
        function measure(el) {
          if (!visible(el)) return 0;
          var r = el.getBoundingClientRect();
          if (r.height >= vh - 2 && el.children.length) {
            var max = 0;
            for (var i = 0; i < el.children.length; i++) max = Math.max(max, measure(el.children[i]));
            return max;
          }
          return r.bottom;
        }
        var h = 0;
        for (var i = 0; i < document.body.children.length; i++) {
          h = Math.max(h, measure(document.body.children[i]));
        }
        parent.postMessage({ type: 'ulanzi-pi-height', height: Math.ceil(h + 8) }, '*');
      } catch (e) {}
    }
    window.addEventListener('load', report);
    setTimeout(report, 250);
    setTimeout(report, 800);
    if (window.ResizeObserver) new ResizeObserver(report).observe(document.body);
    window.addEventListener('resize', report);
  })();
</script>`;

function injectPiTheme(html) {
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${PI_THEME}</body>`);
  return html + PI_THEME;
}

app.whenReady().then(() => {
  // Plugin property inspectors talk to their own local services (e.g. a daemon
  // on 127.0.0.1). Their pages come from our private scheme, so allow them the
  // same loopback access the vendor app gives them.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Only inspector pages get relaxed CORS; the app itself keeps the normal rules.
    const fromInspector = String(details.frame?.url || '').startsWith('ulanzi-pi://');
    if (!fromInspector) return callback({});
    callback({
      responseHeaders: {
        ...(details.responseHeaders || {}),
        'Access-Control-Allow-Origin': ['*'],
        'Access-Control-Allow-Headers': ['*'],
        'Access-Control-Allow-Methods': ['GET, POST, PUT, PATCH, DELETE, OPTIONS'],
      },
    });
  });

  store = new Store(process.env.ULANZI_CONFIG_DIR || app.getPath('userData'));
  store.load();
  if (app.isPackaged && !devRun) {
    try {
      app.setLoginItemSettings({
        openAtLogin: store.config.settings.launchAtLogin === true,
        openAsHidden: true,
      });
    } catch {
      /* launch items can be unavailable in some environments */
    }
  }
  market = new Market({
    dir: process.env.ULANZI_CONFIG_DIR || app.getPath('userData'),
    language: 'en',
    appVersion: app.getVersion(),
  });
  initDeck();
  initPlugins();
  initSdPlugins();
  startHidSeize();
  protocol.handle('ulanzi-pi', async (request) => {
    try {
      const url = new URL(request.url);
      const parts = url.pathname.split('/').filter(Boolean);
      const folder = decodeURIComponent(parts[0] || '');
      const rel = parts.slice(1).map(decodeURIComponent).join('/');
      const meta = [...(plugins?.plugins?.values() || [])].find((m) => path.basename(m.dir) === folder);
      if (!meta) return new Response('not found', { status: 404 });
      const file = path.join(meta.dir, rel);
      if (path.relative(meta.dir, file).startsWith('..')) return new Response('forbidden', { status: 403 });
      const ext = path.extname(file).toLowerCase();
      let body = fs.readFileSync(file);
      if (ext === '.html' || ext === '.htm') {
        body = Buffer.from(injectPiTheme(body.toString('utf8')), 'utf8');
      }
      const type =
        ext === '.js' ? 'text/javascript' :
        ext === '.css' ? 'text/css' :
        ext === '.json' ? 'application/json' :
        ext === '.svg' ? 'image/svg+xml' :
        ext === '.png' ? 'image/png' :
        ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
        ext === '.woff2' ? 'font/woff2' :
        ext === '.woff' ? 'font/woff' :
        ext === '.html' || ext === '.htm' ? 'text/html' : 'application/octet-stream';
      return new Response(body, { headers: { 'content-type': type } });
    } catch (err) {
      return new Response(String(err.message || err), { status: 500 });
    }
  });

  protocol.handle('sd-pi', async (request) => {
    try {
      const url = new URL(request.url);
      const parts = url.pathname.split('/').filter(Boolean);
      const folder = decodeURIComponent(parts[0] || '');
      const rel = parts.slice(1).map(decodeURIComponent).join('/');
      const meta = [...(sdPlugins?.plugins?.values() || [])].find((m) => path.basename(m.dir) === folder);
      if (!meta) return new Response('not found', { status: 404 });
      const file = path.join(meta.dir, rel);
      if (path.relative(meta.dir, file).startsWith('..')) return new Response('forbidden', { status: 403 });
      const ext = path.extname(file).toLowerCase();
      let body = fs.readFileSync(file);
      if (ext === '.html' || ext === '.htm') {
        const actionid = url.searchParams.get('actionid') || '';
        const connect = sdPlugins?.inspectorConnect(actionid);
        const payload = connect ? JSON.stringify(connect) : 'null';
        const bridge = `${SD_PI_THEME}<script>(function(){
          const payload = ${payload};
          function connect() {
            if (!payload) {
              // The action was not registered when this page was served (for
              // example a plugin action that is still being synced). Reload
              // with a fresh payload instead of staying disconnected forever.
              const params = new URLSearchParams(location.search);
              const attempt = Number(params.get('attempt') || 0);
              if (attempt < 12) {
                params.set('attempt', String(attempt + 1));
                setTimeout(() => { location.href = location.pathname + '?' + params.toString(); }, 250);
              }
              return true;
            }
            try {
              if (typeof connectOpenActionSocket === 'function') { connectOpenActionSocket(...payload); return true; }
              if (typeof connectElgatoStreamDeckSocket === 'function') { connectElgatoStreamDeckSocket(...payload); return true; }
            } catch (err) { console.error(err); return true; }
            return false;
          }
          if (!connect()) {
            let n = 0;
            const timer = setInterval(() => { if (connect() || ++n > 100) clearInterval(timer); }, 50);
          }
          const sdOpen = window.open;
          window.open = (url, target) => {
            if (target === '_self' || target === '_top') return sdOpen.call(window, url, target);
            try {
              const absolute = new URL(url, window.location.href).href;
              parent.postMessage({ type: 'sd-pi-open', url: absolute }, '*');
            } catch (e) {}
            return null;
          };
          function report() {
            try {
              const visible = (el) => {
                const style = getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
              };
              const vh = window.innerHeight;
              let h = 0;
              for (const el of document.body.children) {
                if (!visible(el)) continue;
                const rect = el.getBoundingClientRect();
                if (rect.height >= vh - 2) {
                  // A full-height wrapper would otherwise report the iframe's
                  // own height and grow without bound; measure its children.
                  for (const child of el.children) {
                    if (!visible(child)) continue;
                    h = Math.max(h, child.getBoundingClientRect().bottom);
                  }
                } else {
                  h = Math.max(h, rect.bottom);
                }
              }
              parent.postMessage({ type: 'ulanzi-pi-height', height: Math.ceil(h + 8) }, '*');
            } catch (e) {}
          }
          window.addEventListener('load', report);
          setTimeout(report, 250);
          setTimeout(report, 800);
          if (window.ResizeObserver) new ResizeObserver(report).observe(document.body);
          window.addEventListener('resize', report);
        })();</script>`;
        const html = body.toString('utf8');
        body = Buffer.from(/<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${bridge}</body>`) : html + bridge, 'utf8');
      }
      const type =
        ext === '.js' ? 'text/javascript' :
        ext === '.mjs' || ext === '.cjs' ? 'text/javascript' :
        ext === '.css' ? 'text/css' :
        ext === '.json' ? 'application/json' :
        ext === '.svg' ? 'image/svg+xml' :
        ext === '.png' ? 'image/png' :
        ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
        ext === '.woff2' ? 'font/woff2' :
        ext === '.woff' ? 'font/woff' :
        ext === '.html' || ext === '.htm' ? 'text/html' : 'application/octet-stream';
      return new Response(body, { headers: { 'content-type': type } });
    } catch (err) {
      return new Response(String(err.message || err), { status: 500 });
    }
  });

  createWindow();
  buildMenu();
  createTray();
  scheduleUpdateCheck(20_000);

  app.on('activate', () => showWindow());
});

app.on('window-all-closed', () => {
  // Keep running in the menu bar; quitting goes through requestQuit().
});

app.on('before-quit', (event) => {
  if (!isQuitting) {
    event.preventDefault();
    requestQuit();
  }
});

app.on('will-quit', () => {
  if (reconnectTimer) clearInterval(reconnectTimer);
  if (deck) deck.disconnect('App closed');
  if (plugins) plugins.stopAll();
  if (sdPlugins) sdPlugins.stopAll();
  if (seizeProc) {
    try { seizeProc.kill(); } catch { /* ignore */ }
  }
  if (tray) tray.destroy();
});

// ---------------------------------------------------------------- IPC

ipcMain.handle('app:state', () => ({
  config: store.config,
  status: deck.status(),
  platform: process.platform,
  version: app.getVersion(),
}));

ipcMain.handle('config:save', guarded((_evt, config) => {
  store.save(config);
  return { ok: true };
}));

ipcMain.handle('deck:push', async (_evt, images, wideMode) => {
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

ipcMain.handle('system:stats', () =>
  new Promise((resolve) => sysstats.sample(resolve))
);

ipcMain.handle('deck:wide-mode', (_evt, mode) => {
  if (!deck.connected) return { ok: false, error: 'not connected' };
  try {
    deck.setWideMode(mode);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('deck:brightness', (_evt, level) => {
  try {
    deck.setBrightness(level);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('deck:sleep', (_evt, seconds) => {
  try {
    deck.setSleepTime(seconds);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('deck:reconnect', () => {
  deck.disconnect('Reconnecting');
  return { ok: deck.connect(), status: deck.status() };
});

ipcMain.handle('app:open-external', (event, url) => {
  if (!trustedSender(event)) return { ok: false, error: 'untrusted sender' };
  const target = String(url || '');
  if (!/^https?:|^mailto:/i.test(target)) return { ok: false, error: 'Unsupported URL' };
  shell.openExternal(target);
  return { ok: true };
});

ipcMain.handle('app:check-updates', () => checkForUpdates());
ipcMain.handle('app:update-state', () => ({ ok: true, ...updateState }));
ipcMain.handle('app:update-settings-changed', () => {
  scheduleUpdateCheck(5_000);
  return { ok: true };
});

ipcMain.handle('app:accessibility', () => ({
  trusted: systemPreferences.isTrustedAccessibilityClient(false),
}));

ipcMain.handle('app:request-accessibility', () => {
  const trusted = systemPreferences.isTrustedAccessibilityClient(true);
  // Always surface the pane: users press "Grant…" to inspect or change the
  // permission, even when it is currently granted.
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  return { trusted };
});

ipcMain.handle(
  'action:run',
  guarded(async (_evt, action) => actions.execute(action))
);

// ------------------------------------------------------------- store

ipcMain.handle('store:session', () => market.session());

ipcMain.handle('store:login', async (_evt, userName, password) => {
  try {
    return { ok: true, ...(await market.login(String(userName || ''), String(password || ''))) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('store:logout', () => {
  market.logout();
  return { ok: true };
});

ipcMain.handle('store:categories', async () => {
  try {
    return { ok: true, categories: await market.categories() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('store:list', async (_evt, query) => {
  try {
    return { ok: true, ...(await market.list(query || {})) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('store:check-file', async (_evt, id) => {
  try {
    const resource = await market.resource(String(id));
    return { ok: true, ...(await market.checkFile(resource.files)) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('store:resource', async (_evt, id) => {
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

/** "app:<dir>" for packs managed here, "ulanzi:<dir>" for Ulanzi Studio's packs. */
function packDir(id) {
  const [scope, name] = String(id).includes(':') ? String(id).split(':') : ['app', String(id)];
  const root = scope === 'ulanzi' ? officialIconsRoot() : iconsRoot();
  return path.join(root, name);
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

ipcMain.handle('store:install-icons', async (_evt, id) => {
  const tempZip = path.join(os.tmpdir(), `ulanzi-icons-${Date.now()}.zip`);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-icons-'));
  try {
    const resource = await market.resource(String(id));
    if (!resource.files) throw new Error('This icon pack has no downloadable file');
    await market.download(resource.files, tempZip);
    execFileSync('unzip', ['-oq', tempZip, '-d', tempDir], { stdio: ['ignore', 'ignore', 'pipe'] });

    const slug = `${String(resource.name || 'icons').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-${id}`;
    const dest = path.join(iconsRoot(), slug);
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

ipcMain.handle('icons:list', () => {
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

ipcMain.handle('icons:read', (_evt, pack, file) => {
  try {
    const dir = packDir(pack);
    const target = path.join(dir, path.basename(String(file)));
    if (!target.startsWith(dir) || !fs.existsSync(target)) return null;
    const ext = path.extname(target).toLowerCase();
    const mime =
      ext === '.svg' ? 'image/svg+xml' :
      ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
      ext === '.webp' ? 'image/webp' :
      ext === '.gif' ? 'image/gif' : 'image/png';
    return `data:${mime};base64,${fs.readFileSync(target).toString('base64')}`;
  } catch {
    return null;
  }
});

ipcMain.handle('icons:open-folder', () => {
  fs.mkdirSync(iconsRoot(), { recursive: true });
  shell.openPath(iconsRoot());
  return { ok: true };
});

ipcMain.handle('icons:remove', guarded((_evt, pack) => {
  const id = String(pack);
  if (id.startsWith('ulanzi:') || !id.startsWith('app:')) {
    return { ok: false, error: 'Icon packs installed by Ulanzi Studio are read-only' };
  }
  fs.rmSync(packDir(id), { recursive: true, force: true });
  return { ok: true };
}));

ipcMain.handle('store:install', async (_evt, id) => {
  const temp = path.join(os.tmpdir(), `ulanzi-store-${Date.now()}.zip`);
  try {
    const resource = await market.resource(String(id));
    if (!resource.files) throw new Error('This store item has no downloadable file');
    await market.download(resource.files, temp);
    const out = plugins.install(temp);
    send('plugins:changed');
    return { ok: true, ...out, list: allPluginList() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    try { fs.rmSync(temp, { force: true }); } catch { /* ignore */ }
  }
});

ipcMain.handle('sdstore:list', (event) => {
  if (!trustedSender(event)) return [];
  return sdCatalog.list();
});

ipcMain.handle('sdstore:updates', (event, installed) => {
  if (!trustedSender(event)) return {};
  return sdCatalog.updates(installed || []);
});

ipcMain.handle('sdstore:install', async (event, id) => {
  if (!trustedSender(event)) return { ok: false, error: 'untrusted sender' };
  if (!sdPlugins) return { ok: false, error: 'Plugin host is not ready' };
  const temp = path.join(os.tmpdir(), `ulanzi-sdstore-${Date.now()}.zip`);
  try {
    const resolved = await sdCatalog.resolve(String(id));
    await downloadPluginPackage(resolved.url, temp);
    const out = sdPlugins.install(temp);
    send('plugins:changed');
    return { ok: true, ...out, version: resolved.version, list: allPluginList() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    try { fs.rmSync(temp, { force: true }); } catch { /* ignore */ }
  }
});

ipcMain.handle('plugins:list', () => allPluginList());

ipcMain.handle('plugins:sync', (_evt, wanted) => {
  syncAllPlugins(wanted);
  return { ok: true };
});

ipcMain.handle('plugins:run', (_evt, actionid) => ({ ok: runPlugin(String(actionid)) }));

ipcMain.handle('plugins:key', (_evt, actionid, pressed) => ({
  ok: Boolean(sdPlugins?.key(String(actionid), Boolean(pressed))),
}));

ipcMain.handle('plugins:install-rosetta', () => {
  const command = 'softwareupdate --install-rosetta --agree-to-license';
  try {
    const { spawn } = require('node:child_process');
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

function looksLikeStreamDeckPlugin(source) {
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
    const { execFileSync } = require('node:child_process');
    const listing = execFileSync('unzip', ['-Z1', source], { encoding: 'utf8' });
    if (/(^|\/)[^/]+\.sdPlugin(\/|$)/m.test(listing)) return true;
    if (/(^|\/)[^/]+\.ulanziPlugin(\/|$)/m.test(listing)) return false;
    try {
      const raw = execFileSync('unzip', ['-p', source, 'manifest.json'], { encoding: 'utf8' }).replace(/^\uFEFF/, '');
      const manifest = JSON.parse(raw);
      return !manifest.UUID && Boolean(manifest.CodePathMac || manifest.CodePath || manifest.CodePaths || manifest.OS);
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

function installAnyPlugin(source) {
  const manager = looksLikeStreamDeckPlugin(source) ? sdPlugins : plugins;
  const out = manager.install(source);
  return { ...out, sdk: manager === sdPlugins ? 'streamdeck' : 'ulanzi', list: allPluginList() };
}

ipcMain.handle('plugins:install-folder', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Select a plugin folder (.ulanziPlugin or .sdPlugin)',
    properties: ['openDirectory'],
  });
  if (res.canceled || res.filePaths.length === 0) return { canceled: true };
  try {
    const out = installAnyPlugin(res.filePaths[0]);
    send('plugins:changed');
    return { ok: true, ...out };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('plugins:install-zip', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Select a plugin ZIP',
    properties: ['openFile'],
    filters: [{ name: 'Plugin package', extensions: ['zip', 'streamdeckplugin'] }],
  });
  if (res.canceled || res.filePaths.length === 0) return { canceled: true };
  try {
    const out = installAnyPlugin(res.filePaths[0]);
    send('plugins:changed');
    return { ok: true, ...out };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('plugins:inspector-url', (_evt, payload) => pluginInspectorUrl(payload || {}));

ipcMain.handle('plugins:set-settings', (_evt, actionid, settings) => ({
  ok: setPluginSettings(String(actionid), settings || {}),
}));

ipcMain.handle('plugins:reload', () => {
  plugins?.reload();
  sdPlugins?.reload();
  const list = allPluginList();
  send('plugins:changed');
  return { ok: true, list };
});

ipcMain.handle('plugins:import', guarded((_evt, uuid) => {
  try {
    const manager = findPluginOwner(String(uuid)) || plugins;
    const out = manager.import(String(uuid));
    send('plugins:changed');
    return { ok: true, ...out, list: allPluginList() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}));

ipcMain.handle('plugins:remove', guarded((_evt, uuid) => {
  try {
    const manager = findPluginOwner(String(uuid)) || plugins;
    manager.remove(String(uuid));
    send('plugins:changed');
    return { ok: true, list: allPluginList() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}));

ipcMain.handle('plugins:open-folder', () => {
  fs.mkdirSync(plugins.appPluginsDir, { recursive: true });
  shell.openPath(plugins.appPluginsDir);
  return { ok: true };
});

ipcMain.handle('plugins:open-sd-folder', () => {
  fs.mkdirSync(sdPlugins.appPluginsDir, { recursive: true });
  shell.openPath(sdPlugins.appPluginsDir);
  return { ok: true };
});

ipcMain.handle('plugins:open-log', () => {
  const file = path.join(process.env.ULANZI_CONFIG_DIR || app.getPath('userData'), 'streamdeck.log');
  try {
    if (!fs.existsSync(file)) fs.writeFileSync(file, '');
  } catch { /* ignore */ }
  shell.openPath(file);
  return { ok: true, file };
});

ipcMain.handle('plugins:reveal', (_evt, uuid) => {
  const owner = findPluginOwner(String(uuid));
  const meta = owner?.plugins.get(String(uuid));
  if (!meta) return { ok: false };
  shell.showItemInFolder(meta.dir);
  return { ok: true };
});

// ---------------------------------------------------------------- import

function readImportTarget(target) {
  return importUlanzi.previewProfile(target);
}

ipcMain.handle('import:scan', () => {
  try {
    return { ok: true, profiles: importUlanzi.listProfiles() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('import:pick', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose a Ulanzi profile',
    properties: ['openFile'],
    filters: [{ name: 'Ulanzi profile', extensions: ['ulanziDeckProfile', 'zip', 'ulanziDeckProfilePack'] }],
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  try {
    const { profiles, cleanup } = readImportTarget(res.filePaths[0]);
    if (cleanup) fs.rmSync(cleanup, { recursive: true, force: true });
    return { ok: true, file: res.filePaths[0], profiles: profiles.map((p) => ({ ...p, path: res.filePaths[0] })) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('import:preview', guarded((_evt, target) => {
  try {
    const { profiles, cleanup } = readImportTarget(String(target));
    if (cleanup) fs.rmSync(cleanup, { recursive: true, force: true });
    return { ok: true, profiles };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}));

ipcMain.handle('import:apply', guarded((_evt, payload) => {
  const { target, pageIds } = payload || {};
  let cleanup = null;
  try {
    const { profiles, cleanup: temp } = readImportTarget(String(target));
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
}));

ipcMain.handle('dialog:pick-audio', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose an audio file',
    properties: ['openFile'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aiff', 'aif', 'ogg', 'flac'] }],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

ipcMain.handle('dialog:pick-image', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose a key image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }],
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  const file = res.filePaths[0];
  const ext = path.extname(file).toLowerCase().replace('.', '');
  const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const data = fs.readFileSync(file);
  return `data:${mime};base64,${data.toString('base64')}`;
});

function frontmostApp() {
  try {
    const asn = execFileSync('lsappinfo', ['front'], { encoding: 'utf8' })
      .trim()
      .replace(/:$/, '');
    if (!asn) return null;
    const info = execFileSync(
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
  }
}

ipcMain.handle('app:login-item', (event, enabled) => {
  if (!trustedSender(event)) return { ok: false, error: 'untrusted sender' };
  try {
    if (!devRun) {
      app.setLoginItemSettings({ openAtLogin: enabled === true, openAsHidden: true });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('profile:export', async (event, payload) => {
  if (!trustedSender(event)) return { ok: false, error: 'untrusted sender' };
  if (!payload || payload.format !== 'ulanzi-deck-open-profile') {
    return { ok: false, error: 'invalid profile payload' };
  }
  const safe = String(payload.name || 'Profile').replace(/[^A-Za-z0-9 ._-]/g, '').trim() || 'Profile';
  const result = await dialog.showSaveDialog(win, {
    title: 'Export profile',
    defaultPath: path.join(app.getPath('documents'), `${safe}.ulanzideckprofile`),
    filters: [{ name: 'Ulanzi Deck Open profile', extensions: ['ulanzideckprofile'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2));
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('profile:import', async (event) => {
  if (!trustedSender(event)) return { ok: false, error: 'untrusted sender' };
  const result = await dialog.showOpenDialog(win, {
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

ipcMain.handle('pop:show', async (event, items) => {
  if (!trustedSender(event)) return -1;
  if (!Array.isArray(items) || !items.length) return -1;
  const clean = items.slice(0, 9).map((item) => ({
    label: String(item?.label || '').slice(0, 60),
    emoji: String(item?.emoji || '').slice(0, 8),
  }));
  if (popWindow) {
    // A second POP press toggles the open palette closed instead of replacing it.
    try { popWindow.destroy(); } catch { /* ignore */ }
    popWindow = null;
    return -1;
  }
  const width = 430;
  const rows = Math.ceil(clean.length / 3);
  const height = Math.min(520, Math.max(170, 62 + rows * 84));
  return new Promise((resolve) => {
    const win = new BrowserWindow({
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
      focusable: false,
      acceptFirstMouse: true,
      hasShadow: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'pop-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    popWindow = win;
    let settled = false;
    const finish = (index) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener('pop:choice', onChoice);
      if (popWindow === win) popWindow = null;
      try { win.destroy(); } catch { /* already gone */ }
      resolve(Number.isInteger(index) ? index : -1);
    };
    const onChoice = (choiceEvent, index) => {
      if (choiceEvent.sender === win.webContents) finish(index);
    };
    ipcMain.on('pop:choice', onChoice);
    win.on('closed', () => finish(-1));
    win.webContents.once('did-finish-load', () => win.webContents.send('pop:items', clean));
    win.once('ready-to-show', () => {
      const cursor = screen.getCursorScreenPoint();
      const area = screen.getDisplayNearestPoint(cursor).workArea;
      const x = Math.max(area.x + 8, Math.min(area.x + area.width - width - 8, Math.round(cursor.x - width / 2)));
      const y = Math.max(area.y + 8, Math.min(area.y + area.height - height - 8, Math.round(cursor.y - height / 2)));
      win.setPosition(x, y);
      win.setAlwaysOnTop(true, 'floating');
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.showInactive();
    });
    win.loadFile(path.join(__dirname, 'renderer', 'pop.html')).catch(() => finish(-1));
    setTimeout(() => finish(-1), 15_000);
  });
});

ipcMain.handle('apps:frontmost', () => frontmostApp());

ipcMain.handle('apps:list', () => listApps());

ipcMain.handle('apps:icon', async (_evt, appPath) => {
  if (typeof appPath !== 'string' || !appPath.trim()) return null;
  const resolved = await resolveAppPath(appPath);
  return resolved ? appIconDataUrl(resolved) : null;
});

ipcMain.handle('fetch:site-icon', async (_evt, url) => {
  try {
    const icon = await fetchSiteIcon(url);
    return { ok: true, ...icon };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('dialog:pick-file', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openFile'] });
  return res.canceled ? null : res.filePaths[0];
});
