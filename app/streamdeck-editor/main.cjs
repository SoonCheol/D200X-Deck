'use strict';

const { app, BrowserWindow, Menu, ipcMain, clipboard } = require('electron');
const path = require('node:path');
const { D200XTransport } = require('./transport.cjs');

let window = null;
let rendererReady = false;
const transport = new D200XTransport();
function send(channel, payload) {
  if (rendererReady && window && !window.isDestroyed()) {
    window.webContents.send(channel, payload);
  }
}
transport.on('status', status => send('d200x:status', status));
transport.on('key', event => send('d200x:key', event));
transport.on('synced', details => send('d200x:synced', details));
transport.on('error-message', message => send('d200x:error', message));

// Accept only the 14 known display slots, not arbitrary file paths or code.
function validImages(value) {
  if (!Array.isArray(value) || value.length !== 14) return false;
  const found = new Set();
  for (const entry of value) {
    if (!entry || !Number.isInteger(entry.index) || entry.index < 0 || entry.index >= 14 ||
        found.has(entry.index) || typeof entry.png !== 'string' ||
        entry.png.length > 1024 * 1024 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(entry.png)) return false;
    found.add(entry.index);
  }
  return found.size === 14;
}
ipcMain.on('d200x:renderer-ready', event => {
  if (!window || event.sender !== window.webContents) return;
  rendererReady = true;
  send('d200x:status', transport.deck.status());
});
ipcMain.on('d200x:sync-page', (event, images) => {
  if (!window || event.sender !== window.webContents) return;
  if (!validImages(images)) {
    send('d200x:error', '페이지 이미지 형식이 올바르지 않습니다.');
    return;
  }
  transport.schedule(images.map(entry => ({
    index: entry.index,
    png: Buffer.from(entry.png, 'base64'),
  })));
});

// Local clipboard image only; never reads arbitrary files or executes clipboard content.
ipcMain.handle('d200x:clipboard-image', async event => {
  if (!window || event.sender !== window.webContents) return null;
  const image = clipboard.readImage();
  if (image.isEmpty()) return null;
  const png = image.resize({width:196,height:196,quality:'best'}).toPNG();
  if (png.length > 1024*1024) throw new Error('클립보드 이미지가 너무 큽니다.');
  return 'data:image/png;base64,' + png.toString('base64');
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 960,
    minHeight: 630,
    backgroundColor: '#292929',
    title: 'D200X StreamDeck — Device Sync Preview',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  await window.loadFile(path.join(__dirname, 'index.html'));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
  window.on('closed', () => { rendererReady = false; window = null; app.quit(); });
  transport.start().catch(err => send('d200x:error', String(err)));
});
app.on('before-quit', () => transport.stop());
app.on('window-all-closed', () => app.quit());
