'use strict';

const { app, BrowserWindow, dialog, Menu, shell, Tray, nativeImage, protocol, session, powerMonitor, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { isRendererFile: isRendererFileIn } = require('./lib/renderer-url');
const { applyLoginPath } = require('./lib/shell-path');
const { appendAppLog } = require('./lib/app-log');

const { Deck } = require('./lib/deck');
const { Store } = require('./lib/store');
const { fetchLatestRelease, isNewer, plainNotes } = require('./lib/updates');
const { StreamDeckCatalog } = require('./lib/sdcatalog');
const { Market } = require('./lib/market');
const { createPluginProtocol } = require('./lib/plugin-protocol');
const { buildPiBridge } = require('./lib/pi-theme');
const { SD_PI_THEME, PI_THEME } = require('./lib/pi-themes');
const { CH } = require('./lib/channels');
const { registerIpc } = require('./ipc');
const { initPluginHosts } = require('./plugin-hosts');
const { spawn } = require('node:child_process');
const actions = require('./lib/actions');

// A failing `Run command` exits after the key press; surface the reason as a toast.
actions.setShellErrorHandler((message, meta, detail) => {
  appendAppLog('commands', detail || message);
  send(CH.commandFailed, { message, meta: meta || null });
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason.stack || reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err?.stack || err);
});

let win = null;
let store = null;
let deck = null;
let plugins = null;
let sdPlugins = null;
const sdCatalog = new StreamDeckCatalog();
let market = null;
let seizeProc = null;
let seizeTimer = null;
let seizeRetryMs = 5000;
let seizeState = { running: false, message: 'Starting…' };
let reconnectTimer = null;
let tray = null;
let isQuitting = false;
let quitPromptOpen = false;

// A second launch would fight over the HID device and the plugin port. Dev and
// screenshot runs set ULANZI_CONFIG_DIR, so they are allowed to coexist.
const devRun = Boolean(process.env.ULANZI_SHOT || process.env.ULANZI_CONFIG_DIR);
const wantsQuit = process.argv.includes('--quit');
// Started by the login item: stay in the menu bar instead of opening the editor.
const launchHidden = app.isPackaged && !devRun && app.getLoginItemSettings().wasOpenedAsHidden;
if (!devRun && !app.requestSingleInstanceLock()) {
  isQuitting = true;
  app.exit(0);
} else if (wantsQuit) {
  isQuitting = true;
  app.exit(0);
}
app.on('second-instance', (_event, argv) => {
  if (argv.includes('--quit')) {
    quitSoon();
    return;
  }
  if (argv.includes('--reload-config')) {
    reloadConfigFromDisk();
    showWindow();
    return;
  }
  showWindow();
});

const RENDERER_DIR = path.join(__dirname, 'renderer');

/** True when `url` is a file inside our own renderer directory. */
function isRendererFile(url) {
  return isRendererFileIn(url, RENDERER_DIR);
}

