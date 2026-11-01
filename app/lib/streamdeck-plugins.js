'use strict';

// Stream Deck SDK / OpenAction plugin host.
//
// Plugins are third-party programs that connect to a local WebSocket and use
// the same protocol as the Elgato Stream Deck software. They can be Node
// scripts, HTML pages, or native macOS binaries.

const { EventEmitter } = require('node:events');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebSocketServer } = require('ws');

const { nodeRuntime } = require('./plugins');

const TARGET =
  process.arch === 'arm64' ? 'aarch64-apple-darwin' : process.arch === 'x64' ? 'x86_64-apple-darwin' : null;
const FALLBACK_TARGET = process.arch === 'arm64' ? 'x86_64-apple-darwin' : 'aarch64-apple-darwin';

const MIME = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

function readJson(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(text);
}

function mergePatch(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = base && typeof base === 'object' && !Array.isArray(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else out[key] = mergePatch(out[key], value);
  }
  return out;
}

function fileToDataUrl(file) {
  try {
    const ext = path.extname(file).toLowerCase();
    return `data:${MIME[ext] || 'application/octet-stream'};base64,${fs.readFileSync(file).toString('base64')}`;
  } catch {
    return null;
  }
}

function resolveIcon(base, value) {
  if (!value) return null;
  for (const candidate of [value, `${value}.svg`, `${value}@2x.png`, `${value}.png`]) {
    const file = path.join(base, candidate);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return fileToDataUrl(file);
  }
  return null;
}

function streamDeckPluginDirs(appDir) {
  const home = os.homedir();
  const dirs = [appDir];
  if (process.platform === 'darwin') {
    dirs.push(
      path.join(home, 'Library/Application Support/opendeck/plugins'),
      path.join(home, 'Library/Application Support/com.elgato.StreamDeck/Plugins')
    );
  }
  return dirs;
}

function availableOnPath(bin) {
  try {
    const result = spawnSync(bin, ['--version'], { timeout: 2500, stdio: 'ignore' });
    return !result.error;
  } catch {
    return false;
  }
}

class StreamDeckPlugins extends EventEmitter {
  constructor({ appPluginsDir, language = 'en', appVersion = '0.1.0', port = 57116 } = {}) {
    super();
    this.dirs = streamDeckPluginDirs(appPluginsDir);
    this.appPluginsDir = appPluginsDir;
    this.language = language;
    this.appVersion = appVersion;
    this.port = port;
    this.plugins = new Map(); // uuid -> meta
    this.sockets = new Map(); // plugin uuid -> ws
    this.inspectors = new Map(); // context/actionid -> ws
    this.queues = new Map();
    this.children = new Map();
    this.actions = new Map(); // actionid -> action instance
    this.globalSettings = new Map();
    this.crashes = new Map();
    this.wss = null;
    this.stopping = false;
    this.launchHtml = null;
    this.stopHtml = null;
    this._portPromise = null;
    this._wine = null;
    this._settingsFile = path.join(appPluginsDir, '.global-settings.json');
    this._loadGlobalSettings();
  }

  _loadGlobalSettings() {
    try {
      const data = JSON.parse(fs.readFileSync(this._settingsFile, 'utf8'));
      for (const [uuid, value] of Object.entries(data || {})) this.globalSettings.set(uuid, value);
    } catch {
      /* first run */
    }
  }

  _saveGlobalSettings() {
    try {
      fs.mkdirSync(this.appPluginsDir, { recursive: true });
      fs.writeFileSync(this._settingsFile, JSON.stringify(Object.fromEntries(this.globalSettings), null, 2), {
        mode: 0o600,
      });
    } catch (err) {
      this.emit('error', `Could not save Stream Deck plugin settings: ${err.message}`);
    }
  }

  // ------------------------------------------------------------- discovery

