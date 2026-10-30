'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, shell, Tray, nativeImage, protocol, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { Deck } = require('./lib/deck');
const { Store } = require('./lib/store');
const { buildPage } = require('./lib/page');
const { PluginManager, pluginRootDirs } = require('./lib/plugins');
const { fetchSiteIcon } = require('./lib/siteicon');
const { appIconDataUrl } = require('./lib/appicon');
const { Market } = require('./lib/market');
const { execFileSync } = require('node:child_process');
const actions = require('./lib/actions');

let win = null;
let store = null;
let deck = null;
let plugins = null;
let market = null;
let seizeProc = null;
let seizeWarned = false;
let reconnectTimer = null;
let tray = null;
let isQuitting = false;
let quitPromptOpen = false;

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
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

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
          if (process.env.ULANZI_INSTALLED) {
            await win.webContents.executeJavaScript(
              "document.querySelector('#plugins-btn')?.click(); true"
            );
            await new Promise((r) => setTimeout(r, 400));
            if (process.env.ULANZI_SCROLL) {
              await win.webContents.executeJavaScript(
                "(() => { const l = document.querySelector('#plugin-list'); if (l) l.scrollTop = l.scrollHeight; return true; })()"
              );
            }
            if (process.env.ULANZI_INSTALLED === 'icons') {
              await win.webContents.executeJavaScript(
                "document.querySelector('#tab-icons-btn')?.click(); true"
              );
            }
            await new Promise((r) => setTimeout(r, 900));
          }
          if (process.env.ULANZI_PLUGINS) {
            await win.webContents.executeJavaScript(
              "document.querySelector('#plugins-btn')?.click(); true"
            );
            await new Promise((r) => setTimeout(r, 700));
          }
          if (process.env.ULANZI_PI_DEBUG) {
            await new Promise((r) => setTimeout(r, 2500));
            const frames = win.webContents.mainFrame.framesInSubtree.filter((f) => f.url.startsWith('ulanzi-pi://'));
            for (const frame of frames) {
              try {
                const out = await frame.executeJavaScript(`(() => {
                  const b = getComputedStyle(document.body);
                  const inp = document.querySelector('input[type=number], input[type=text]');
                  const row = inp ? inp.closest('.row') : null;
                  return JSON.stringify({
                    bodyW: document.body.clientWidth, bodyPadR: b.paddingRight,
                    scrollW: window.innerWidth - document.documentElement.clientWidth,
                    inpW: inp ? inp.offsetWidth : null,
                    rowW: row ? row.offsetWidth : null,
                    rowPad: row ? getComputedStyle(row).paddingRight : null,
                    theme: !!document.getElementById('ulanzi-deck-open-theme'),
                  });
                })()`);
                console.log('[pidebug]', out);
              } catch (e) { console.log('[pidebug] err', e.message); }
            }
          }
          if (process.env.ULANZI_CLICK) {
            const idx = Number(process.env.ULANZI_CLICK) || 0;
            await win.webContents.executeJavaScript(
              `document.querySelectorAll('.key')[${idx}]?.click(); true`
            );
            await new Promise((r) => setTimeout(r, 500));
          }
          if (process.env.ULANZI_DRAG) {
            const [from, to] = process.env.ULANZI_DRAG.split(',').map(Number);
            await win.webContents.executeJavaScript(`
              (() => {
                const tiles = document.querySelectorAll('.key');
                const dt = new DataTransfer();
                tiles[${from}].dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
                tiles[${to}].dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
                tiles[${to}].dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
                return true;
              })()
            `);
            await new Promise((r) => setTimeout(r, 800));
          }
          if (process.env.ULANZI_CHANGE_MEDIA) {
            await win.webContents.executeJavaScript(`
              (async () => {
                document.querySelectorAll('.key')[0]?.click();
                await new Promise(r => setTimeout(r, 300));
                const v = document.querySelector('#insp-value');
                v.value = ${JSON.stringify(process.env.ULANZI_CHANGE_MEDIA)};
                v.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              })()
            `);
            await new Promise((r) => setTimeout(r, 1200));
          }
          if (process.env.ULANZI_SET_MEDIA) {
            await win.webContents.executeJavaScript(`
              (() => {
                document.querySelectorAll('.key')[0]?.click();
                const type = document.querySelector('#insp-action-type');
                type.value = 'media';
                type.dispatchEvent(new Event('change', { bubbles: true }));
                setTimeout(() => {
                  const v = document.querySelector('#insp-value');
                  v.value = ${JSON.stringify(process.env.ULANZI_SET_MEDIA)};
                  v.dispatchEvent(new Event('change', { bubbles: true }));
                }, 300);
                return true;
              })()
            `);
            await new Promise((r) => setTimeout(r, 1500));
          }
          if (process.env.ULANZI_PRESS) {
            const index = Number(process.env.ULANZI_PRESS_INDEX || 0);
            const mode = process.env.ULANZI_PRESS;
            send('deck:key', { index, pressed: true, state: 1 });
            if (mode === 'double') {
              await new Promise((r) => setTimeout(r, 90));
              send('deck:key', { index, pressed: false, state: 0 });
              await new Promise((r) => setTimeout(r, 90));
              send('deck:key', { index, pressed: true, state: 1 });
              await new Promise((r) => setTimeout(r, 90));
              send('deck:key', { index, pressed: false, state: 0 });
            } else {
              await new Promise((r) => setTimeout(r, Number(process.env.ULANZI_PRESS_HOLD || 120)));
              send('deck:key', { index, pressed: false, state: 0 });
            }
            await new Promise((r) => setTimeout(r, 1200));
          }
          if (process.env.ULANZI_ACTION) {
            const payload = JSON.parse(process.env.ULANZI_ACTION);
            const res = await win.webContents.executeJavaScript(
              `window.deckApp.runAction(${JSON.stringify(payload)}).then(r => JSON.stringify(r))`
            );
            console.log('[shot] action', res);
          }
          if (process.env.ULANZI_TEST_ICONS) {
            const out = await win.webContents.executeJavaScript(
              "window.deckApp.installIconPack(" + JSON.stringify(process.env.ULANZI_TEST_ICONS) + ").then(r => JSON.stringify(r)).catch(e => 'ERR ' + e.message)"
            );
            console.log('[shot] icons', out);
          }
          if (process.env.ULANZI_LIBRARY) {
            await win.webContents.executeJavaScript(`
              (async () => {
                document.querySelectorAll('.key')[0]?.click();
                await new Promise(r => setTimeout(r, 400));
                document.querySelector('#insp-icon-library')?.click();
                await new Promise(r => setTimeout(r, 2500));
                document.querySelectorAll('.icon-tile')[0]?.click();
                return true;
              })()
            `);
            await new Promise((r) => setTimeout(r, 1500));
          }
          if (process.env.ULANZI_STORE) {
            await win.webContents.executeJavaScript(
              "document.querySelector('#store-btn')?.click(); true"
            );
            await new Promise((r) => setTimeout(r, 4000));
            if (process.env.ULANZI_STORE_CAT) {
              await win.webContents.executeJavaScript(
                `document.querySelectorAll('.store-cat')[${Number(process.env.ULANZI_STORE_CAT) || 0}]?.click(); true`
              );
              await new Promise((r) => setTimeout(r, 3500));
            }
            if (process.env.ULANZI_STORE_SEARCH) {
              await win.webContents.executeJavaScript(`
                (() => {
                  const s = document.querySelector('#store-search');
                  s.value = ${JSON.stringify(process.env.ULANZI_STORE_SEARCH)};
                  s.dispatchEvent(new Event('input', { bubbles: true }));
                  return true;
                })()
              `);
              await new Promise((r) => setTimeout(r, 2500));
            }
            if (process.env.ULANZI_STORE_ITEM) {
              await win.webContents.executeJavaScript(
                `document.querySelectorAll('.store-item')[${Number(process.env.ULANZI_STORE_ITEM) || 0}]?.click(); true`
              );
              await new Promise((r) => setTimeout(r, 2500));
            }
            if (process.env.ULANZI_STORE_DOWNLOAD) {
              await win.webContents.executeJavaScript(
                "document.querySelector('#store-download-icons')?.click(); true"
              );
              await new Promise((r) => setTimeout(r, 9000));
            }
            if (process.env.ULANZI_STORE_INSTALL) {
              await win.webContents.executeJavaScript(
                "document.querySelector('#store-install')?.click(); true"
              );
              await new Promise((r) => setTimeout(r, 6000));
            }
          }
          if (process.env.ULANZI_HOTKEY) {
            await win.webContents.executeJavaScript(
              "document.querySelector('#insp-hotkey-open')?.click(); true"
            );
            await new Promise((r) => setTimeout(r, 600));
          }
          if (process.env.ULANZI_APPICON) {
            await win.webContents.executeJavaScript(
              "document.querySelector('#insp-use-app-icon')?.click(); true"
            );
            await new Promise((r) => setTimeout(r, 1200));
          }
          if (process.env.ULANZI_APPS) {
            await win.webContents.executeJavaScript(
              "document.querySelector('#insp-pick-app')?.click(); true"
            );
            await new Promise((r) => setTimeout(r, 1500));
          }
          const image = await win.webContents.capturePage();
          fs.writeFileSync(process.env.ULANZI_SHOT, image.toPNG());
        } finally {
          isQuitting = true;
          app.quit();
        }
      }, delay);
    });
  }
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function showWindow() {
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

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
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

function listApps() {
  const os = require('node:os');
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

function initPlugins() {
  const baseDir = process.env.ULANZI_CONFIG_DIR || app.getPath('userData');
  const dirs = [path.join(baseDir, 'Plugins'), ...pluginRootDirs()];
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

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'ulanzi-pi',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

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
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #2a3342; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #3a475d; }
</style>
<script>
  (function () {
    function report() {
      try {
        // Measure the lowest visible element instead of scrollHeight: many
        // inspector stylesheets give the body a min-height, which would make
        // the frame grow to its own height.
        var h = 0;
        var nodes = document.body.querySelectorAll('*');
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          var r = el.getBoundingClientRect();
          if (r.height > 0 && r.width > 0 && getComputedStyle(el).visibility !== 'hidden') {
            h = Math.max(h, r.bottom);
          }
        }
        parent.postMessage({ type: 'ulanzi-pi-height', height: Math.ceil(h) }, '*');
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
    const initiator = String(details.initiator || '');
    // Requests from our custom scheme arrive with an empty initiator, so also
    // relax CORS for loopback services (only plugin inspectors call those).
    const loopback = /^https?:\/\/(127\.0\.0\.1|localhost)([:/]|$)/.test(details.url || '');
    if (!initiator.startsWith('ulanzi-pi://') && !loopback) return callback({});
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
  market = new Market({
    dir: process.env.ULANZI_CONFIG_DIR || app.getPath('userData'),
    language: 'en',
    appVersion: app.getVersion(),
  });
  initDeck();
  initPlugins();
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
      if (!file.startsWith(meta.dir)) return new Response('forbidden', { status: 403 });
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

  createWindow();
  buildMenu();
  createTray();

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
        files = fs.readdirSync(dir).filter((f) => ICON_EXT.has(path.extname(f).toLowerCase()));
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

ipcMain.handle('icons:remove', (_evt, pack) => {
  const id = String(pack);
  if (id.startsWith('ulanzi:') || !id.startsWith('app:')) {
    return { ok: false, error: 'Icon packs installed by Ulanzi Studio are read-only' };
  }
  fs.rmSync(packDir(id), { recursive: true, force: true });
  return { ok: true };
});

ipcMain.handle('store:install', async (_evt, id) => {
  const temp = path.join(os.tmpdir(), `ulanzi-store-${Date.now()}.zip`);
  try {
    const resource = await market.resource(String(id));
    if (!resource.files) throw new Error('This store item has no downloadable file');
    await market.download(resource.files, temp);
    const out = plugins.install(temp);
    send('plugins:changed');
    return { ok: true, ...out };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    try { fs.rmSync(temp, { force: true }); } catch { /* ignore */ }
  }
});

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

ipcMain.handle('plugins:inspector-url', (_evt, payload) => plugins.inspectorUrl(payload || {}));

ipcMain.handle('plugins:set-settings', (_evt, actionid, settings) => ({
  ok: plugins.setActionSettings(String(actionid), settings || {}),
}));

ipcMain.handle('plugins:reload', () => {
  const list = plugins.reload();
  send('plugins:changed');
  return { ok: true, list };
});

ipcMain.handle('plugins:import', (_evt, uuid) => {
  try {
    const out = plugins.import(String(uuid));
    send('plugins:changed');
    return { ok: true, ...out };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
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

ipcMain.handle('apps:list', () => listApps());

ipcMain.handle('apps:icon', async (_evt, appPath) => {
  if (typeof appPath !== 'string' || !/\.app$/i.test(appPath)) return null;
  return appIconDataUrl(appPath);
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
