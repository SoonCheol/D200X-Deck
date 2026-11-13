'use strict';

const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');

// Standalone UI preview only. Never initialize the legacy Ulanzi renderer,
// HID device, plugins or action engine in this executable.
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const window = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 960,
    minHeight: 630,
    backgroundColor: '#292929',
    title: 'D200X StreamDeck Preview — UI only',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  window.loadFile(path.join(__dirname, 'index.html'));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.on('closed', () => app.quit());
});
app.on('window-all-closed', () => app.quit());