  scan() {
    this.plugins.clear();
    for (const root of this.dirs) {
      let entries = [];
      try {
        entries = fs.readdirSync(root, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.name.endsWith('.sdPlugin')) continue;
        const dir = path.join(root, entry.name);
        try {
          if (!fs.statSync(dir).isDirectory()) continue;
        } catch {
          continue;
        }
        const manifestPath = path.join(dir, 'manifest.json');
        if (!fs.existsSync(manifestPath)) continue;
        try {
          let manifest = readJson(manifestPath);
          const overrides =
            process.platform === 'darwin'
              ? ['manifest.mac.json', 'manifest.macos.json']
              : [`manifest.${process.platform}.json`];
          for (const name of overrides) {
            const override = path.join(dir, name);
            if (!fs.existsSync(override)) continue;
            try {
              manifest = mergePatch(manifest, readJson(override));
            } catch {
              /* ignore a broken platform override */
            }
          }
          const uuid = entry.name;
          let code = this._codeFor(manifest);
          if (code && !fs.existsSync(path.join(dir, code.path))) code = null;
          const actionMeta = (manifest.Actions || [])
            .filter((a) => a && a.UUID && (!Array.isArray(a.Controllers) || a.Controllers.includes('Keypad')))
            .map((a) => {
              const icon = resolveIcon(dir, a.Icon) || resolveIcon(dir, manifest.Icon);
              const states = (a.States || []).map((state) => {
                const image =
                  state.Image === 'actionDefaultImage' || !state.Image
                    ? icon
                    : resolveIcon(dir, state.Image);
                return {
                  name: state.Name || '',
                  image,
                  text: state.Title || '',
                  show: state.ShowTitle !== false,
                  colour: state.TitleColor || '#ffffff',
                  alignment: state.TitleAlignment || 'middle',
                  family: state.FontFamily || '',
                  style: state.FontStyle || '',
                  size: Number(state.FontSize) || 16,
                };
              });
              const pi = a.PropertyInspectorPath || manifest.PropertyInspectorPath || '';
              return {
                uuid: a.UUID,
                name: a.Name || a.UUID,
                tooltip: a.Tooltip || '',
                icon,
                states,
                controllers: a.Controllers || ['Keypad'],
                propertyInspector: pi ? path.join(dir, pi) : null,
                supportedInMultiActions: a.SupportedInMultiActions !== false,
                visibleInActionList: a.VisibleInActionList !== false,
                disableAutomaticStates: a.DisableAutomaticStates === true,
              };
            });
          if (!actionMeta.length) continue;
          const meta = {
            uuid,
            sdk: 'streamdeck',
            dir,
            source: root,
            writable: path.resolve(root) === path.resolve(this.appPluginsDir),
            name: manifest.Name || uuid,
            description: manifest.Description || '',
            author: manifest.Author || '',
            version: manifest.Version || '',
            category: manifest.Category || 'Stream Deck',
            icon: resolveIcon(dir, manifest.Icon),
            manifest,
            code,
            compatible: Boolean(code),
            actions: actionMeta,
          };
          if (!this.plugins.has(uuid)) this.plugins.set(uuid, meta);
        } catch (err) {
          this.emit('error', `Failed to read ${manifestPath}: ${err.message}`);
        }
      }
    }
    return this.list();
  }

  _codeFor(manifest) {
    const osList = Array.isArray(manifest.OS) ? manifest.OS : [];
    const macSupported =
      !osList.length ||
      osList.some((os) => ['mac', 'macos', 'darwin'].includes(String(os?.Platform || '').toLowerCase()));
    const paths = manifest.CodePaths || {};
    let code = macSupported
      ? paths[TARGET] || paths[FALLBACK_TARGET] || manifest.CodePathMac || manifest.CodePath
      : null;
    if (code) {
      const kind = /\.(html?|xhtml)$/i.test(code)
        ? 'html'
        : /\.(c|m)?js$/i.test(code)
          ? 'node'
          : 'native';
      return { path: code, kind, wine: false };
    }
    const windows = manifest.CodePathWin || manifest.CodePath || paths['x86_64-pc-windows-msvc'];
    if (windows && this.wineAvailable()) {
      return { path: windows, kind: 'wine', wine: true };
    }
    return null;
  }

  wineAvailable() {
    if (this._wine !== null) return this._wine;
    this._wine = process.platform !== 'windows' && availableOnPath('wine');
    return this._wine;
  }

