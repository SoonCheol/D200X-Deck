'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const { Deck } = require('./lib/deck');
const { Store } = require('./lib/store');
const { buildPage } = require('./lib/page');
const actions = require('./lib/actions');

let win = null;
let store = null;
let deck = null;
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
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    console.log(`[renderer:${level}] ${message} (${source}:${line})`);
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
      setTimeout(async () => {
        try {
          if (process.env.ULANZI_KEY) {
            send('deck:key', { index: Number(process.env.ULANZI_KEY), pressed: true, state: 1 });
            await new Promise((r) => setTimeout(r, 900));
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
      }, 1800);
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
  deck.on('status', (status) => send('deck:status', status));
  deck.on('key', (event) => send('deck:key', event));
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

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  store.load();
  initDeck();
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