function setDockVisible(visible) {
  // Menu-bar-only while the editor is closed; a normal Dock icon while it is open.
  if (process.platform !== 'darwin' || !app.dock) return;
  try {
    if (visible) app.dock.show();
    else app.dock.hide();
    if (process.env.ULANZI_LOG_KEYS) console.log(`[dock] ${visible ? 'shown' : 'hidden'}`);
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
      sandbox: true,
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
  win.webContents.on('will-navigate', (event, url) => {
    if (!isRendererFile(url)) event.preventDefault();
  });
  win.webContents.on('will-redirect', (event, url) => {
    if (!isRendererFile(url)) event.preventDefault();
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

  // The screenshot harness is a development tool and is not packaged.
  if (process.env.ULANZI_SHOT && !app.isPackaged) {
    try {
      require('./scripts/harness').attachScreenshotHarness({
        win,
        send,
        quitNow: () => {
          isQuitting = true;
          app.quit();
          // The screenshot harness must never require a manual Ctrl+C. If the
          // normal quit path is blocked by a plugin/child handle, exit anyway.
          setTimeout(() => app.exit(0), 1500);
        },
      });
    } catch (err) {
      console.error('[shot] harness unavailable:', err.message);
    }
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
    send(CH.appUpdateAvailable, {
      current: result.current,
      latest: result.latest,
      url: result.url,
      notes: result.notes,
    });
  }
  scheduleUpdateCheck(Math.max(1, Number(settings.updateHours) || 6) * 3_600_000);
}

let quitSoonTimer = null;

/** Quit from a script without the dialog, but give the renderer a moment to save. */
function quitSoon() {
  isQuitting = true;
  if (quitSoonTimer) return;
  try {
    send(CH.appFlush);
  } catch {
    /* renderer not ready */
  }
  quitSoonTimer = setTimeout(() => {
    quitSoonTimer = null;
    app.quit();
  }, 600);
}

function applyLoginItemSettings() {
  if (!app.isPackaged || devRun || !store) return;
  try {
    app.setLoginItemSettings({
      openAtLogin: store.config.settings.launchAtLogin === true,
      openAsHidden: true,
    });
  } catch {
    /* launch items can be unavailable in some environments */
  }
}

function reloadConfigFromDisk() {
  if (!store) return false;
  try {
    send(CH.configReloaded, store.reload());
    applyLoginItemSettings();
    appendAppLog('reload', `OK ${store.file}`);
    return true;
  } catch (err) {
    const message = err.message || String(err);
    appendAppLog('reload', `FAIL ${store.file} — ${message}`);
    send(CH.pluginError, `Could not reload config: ${message}`);
    return false;
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { label: 'About Ulanzi Deck Open', click: () => send(CH.appShowAbout) },
            {
              label: 'Check for Updates…',
              click: async () => {
                showWindow();
                send(CH.appUpdateResult, await checkForUpdates());
              },
            },
            { type: 'separator' },
            {
              label: 'Settings…',
              accelerator: 'CmdOrCtrl+,',
              click: () => {
                showWindow();
                send(CH.appOpenSettings);
              },
            },
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
        { type: 'separator' },
        {
          label: 'Reload Config from Disk',
          click: () => {
            reloadConfigFromDisk();
            showWindow();
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
  powerMonitor.on('lock-screen', () => send(CH.appLockScreen));
  powerMonitor.on('unlock-screen', () => send(CH.appDisplayRestore));
  powerMonitor.on('resume', () => send(CH.appDisplayRestore));
  deck = new Deck();
  deck.on('status', (status) => {
    console.log(`[deck] ${status.connected ? 'connected' : 'offline'}: ${status.message}`);
    send(CH.deckStatus, status);
  });
  deck.on('key', (event) => {
    if (process.env.ULANZI_LOG_KEYS) {
      console.log(
        `[deck] key index=${event.index} ${event.pressed ? 'down' : 'up'} t=${Date.now()} flags=${event.flags}`
      );
    }
    send(CH.deckKey, event);
  });
  deck.on('brightness', (level) => send(CH.deckBrightness, level));
  deck.on('error', (message) => send(CH.deckError, message));

  const tryConnect = () => {
    if (noDeck) {
      send(CH.deckStatus, { connected: false, message: 'Disconnected', info: null });
      return;
    }
    if (!deck.connected) {
      const ok = deck.connect();
      if (!ok) send(CH.deckStatus, deck.status());
    }
  };
  tryConnect();
  reconnectTimer = setInterval(tryConnect, 4000);
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

function setSeizeState(running, message) {
  seizeState = { running, message };
  send(CH.seizeState, seizeState);
}

function startHidSeize() {
  if (noDeck) {
    setSeizeState(false, 'Key capture is off (no-deck mode)');
    return;
  }
  const bin = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'hidseize')
    : path.join(__dirname, 'bin', 'hidseize');
  if (!fs.existsSync(bin)) {
    setSeizeState(false, 'Key capture helper is missing');
    return;
  }
  if (seizeProc && seizeProc.exitCode === null) return;
  setSeizeState(false, 'Starting key capture…');
  seizeProc = spawnHelper(bin);
}

/**
 * The helper is the only thing stopping the deck's firmware fallback from
 * typing a URL into the frontmost app, so a dead helper must be respawned.
 */
function scheduleSeizeRestart() {
  if (noDeck || isQuitting || seizeTimer) return;
  const delay = seizeRetryMs;
  seizeRetryMs = Math.min(60_000, seizeRetryMs * 2);
  console.log(`[seize] helper down; retrying in ${Math.round(delay / 1000)}s`);
  seizeTimer = setTimeout(() => {
    seizeTimer = null;
    startHidSeize();
  }, delay);
}

function spawnHelper(bin) {
  const proc = spawn(bin, [], { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.on('error', (err) => {
    console.error('[seize] helper failed:', err.message);
    if (seizeProc === proc) seizeProc = null;
    setSeizeState(false, 'Key capture helper failed to start');
    scheduleSeizeRestart();
  });
  proc.stdout.on('data', (d) => console.log('[seize]', d.toString().trim()));
  let stderrBuffer = '';
  proc.stderr.on('data', (d) => {
    stderrBuffer += d.toString();
    let idx;
    while ((idx = stderrBuffer.indexOf('\n')) >= 0) {
      const line = stderrBuffer.slice(0, idx).trim();
      stderrBuffer = stderrBuffer.slice(idx + 1);
      if (!line) continue;
      console.log('[seize]', line);
      if (/^access\s+0\b/.test(line)) {
        // Permission granted; the helper is waiting for the Deck to appear.
        setSeizeState(true, 'Waiting for the Deck…');
      } else if (/^access\s+[12]\b/.test(line) || line.includes('notpermitted')) {
        setSeizeState(false, 'Input Monitoring permission needed');
      } else if (/^seized\b/.test(line)) {
        seizeRetryMs = 5000;
        setSeizeState(true, 'Capturing keys');
      } else if (/^manager\s+0x/i.test(line)) {
        setSeizeState(false, 'Input Monitoring permission needed');
      } else if (/^seize\s+0x/i.test(line)) {
        setSeizeState(false, 'The Deck is in use by another app');
      }
    }
  });
  proc.on('exit', () => {
    if (seizeProc === proc) seizeProc = null;
    if (isQuitting) return;
    setSeizeState(false, 'Restarting key capture…');
    scheduleSeizeRestart();
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



function injectPiTheme(html) {
  const theme = PI_THEME + buildPiBridge({});
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${theme}</body>`);
  return html + theme;
}
/** Inject the Stream Deck/OpenAction inspector bridge and theme into a page. */
function injectSdBridge(html, url) {
  const actionid = url.searchParams.get('actionid') || '';
  const connect = sdPlugins?.inspectorConnect(actionid) || null;
  const theme = SD_PI_THEME + buildPiBridge({ connect, openLinks: true, connectMode: true });
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${theme}</body>`) : html + theme;
}

app.whenReady().then(() => {
  // Scripts and OS logout use SIGTERM. Skip the interactive confirmation but
  // keep the normal will-quit plugin/deck cleanup. Registered once the app is
  // ready: Electron installs its own SIGTERM handler at startup, which goes
  // through before-quit (and so the confirmation) and replaces an earlier one.
  process.on('SIGTERM', () => {
    quitSoon();
  });
  // Finder/Spotlight launches have launchd's minimal PATH. Resolve the login
  // shell once so Homebrew tools and user scripts work from key actions.
  applyLoginPath();
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
  applyLoginItemSettings();
  market = new Market({
    dir: process.env.ULANZI_CONFIG_DIR || app.getPath('userData'),
    language: 'en',
    appVersion: app.getVersion(),
  });
  initDeck();
  ({ plugins, sdPlugins } = initPluginHosts({
    baseDir: process.env.ULANZI_CONFIG_DIR || app.getPath('userData'),
    appVersion: app.getVersion(),
    send,
    getWin: () => win,
    getStore: () => store,
    getDeck: () => deck,
  }));
  startHidSeize();
  registerIpc({
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
    getWin: () => win,
    getUpdateState: () => updateState,
    getSeizeState: () => seizeState,
  });
  protocol.handle(
    'ulanzi-pi',
    createPluginProtocol({
      getPluginDir: (folder) => {
        const meta = [...(plugins?.plugins?.values() || [])].find((m) => path.basename(m.dir) === folder);
        return meta ? meta.dir : null;
      },
      transformHtml: (html) => injectPiTheme(html),
    })
  );

  protocol.handle(
    'sd-pi',
    createPluginProtocol({
      getPluginDir: (folder) => {
        const meta = [...(sdPlugins?.plugins?.values() || [])].find((m) => path.basename(m.dir) === folder);
        return meta ? meta.dir : null;
      },
      transformHtml: (html, url) => injectSdBridge(html, url),
    })
  );

  createWindow();
  buildMenu();
  createTray();
  app.setAboutPanelOptions({
    applicationName: 'Ulanzi Deck Open',
    applicationVersion: app.getVersion(),
    version: '',
    copyright: '© 2026 Eduardo Falcão Lima',
    credits: 'Author: Eduardo Falcão Lima · edufalcao.com',
  });
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

let quitCleanupStarted = false;
let quitCleanupDone = false;

app.on('will-quit', (event) => {
  if (quitCleanupDone) return;
  // Give plugins a moment to exit on SIGTERM before quitting, so a plugin that
  // ignores the signal cannot survive as an orphan holding the HID handle.
  event.preventDefault();
  if (quitCleanupStarted) return;
  quitCleanupStarted = true;

  if (reconnectTimer) clearInterval(reconnectTimer);
  if (seizeTimer) clearTimeout(seizeTimer);
  if (deck) deck.disconnect('App closed');
  if (seizeProc) {
    try { seizeProc.kill(); } catch { /* ignore */ }
  }

  const finish = () => {
    if (quitCleanupDone) return;
    quitCleanupDone = true;
    if (tray) tray.destroy();
    // Cleanup is done. A second app.quit() is ignored once will-quit has been
    // prevented, which left the app running with no window or tray.
    app.exit(0);
  };
  const fallback = setTimeout(finish, 3000);
  Promise.allSettled([plugins?.shutdown?.(), sdPlugins?.shutdown?.()]).then(() => {
    clearTimeout(fallback);
    finish();
  });
});