  list() {
    return [...this.plugins.values()]
      .map((p) => ({
        uuid: p.uuid,
        sdk: 'streamdeck',
        name: p.name,
        description: p.description,
        version: p.version,
        author: p.author,
        category: p.category,
        icon: p.icon,
        compatible: p.compatible,
        type: p.code?.kind || 'unsupported',
        source: p.source,
        writable: p.writable,
        actions: p.actions,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  info(meta) {
    return {
      application: {
        font: 'ui-sans-serif',
        language: this.language,
        platform: meta?.code?.wine ? 'windows' : 'mac',
        platformVersion: os.release(),
        version: '7.1.0',
      },
      plugin: { uuid: meta?.uuid || '', version: meta?.version || '' },
      devicePixelRatio: 2,
      colors: {
        buttonPressedBackgroundColor: '#303030FF',
        buttonPressedBorderColor: '#646464FF',
        buttonPressedTextColor: '#969696FF',
        disabledColor: '#F7821B59',
        highlightColor: '#F7821BFF',
        mouseDownColor: '#CF6304FF',
      },
      devices: [
        {
          id: 'ulanzi-d200',
          name: 'Ulanzi D200',
          size: { rows: 3, columns: 5 },
          type: 0,
        },
      ],
    };
  }

  infoString(meta) {
    return JSON.stringify(this.info(meta));
  }

  // ---------------------------------------------------------------- server

  start() {
    if (this.wss) return;
    this._portPromise = new Promise((resolve) => {
      const tryPort = (port, left) => {
        const wss = new WebSocketServer({
          host: '127.0.0.1',
          port,
          verifyClient: (info, done) => {
            const origin = String(info.origin || info.req?.headers?.origin || '');
            if (/^https?:/i.test(origin)) return done(false, 403, 'forbidden');
            done(true);
          },
        });
        wss.once('listening', () => {
          this.wss = wss;
          this.port = port;
          console.log(`[sd-plugins] listening on ${port}`);
          wss.on('connection', (ws) => this._onConnection(ws));
          resolve(port);
        });
        wss.once('error', (err) => {
          if (err.code === 'EADDRINUSE' && left > 0) {
            try { wss.close(); } catch { /* ignore */ }
            tryPort(port + 1, left - 1);
            return;
          }
          this.emit('error', `Stream Deck plugin server: ${err.message}`);
          resolve(null);
        });
      };
      tryPort(this.port, 20);
    });
  }

  _onConnection(ws) {
    let pluginUuid = null;
    let inspectorAction = null;
    let registered = false;

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!registered) {
        if (msg.event === 'registerPlugin') {
          const registeredUuid = String(msg.uuid || '');
          const meta =
            this.plugins.get(registeredUuid) ||
            this.plugins.get(`${registeredUuid}.sdPlugin`) ||
            [...this.plugins.values()].find((p) => p.uuid.replace(/\.sdPlugin$/, '') === registeredUuid);
          if (!meta || !meta.compatible) {
            try { ws.close(4402, 'unknown plugin'); } catch { /* ignore */ }
            return;
          }
          registered = true;
          pluginUuid = meta.uuid;
          this.sockets.set(pluginUuid, ws);
          this.crashes.delete(pluginUuid);
          this.emit('connected', pluginUuid);
          this._send(pluginUuid, {
            event: 'deviceDidConnect',
            device: 'ulanzi-d200',
            deviceInfo: { id: 'ulanzi-d200', name: 'Ulanzi D200', size: { rows: 3, columns: 5 }, type: 0 },
          });
          if (this.globalSettings.has(pluginUuid)) {
            this._send(pluginUuid, {
              event: 'didReceiveGlobalSettings',
              payload: { settings: this.globalSettings.get(pluginUuid) },
            });
          }
          this._flushQueue(pluginUuid);
          this._replay(pluginUuid);
          return;
        }
        if (msg.event === 'registerPropertyInspector') {
          const context = String(msg.uuid || '');
          const action = this.actions.get(context);
          if (!action) {
            try { ws.close(4403, 'unknown context'); } catch { /* ignore */ }
            return;
          }
          registered = true;
          inspectorAction = context;
          this.inspectors.set(context, ws);
          this._send(action.pluginUuid, {
            event: 'propertyInspectorDidAppear',
            action: action.actionUuid,
            context,
            device: 'ulanzi-d200',
          });
          const settingsMessage = {
            event: 'didReceiveSettings',
            action: action.actionUuid,
            context,
            device: 'ulanzi-d200',
            payload: { ...this._payload(action), settings: action.settings },
          };
          this._sendToInspector(context, settingsMessage);
          // Some inspectors replace their form on load; re-send once the page
          // has had a chance to attach its message handler.
          setTimeout(() => this._sendToInspector(context, settingsMessage), 150);
          return;
        }
        try { ws.close(4400, 'register first'); } catch { /* ignore */ }
        return;
      }

      if (inspectorAction) this._onInspectorMessage(ws, inspectorAction, msg);
      else if (pluginUuid) this._onPluginMessage(pluginUuid, msg);
    });

    ws.on('close', () => {
      if (pluginUuid && this.sockets.get(pluginUuid) === ws) this.sockets.delete(pluginUuid);
      if (inspectorAction) {
        if (this.inspectors.get(inspectorAction) === ws) this.inspectors.delete(inspectorAction);
        const action = this.actions.get(inspectorAction);
        if (action) {
          this._send(action.pluginUuid, {
            event: 'propertyInspectorDidDisappear',
            action: action.actionUuid,
            context: inspectorAction,
            device: 'ulanzi-d200',
          });
        }
      }
    });
    ws.on('error', () => {});
  }

  _onInspectorMessage(ws, context, msg) {
    const action = this.actions.get(context);
    if (!action) return;
    switch (msg.event) {
      case 'setSettings':
        this._applySettings(action, msg.payload || {}, 'inspector');
        break;
      case 'getSettings':
        this._sendToInspector(context, {
          event: 'didReceiveSettings',
          action: action.actionUuid,
          context,
          device: 'ulanzi-d200',
          payload: { ...this._payload(action), settings: action.settings },
        });
        break;
      case 'setGlobalSettings':
        this._setGlobalSettings(action.pluginUuid, msg.payload || {});
        break;
      case 'getGlobalSettings':
        this._sendToInspector(context, {
          event: 'didReceiveGlobalSettings',
          payload: { settings: this.globalSettings.get(action.pluginUuid) || {} },
        });
        break;
      case 'sendToPlugin':
        this._send(action.pluginUuid, {
          event: 'sendToPlugin',
          action: action.actionUuid,
          context,
          payload: msg.payload,
        });
        break;
      case 'openUrl':
        this._openUrl(msg.payload?.url || msg.url || '', action);
        break;
      default:
        break;
    }
  }

  _onPluginMessage(pluginUuid, msg) {
    const context = String(msg.context || '');
    const action = this.actions.get(context);

    if (msg.event === 'setGlobalSettings') {
      this._setGlobalSettings(pluginUuid, msg.payload || {});
      return;
    }
    if (msg.event === 'getGlobalSettings') {
      this._send(pluginUuid, {
        event: 'didReceiveGlobalSettings',
        payload: { settings: this.globalSettings.get(pluginUuid) || {} },
      });
      return;
    }
    if (msg.event === 'logMessage') {
      console.log(`[sd:${pluginUuid}] ${msg.payload?.message || ''}`);
      return;
    }
    if (!action || action.pluginUuid !== pluginUuid) {
      if (msg.event === 'openUrl') this._openUrl(msg.payload?.url || msg.url || '');
      if (msg.event === 'switchProfile') this.emit('switch-profile', { profile: msg.payload?.profile || msg.profile || '' });
      if (msg.event === 'deviceBrightness') {
        this.emit('brightness', { action: msg.payload?.action || 'set', value: Number(msg.payload?.value) || 0 });
      }
      return;
    }
    switch (msg.event) {
      case 'setSettings':
        this._applySettings(action, msg.payload || {}, 'plugin');
        break;
      case 'getSettings':
        this._send(pluginUuid, {
          event: 'didReceiveSettings',
          action: action.actionUuid,
          context,
          device: 'ulanzi-d200',
          payload: { ...this._payload(action), settings: action.settings },
        });
        break;
      case 'setImage': {
        const state = Number(msg.payload?.state);
        const image = this._normalizeImage(action, msg.payload?.image);
        const hasState = Number.isInteger(state) && state >= 0;
        if (hasState) {
          action.images.set(state, image);
        } else {
          const count = Math.max(1, action.actionMeta?.states?.length || 1);
          for (let i = 0; i < count; i++) action.images.set(i, image);
        }
        const target = hasState ? state : action.state;
        if (target === action.state) action.image = image || null;
        this.emit('state', {
          actionid: action.actionid,
          image,
          state: target,
          sdk: 'streamdeck',
        });
        break;
      }
      case 'setTitle': {
        const text = String(msg.payload?.title ?? '');
        const state = Number(msg.payload?.state);
        const hasState = Number.isInteger(state) && state >= 0;
        if (hasState) {
          action.titles.set(state, text);
        } else {
          const count = Math.max(1, action.actionMeta?.states?.length || 1);
          for (let i = 0; i < count; i++) action.titles.set(i, text);
        }
        const target = hasState ? state : action.state;
        if (target === action.state) action.title = text;
        this.emit('title', { actionid: action.actionid, text, state: target, sdk: 'streamdeck' });
        break;
      }
      case 'setState': {
        const next = Math.max(0, Number(msg.payload?.state) || 0);
        action.state = next;
        action.image = action.images.get(next) || null;
        this.emit('state-index', { actionid: action.actionid, state: next, sdk: 'streamdeck' });
        if (action.image) {
          this.emit('state', { actionid: action.actionid, image: action.image, state: next, sdk: 'streamdeck' });
        }
        if (action.titles.has(next)) {
          this.emit('title', { actionid: action.actionid, text: action.titles.get(next), state: next, sdk: 'streamdeck' });
        }
        break;
      }
      case 'showAlert':
        this.emit('alert', { actionid: action.actionid });
        break;
      case 'showOk':
        this.emit('ok', { actionid: action.actionid });
        break;
      case 'sendToPropertyInspector':
        this._sendToInspector(action.actionid, {
          event: 'sendToPropertyInspector',
          action: action.actionUuid,
          context: action.actionid,
          payload: msg.payload,
        });
        break;
      case 'openUrl':
        this._openUrl(msg.payload?.url || msg.url || '', action);
        break;
      case 'setFeedback':
      case 'setFeedbackLayout':
        break;
      case 'switchProfile':
        this.emit('switch-profile', { profile: msg.payload?.profile || msg.profile || '' });
        break;
      case 'deviceBrightness':
        this.emit('brightness', {
          action: msg.payload?.action || 'set',
          value: Number(msg.payload?.value) || 0,
        });
        break;
      default:
        break;
    }
  }

  _payload(action) {
    const slot = String(action.key || '0_0').split('_').map(Number);
    return {
      settings: action.settings,
      coordinates: { row: slot[1] || 0, column: slot[0] || 0 },
      controller: 'Keypad',
      state: action.state || 0,
      isInMultiAction: false,
    };
  }

  _applySettings(action, settings, source) {
    action.settings = settings && typeof settings === 'object' ? settings : {};
    this.emit('settings', { actionid: action.actionid, settings: action.settings, sdk: 'streamdeck' });
    if (source === 'inspector') {
      this._send(action.pluginUuid, {
        event: 'didReceiveSettings',
        action: action.actionUuid,
        context: action.actionid,
        device: 'ulanzi-d200',
        payload: { ...this._payload(action), settings: action.settings },
      });
    } else {
      this._sendToInspector(action.actionid, {
        event: 'didReceiveSettings',
        action: action.actionUuid,
        context: action.actionid,
        device: 'ulanzi-d200',
        payload: { ...this._payload(action), settings: action.settings },
      });
    }
  }

  _setGlobalSettings(pluginUuid, settings) {
    this.globalSettings.set(pluginUuid, settings);
    this._saveGlobalSettings();
    this.emit('global-settings', { plugin: pluginUuid, settings });
    this._send(pluginUuid, { event: 'didReceiveGlobalSettings', payload: { settings } });
    for (const [context, action] of this.actions) {
      if (action.pluginUuid === pluginUuid) {
        this._sendToInspector(context, { event: 'didReceiveGlobalSettings', payload: { settings } });
      }
    }
  }

  _normalizeImage(action, image) {
    if (!image || typeof image !== 'string') return null;
    if (image.startsWith('data:')) return image;
    if (image.trimStart().startsWith('<svg')) {
      return `data:image/svg+xml;base64,${Buffer.from(image, 'utf8').toString('base64')}`;
    }
    if (/^https?:/i.test(image)) return image;
    const file = path.join(action.meta.dir, image.replace(/^\.?\//, ''));
    if (!path.relative(action.meta.dir, file).startsWith('..') && fs.existsSync(file)) return fileToDataUrl(file);
    return `data:image/png;base64,${image}`;
  }

  _openUrl(url, action = null) {
    if (!url) return;
    const { shell } = require('electron');
    if (/^https?:|^mailto:/i.test(url)) {
      shell.openExternal(url);
      return;
    }
    if (action) {
      const file = path.resolve(action.meta.dir, String(url).replace(/^\.?\//, ''));
      if (!path.relative(action.meta.dir, file).startsWith('..')) shell.openPath(file);
    }
  }

  _send(pluginUuid, message) {
    const ws = this.sockets.get(pluginUuid);
    if (!ws || ws.readyState !== 1) {
      if (!this.queues.has(pluginUuid)) this.queues.set(pluginUuid, []);
      this.queues.get(pluginUuid).push(message);
      return;
    }
    ws.send(JSON.stringify(message));
  }

  _sendToInspector(context, message) {
    const ws = this.inspectors.get(context);
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(message));
  }

  _flushQueue(pluginUuid) {
    const queue = this.queues.get(pluginUuid);
    if (!queue) return;
    const ws = this.sockets.get(pluginUuid);
    if (!ws || ws.readyState !== 1) return;
    for (const message of queue) ws.send(JSON.stringify(message));
    this.queues.delete(pluginUuid);
  }

  // -------------------------------------------------------------- lifecycle

  _ensurePlugin(pluginUuid) {
    const meta = this.plugins.get(pluginUuid);
    if (!meta || !meta.compatible || !meta.code) return null;
    if (meta.code.kind === 'html') {
      if (this._htmlRunning?.has(pluginUuid)) return meta;
      this._htmlRunning = this._htmlRunning || new Set();
      this._htmlRunning.add(pluginUuid);
      const launch = (port) => {
        if (port) this.launchHtml?.(meta, this.infoString(meta));
      };
      if (this._portPromise) this._portPromise.then(launch);
      else launch(this.port);
      return meta;
    }
    const existing = this.children.get(pluginUuid);
    if (existing && existing.exitCode === null) return meta;
    const executable = path.join(meta.dir, meta.code.path);
    if (!fs.existsSync(executable)) {
      this.emit('error', `Plugin code not found: ${executable}`);
      return null;
    }
    const args = [
      '-port', '0',
      '-pluginUUID', pluginUuid,
      '-registerEvent', 'registerPlugin',
      '-info', this.infoString(meta),
    ];
    const run = (port) => {
      args[1] = String(port);
      let command;
      let commandArgs;
      let env;
      if (meta.code.kind === 'node') {
        command = nodeRuntime();
        commandArgs = [executable, ...args];
        env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
      } else if (meta.code.kind === 'wine') {
        command = 'wine';
        commandArgs = [executable, ...args];
        env = process.env;
      } else {
        try { fs.chmodSync(executable, 0o755); } catch { /* ignore */ }
        command = executable;
        commandArgs = args;
        env = process.env;
      }
      const proc = spawn(command, commandArgs, { cwd: meta.dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
      proc.on('error', (err) => {
        this.emit('error', `${meta.name} could not start: ${err.message}`);
        this.children.delete(pluginUuid);
      });
      this.children.set(pluginUuid, proc);
      this._logStream(meta, proc.stdout, 'out');
      this._logStream(meta, proc.stderr, 'err');
      proc.on('exit', (code) => {
        if (this.children.get(pluginUuid) === proc) this.children.delete(pluginUuid);
        this.sockets.delete(pluginUuid);
        if (!this.stopping && this._hasActionsFor(pluginUuid)) {
          const now = Date.now();
          const state = this.crashes.get(pluginUuid) || { count: 0, last: 0 };
          state.count = now - state.last < 60_000 ? state.count + 1 : 1;
          state.last = now;
          this.crashes.set(pluginUuid, state);
          if (state.count > 5) {
            this.emit('error', `${meta.name} keeps crashing — not restarting it.`);
            return;
          }
          const delay = Math.min(30_000, 1000 * 2 ** (state.count - 1));
          this.emit('error', `${meta.name} exited${code ? ` (${code})` : ''}; retrying in ${Math.round(delay / 1000)}s`);
          setTimeout(() => {
            if (!this.stopping && this._hasActionsFor(pluginUuid)) this._ensurePlugin(pluginUuid);
          }, delay);
        }
      });
    };
    if (this._portPromise) this._portPromise.then((port) => { if (port) run(port); });
    else run(this.port);
    return meta;
  }

  _logStream(meta, stream, kind) {
    let buffer = '';
    stream.on('data', (data) => {
      buffer += data.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line) {
          const target = kind === 'err' ? console.error : console.log;
          target(`[sd:${meta.name}] ${line.slice(0, 500)}${line.length > 500 ? '…' : ''}`);
        }
      }
      if (buffer.length > 200_000) buffer = buffer.slice(-2000);
    });
  }

  _hasActionsFor(pluginUuid) {
    for (const action of this.actions.values()) if (action.pluginUuid === pluginUuid) return true;
    return false;
  }

  _replay(pluginUuid) {
    for (const action of this.actions.values()) {
      if (action.pluginUuid !== pluginUuid) continue;
      if (!action.active) continue;
      this._send(pluginUuid, {
        event: 'willAppear',
        action: action.actionUuid,
        context: action.actionid,
        device: 'ulanzi-d200',
        payload: this._payload(action),
      });
    }
  }

  // ---------------------------------------------------------------- actions

  sync(wanted) {
    const next = new Map();
    for (const item of wanted || []) {
      if (!item || item.sdk !== 'streamdeck' || !item.actionid || !item.plugin || !item.action) continue;
      next.set(item.actionid, item);
    }

    for (const [actionid, current] of this.actions) {
      if (!next.has(actionid)) {
        this._send(current.pluginUuid, {
          event: 'willDisappear',
          action: current.actionUuid,
          context: actionid,
          device: 'ulanzi-d200',
          payload: this._payload(current),
        });
        this.actions.delete(actionid);
      }
    }

    for (const [actionid, item] of next) {
      const meta = this.plugins.get(item.plugin);
      if (!meta || !meta.compatible) continue;
      const actionMeta = meta.actions.find((a) => a.uuid === item.action) || null;
      const existing = this.actions.get(actionid);
      if (!existing) {
        const images = new Map();
        const titles = new Map();
        for (const [index, state] of (actionMeta?.states || []).entries()) {
          if (state.image) images.set(index, state.image);
          if (state.text) titles.set(index, state.text);
        }
        const action = {
          actionid,
          pluginUuid: item.plugin,
          actionUuid: item.action,
          key: item.key || '0_0',
          settings: item.settings || {},
          active: item.active !== false,
          meta,
          actionMeta,
          state: 0,
          image: images.get(0) || null,
          title: titles.get(0) || '',
          images,
          titles,
        };
        this.actions.set(actionid, action);
        this._ensurePlugin(item.plugin);
        if (action.image) this.emit('state', { actionid, image: action.image, state: 0, sdk: 'streamdeck' });
        if (action.title) this.emit('title', { actionid, text: action.title, state: 0, sdk: 'streamdeck' });
        if (action.active && this.sockets.has(item.plugin)) {
          this._send(item.plugin, {
            event: 'willAppear',
            action: item.action,
            context: actionid,
            device: 'ulanzi-d200',
            payload: this._payload(action),
          });
        }
      } else {
        if (JSON.stringify(existing.settings) !== JSON.stringify(item.settings || {})) {
          existing.settings = item.settings || {};
          this._send(item.plugin, {
            event: 'didReceiveSettings',
            action: existing.actionUuid,
            context: actionid,
            device: 'ulanzi-d200',
            payload: { ...this._payload(existing), settings: existing.settings },
          });
        }
        const active = item.active !== false;
        if (existing.active !== active) {
          existing.active = active;
          if (this.sockets.has(item.plugin)) this._send(item.plugin, {
            event: active ? 'willAppear' : 'willDisappear',
            action: existing.actionUuid,
            context: actionid,
            device: 'ulanzi-d200',
            payload: this._payload(existing),
          });
        }
        existing.key = item.key || existing.key;
      }
    }
  }

  run(actionid) {
    const action = this.actions.get(actionid);
    if (!action) return false;
    this.key(actionid, true);
    setTimeout(() => this.key(actionid, false), 80);
    return true;
  }

  key(actionid, pressed) {
    const action = this.actions.get(actionid);
    if (!action) return false;
    this._ensurePlugin(action.pluginUuid);
    const autoToggle =
      !pressed && action.actionMeta?.states?.length === 2 && !action.actionMeta.disableAutomaticStates;
    if (autoToggle) {
      action.state = (action.state + 1) % 2;
      action.image = action.images.get(action.state) || null;
    }
    this._send(action.pluginUuid, {
      event: pressed ? 'keyDown' : 'keyUp',
      action: action.actionUuid,
      context: actionid,
      device: 'ulanzi-d200',
      payload: this._payload(action),
    });
    if (autoToggle) {
      this.emit('state-index', { actionid, state: action.state, sdk: 'streamdeck' });
      if (action.image) this.emit('state', { actionid, image: action.image, state: action.state, sdk: 'streamdeck' });
      if (action.titles.has(action.state)) {
        this.emit('title', { actionid, text: action.titles.get(action.state), state: action.state, sdk: 'streamdeck' });
      }
    }
    return true;
  }

  setActionSettings(actionid, settings) {
    const action = this.actions.get(actionid);
    if (!action) return false;
    action.settings = settings || {};
    this._send(action.pluginUuid, {
      event: 'didReceiveSettings',
      action: action.actionUuid,
      context: actionid,
      device: 'ulanzi-d200',
      payload: { ...this._payload(action), settings: action.settings },
    });
    this._sendToInspector(actionid, {
      event: 'didReceiveSettings',
      action: action.actionUuid,
      context: actionid,
      device: 'ulanzi-d200',
      payload: { ...this._payload(action), settings: action.settings },
    });
    this.emit('settings', { actionid, settings: action.settings, sdk: 'streamdeck' });
    return true;
  }

  inspectorUrl({ plugin, action, actionid }) {
    const meta = this.plugins.get(plugin);
    if (!meta) return null;
    const actionMeta = meta.actions.find((a) => a.uuid === action);
    if (!actionMeta?.propertyInspector) return null;
    const rel = path.relative(meta.dir, actionMeta.propertyInspector).split(path.sep).map(encodeURIComponent).join('/');
    const folder = encodeURIComponent(path.basename(meta.dir));
    return `sd-pi://local/${folder}/${rel}?actionid=${encodeURIComponent(actionid)}`;
  }

  /** Build the [port, context, registerEvent, info, actionInfo] tuple for a PI. */
  inspectorConnect(actionid) {
    const action = this.actions.get(actionid);
    if (!action) return null;
    return [
      this.port,
      actionid,
      'registerPropertyInspector',
      this.infoString(action.meta),
      JSON.stringify({
        action: action.actionUuid,
        context: actionid,
        device: 'ulanzi-d200',
        payload: this._payload(action),
      }),
    ];
  }

  // --------------------------------------------------------------- install

  install(sourcePath) {
    fs.mkdirSync(this.appPluginsDir, { recursive: true });
    let workDir = sourcePath;
    let temp = null;
    if (fs.statSync(sourcePath).isFile()) {
      temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-plugin-'));
      try {
        const { execFileSync } = require('node:child_process');
        const entries = execFileSync('unzip', ['-Z1', sourcePath], { encoding: 'utf8' }).split('\n').filter(Boolean);
        for (const entry of entries) {
          if (entry.startsWith('/') || entry.split(/[\\/]/).includes('..')) {
            throw new Error('Plugin package contains an unsafe path');
          }
        }
        execFileSync('unzip', ['-oq', sourcePath, '-d', temp], { stdio: ['ignore', 'ignore', 'pipe'] });
      } catch (err) {
        const detail = String(err.stderr || err.message || '').trim().split('\n').filter(Boolean).pop();
        throw new Error(`Could not unpack the Stream Deck plugin ZIP${detail ? `: ${detail}` : ''}`);
      }
      workDir = temp;
    }
    const findPlugin = (dir, depth = 0) => {
      if (depth > 3) return null;
      if (dir.endsWith('.sdPlugin') && fs.existsSync(path.join(dir, 'manifest.json'))) return dir;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const found = findPlugin(path.join(dir, entry.name), depth + 1);
        if (found) return found;
      }
      return null;
    };
    try {
      let root = findPlugin(workDir);
      if (!root) {
        const fallback = path.join(workDir, 'manifest.json');
        if (!fs.existsSync(fallback)) throw new Error('No .sdPlugin folder found in the package');
        root = workDir;
      }
      const manifest = readJson(path.join(root, 'manifest.json'));
      if (!manifest.Name || !Array.isArray(manifest.Actions)) throw new Error('Invalid Stream Deck manifest');
      let folder = path.basename(root);
      if (!folder.endsWith('.sdPlugin')) folder = `${manifest.Name.replace(/[^A-Za-z0-9._-]/g, '')}.sdPlugin`;
      const dest = path.join(this.appPluginsDir, folder);
      if (path.relative(this.appPluginsDir, dest).startsWith('..')) throw new Error('Invalid plugin destination');
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
      fs.cpSync(root, dest, { recursive: true, force: true });
      return { uuid: folder, name: manifest.Name, list: this.reload() };
    } finally {
      if (temp) fs.rmSync(temp, { recursive: true, force: true });
    }
  }

  import(uuid) {
    const meta = this.plugins.get(uuid);
    if (!meta) throw new Error('Plugin not found');
    if (meta.writable) return { uuid, list: this.list() };
    fs.mkdirSync(this.appPluginsDir, { recursive: true });
    const dest = path.join(this.appPluginsDir, path.basename(meta.dir));
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(meta.dir, dest, { recursive: true, force: true });
    return { uuid, list: this.reload() };
  }

  remove(uuid) {
    const meta = this.plugins.get(uuid);
    if (!meta) throw new Error('Plugin not found');
    if (!meta.writable) throw new Error('This plugin is read-only');
    fs.rmSync(meta.dir, { recursive: true, force: true });
    return this.reload();
  }

  reload() {
    this.stopping = true;
    for (const proc of this.children.values()) {
      try { proc.kill(); } catch { /* ignore */ }
    }
    for (const uuid of this._htmlRunning || []) {
      try { this.stopHtml?.(uuid); } catch { /* ignore */ }
    }
    this.children.clear();
    this.sockets.clear();
    this.queues.clear();
    this.actions.clear();
    this._htmlRunning?.clear();
    this.stopping = false;
    return this.scan();
  }

  htmlExited(pluginUuid) {
    this._htmlRunning?.delete(pluginUuid);
    this.sockets.delete(pluginUuid);
    if (this.stopping || !this._hasActionsFor(pluginUuid)) return;
    const meta = this.plugins.get(pluginUuid);
    const now = Date.now();
    const state = this.crashes.get(pluginUuid) || { count: 0, last: 0 };
    state.count = now - state.last < 60_000 ? state.count + 1 : 1;
    state.last = now;
    this.crashes.set(pluginUuid, state);
    if (state.count > 5) {
      this.emit('error', `${meta?.name || pluginUuid} keeps closing — not restarting it.`);
      return;
    }
    setTimeout(() => {
      if (!this.stopping && this._hasActionsFor(pluginUuid)) this._ensurePlugin(pluginUuid);
    }, Math.min(30_000, 1000 * 2 ** (state.count - 1)));
  }

  stopAll() {
    this.stopping = true;
    for (const uuid of this._htmlRunning || []) {
      try { this.stopHtml?.(uuid); } catch { /* ignore */ }
    }
    this._htmlRunning?.clear();
    for (const proc of this.children.values()) {
      try { proc.kill(); } catch { /* ignore */ }
    }
    this.children.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}

module.exports = { StreamDeckPlugins, streamDeckPluginDirs };
