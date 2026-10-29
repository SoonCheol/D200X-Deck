'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const { Deck } = require('./lib/deck');
const { Store } = require('./lib/store');
const { buildPage } = require('./lib/page');
const { PluginManager, pluginRootDirs } = require('./lib/plugins');
const actions = require('./lib/actions');

let win = null;
let store = null;
let deck = null;
let plugins = null;
let seizeProc = null;
let seizeWarned = false;
let reconnectTimer = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#0b0e14',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.webContents.on('console-message', (event) => {
    console.log(`[renderer:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
  });
  win.webContents.on('preload-error', (_e, p, err) => console.error('[preload]', p, err));
  win.webContents.on('did-fail-load', (_e, code, desc) => console.error('[load]', code, desc));
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });

  // Dev aid: ULANZI_SHOT=/tmp/ui.png renders the window to a PNG and exits.
  if (process.env.ULANZI_SHOT) {
    win.webContents.once('did-finish-load', () => {
      const delay = Number(process.env.ULANZI_SHOT_DELAY || 1800);
      setTimeout(async () => {
        try {
          if (process.env.ULANZI_KEY) {
            send('deck:key', { index: Number(process.env.ULANZI_KEY), pressed: true, state: 1 });
            await new Promise((r) => setTimeout(r, 900));
          }
          if (process.env.ULANZI_PLUGINS) {
            await win.webContents.executeJavaScript(
              "document.querySelector('#plugins-btn')?.click(); true"
            );
            await new Promise((r) => setTimeout(r, 700));
          }
          if (process.env.ULANZI_CLICK) {
            const idx = Number(process.env.ULANZI_CLICK) || 0;
            await win.webContents.executeJavaScript(
              `document.querySelectorAll('.key')[${idx}]?.click(); true`
            );
            await new Promise((r) => setTimeout(r, 500));
          }
          const image = await win.webContents.capturePage();
          fs.writeFileSync(process.env.ULANZI_SHOT, image.toPNG());
        } finally {
          app.quit();
        }
      }, delay);
    });
  }
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { label: 'Reconnect Deck', click: () => deck.connect() },
            { type: 'separator' },
            { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
            { type: 'separator' }, { role: 'quit' },
          ],
        }]
      : []),
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

function initDeck() {
  deck = new Deck();
  deck.on('status', (status) => {
    console.log(`[deck] ${status.connected ? 'connected' : 'offline'}: ${status.message}`);
    send('deck:status', status);
  });
  deck.on('key', (event) => {
    console.log(`[deck] key index=${event.index} ${event.pressed ? 'down' : 'up'}`);
    send('deck:key', event);
  });
  deck.on('brightness', (level) => send('deck:brightness', level));
  deck.on('error', (message) => send('deck:error', message));

  const tryConnect = () => {
    if (!deck.connected) {
      const ok = deck.connect();
      if (!ok) send('deck:status', deck.status());
    }
  };
  tryConnect();
  reconnectTimer = setInterval(tryConnect, 4000);
}

function initPlugins() {
  const dirs = [path.join(app.getPath('userData'), 'Plugins'), ...pluginRootDirs()];
  plugins = new PluginManager({ dirs, appPluginsDir: dirs[0], port: 3906, appVersion: app.getVersion() });
  plugins.scan();
  plugins.start();
  plugins.on('state', (payload) => send('plugin:state', payload));
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

app.whenReady().then(() => {
  store = new Store(process.env.ULANZI_CONFIG_DIR || app.getPath('userData'));
  store.load();
  initDeck();
  initPlugins();
  startHidSeize();
  createWindow();
  buildMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (reconnectTimer) clearInterval(reconnectTimer);
  if (deck) deck.disconnect('App closed');
  if (plugins) plugins.stopAll();
  if (seizeProc) {
    try { seizeProc.kill(); } catch { /* ignore */ }
  }
});

// ---------------------------------------------------------------- IPC

ipcMain.handle('app:state', () => ({
  config: store.config,
  status: deck.status(),
  platform: process.platform,
  version: app.getVersion(),
}));

ipcMain.handle('config:save', (_evt, config) => {
  store.save(config);
  return { ok: true };
});

ipcMain.handle('deck:push', async (_evt, images) => {
  if (!deck.connected) return { ok: false, error: 'not connected' };
  try {
    const zip = await buildPage(images);
    deck.pushPage(zip);
    console.log(`[deck] pushed page: ${images.length} keys, ${(zip.length / 1024).toFixed(1)} KB`);
    return { ok: true, bytes: zip.length };
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

ipcMain.handle('action:run', async (_evt, action) => actions.execute(action));

ipcMain.handle('plugins:list', () => plugins.list());

ipcMain.handle('plugins:sync', (_evt, wanted) => {
  plugins.sync(wanted);
  return { ok: true };
});

ipcMain.handle('plugins:run', (_evt, actionid) => ({ ok: plugins.run(actionid) }));

ipcMain.handle('plugins:install-folder', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Select a .ulanziPlugin folder',
    properties: ['openDirectory'],
  });
  if (res.canceled || res.filePaths.length === 0) return { canceled: true };
  try {
    const out = plugins.install(res.filePaths[0]);
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
    filters: [{ name: 'Plugin package', extensions: ['zip'] }],
  });
  if (res.canceled || res.filePaths.length === 0) return { canceled: true };
  try {
    const out = plugins.install(res.filePaths[0]);
    send('plugins:changed');
    return { ok: true, ...out };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('plugins:reload', () => {
  const list = plugins.reload();
  send('plugins:changed');
  return { ok: true, list };
});

ipcMain.handle('plugins:remove', (_evt, uuid) => {
  try {
    const list = plugins.remove(uuid);
    send('plugins:changed');
    return { ok: true, list };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('plugins:open-folder', () => {
  fs.mkdirSync(plugins.appPluginsDir, { recursive: true });
  shell.openPath(plugins.appPluginsDir);
  return { ok: true };
});

ipcMain.handle('plugins:reveal', (_evt, uuid) => {
  const meta = plugins.plugins.get(uuid);
  if (!meta) return { ok: false };
  shell.showItemInFolder(meta.dir);
  return { ok: true };
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

ipcMain.handle('dialog:pick-file', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openFile'] });
  return res.canceled ? null : res.filePaths[0];
});
