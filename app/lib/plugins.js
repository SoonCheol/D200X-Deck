'use strict';

const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { isInside } = require('./paths');

/**
 * The Electron main executable creates a Dock icon when spawned as a Node
 * child. Use the LSUIElement helper instead, which runs the same Node runtime
 * without flashing icons in the Dock while plugins start.
 */
function nodeRuntime() {
  if (process.env.ULANZI_NODE_BIN) return process.env.ULANZI_NODE_BIN;
  try {
    const exe = process.execPath;
    const name = path.basename(exe);
    const helper = path.join(path.dirname(exe), '..', 'Frameworks', `${name} Helper.app`, 'Contents', 'MacOS', `${name} Helper`);
    if (require('node:fs').existsSync(helper)) return helper;
  } catch {
    /* fall through */
  }
  return process.execPath;
}
const os = require('node:os');
const { WebSocketServer } = require('ws');

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function fileToDataUrl(file) {
  try {
    const ext = path.extname(file).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  } catch {
    return null;
  }
}

/** Normalise the several image payloads Ulanzi plugins use. */
function normalizeImage(data, fallbackMime = 'image/svg+xml') {
  if (!data || typeof data !== 'string') return null;
  if (data.startsWith('data:')) return data;
  if (data.trimStart().startsWith('<svg')) {
    return `data:${fallbackMime};base64,${Buffer.from(data, 'utf8').toString('base64')}`;
  }
  // base64 without a data: prefix
  return `data:${fallbackMime};base64,${data}`;
}

function pluginRootDirs() {
  const dirs = [path.join(os.homedir(), 'Library/Application Support/Ulanzi/UlanziDeck/Plugins')];
  if (process.platform !== 'darwin') {
    dirs.length = 0;
  }
  dirs.push(path.join(os.homedir(), '.ulanzi', 'Plugins'));
  return dirs;
}

class PluginManager extends EventEmitter {
  constructor({ dirs = pluginRootDirs(), appPluginsDir = null, port = 3906, language = 'en-US', appVersion = '0.1.0' } = {}) {
    super();
    this.dirs = dirs;
    this.appPluginsDir = appPluginsDir || dirs[0];
    this.stopping = false;
    this.port = port;
    this.language = language;
    this.appVersion = appVersion;
    this.plugins = new Map(); // uuid -> meta
    this.sockets = new Map(); // uuid -> ws
    this.inspectors = new Map(); // actionid -> ws (property inspector)
    this.queues = new Map(); // uuid -> messages[]
    this.children = new Map(); // uuid -> ChildProcess
    this.actions = new Map(); // actionid -> {pluginUuid, actionUuid, key, settings, active, meta}
    this.globalSettings = new Map(); // pluginUuid -> object
    this.crashes = new Map(); // pluginUuid -> { count, last }
    this.htmlRunning = new Set();
    this.launchHtml = null;
    this.stopHtml = null;
    this.wss = null;
    this._settingsFile = path.join(this.appPluginsDir, '.global-settings.json');
    this._loadGlobalSettings();
  }

  _loadGlobalSettings() {
    try {
      const data = JSON.parse(fs.readFileSync(this._settingsFile, 'utf8'));
      for (const [uuid, value] of Object.entries(data || {})) this.globalSettings.set(uuid, value);
    } catch {
      /* no persisted settings yet */
    }
  }

  _saveGlobalSettings() {
    try {
      fs.mkdirSync(this.appPluginsDir, { recursive: true });
      const data = Object.fromEntries(this.globalSettings);
      fs.writeFileSync(this._settingsFile, JSON.stringify(data, null, 2), { mode: 0o600 });
    } catch (err) {
      this.emit('error', `Could not save plugin settings: ${err.message}`);
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
        if (!entry.isDirectory() || !entry.name.endsWith('.ulanziPlugin')) continue;
        const dir = path.join(root, entry.name);
        const manifestPath = path.join(dir, 'manifest.json');
        if (!fs.existsSync(manifestPath)) continue;
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          const uuid = manifest.UUID || entry.name.replace(/\.ulanziPlugin$/, '');
          const type = manifest.Type || 'JavaScript';
          const codePath = manifest.CodePath || '';
          const isHtml = /\.html?$/i.test(codePath);
          const compatible = type === 'JavaScript' && (/\.(c|m)?js$/i.test(codePath) || isHtml);
          const icon = manifest.Icon ? fileToDataUrl(path.join(dir, manifest.Icon)) : null;
          const actions = (manifest.Actions || []).map((a) => ({
            uuid: a.UUID,
            name: a.Name || a.UUID,
            icon: a.Icon ? fileToDataUrl(path.join(dir, a.Icon)) : icon,
            tooltip: a.Tooltip || '',
            states: (a.States || []).map((s) => ({
              name: s.Name || '',
              image: s.Image ? fileToDataUrl(path.join(dir, s.Image)) : null,
            })),
            controllers: a.Controllers || ['Keypad'],
            propertyInspector: a.PropertyInspectorPath || null,
          }));
          // First source wins: app-installed plugins shadow Ulanzi's copy.
          if (this.plugins.has(uuid)) continue;
          this.plugins.set(uuid, {
            uuid,
            source: root,
            writable: path.resolve(root) === path.resolve(this.appPluginsDir),
            name: manifest.Name || uuid,
            description: manifest.Description || '',
            version: manifest.Version || '',
            author: manifest.Author || '',
            icon,
            dir,
            codePath: path.join(dir, codePath),
            manifest,
            compatible,
            html: isHtml,
            type,
            actions,
          });
        } catch (err) {
          this.emit('error', `Failed to read ${manifestPath}: ${err.message}`);
        }
      }
    }
    return this.list();
  }

  list() {
    return [...this.plugins.values()]
      .map((p) => ({
        uuid: p.uuid,
        sdk: 'ulanzi',
        name: p.name,
        description: p.description,
        version: p.version,
        author: p.author,
        icon: p.icon,
        compatible: p.compatible,
        type: p.type,
        source: p.source,
        writable: p.writable,
        actions: p.actions,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---------------------------------------------------------------- server

  start() {
    if (this.wss) return;
    this._portPromise = new Promise((resolve) => {
      const tryPort = (port, left) => {
        const wss = new WebSocketServer({
          host: '127.0.0.1',
          port,
          // Plugin processes are Node clients (no Origin). Property inspectors run
          // in our own scheme. Anything coming from a web page is refused.
          verifyClient: (info, done) => {
            const origin = String(info.origin || info.req?.headers?.origin || '');
            if (/^https?:/i.test(origin)) return done(false, 403, 'forbidden');
            done(true);
          },
        });
        wss.once('listening', () => {
          this.wss = wss;
          this.port = port;
          console.log(`[plugins] listening on ${port}`);
          wss.on('connection', (ws) => this._onConnection(ws));
          resolve(port);
        });
        wss.once('error', (err) => {
          if (err.code === 'EADDRINUSE' && left > 0) {
            // Ulanzi Studio (or another instance) owns 3906. Plugins get the
            // port as an argument and inspectors from the URL, so any free
            // port works and we must not talk to the vendor app's server.
            try { wss.close(); } catch { /* ignore */ }
            tryPort(port + 1, left - 1);
            return;
          }
          this.emit('error', `Plugin server: ${err.message}`);
          resolve(null);
        });
      };
      tryPort(this.port, 20);
    });
  }

  _onConnection(ws) {
    let pluginUuid = null;
    let inspectorAction = null;
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (process.env.ULANZI_SD_DEBUG) console.log('[ud]', msg.cmd, msg.actionid || msg.uuid || '', JSON.stringify(msg.param || msg.settings || {}).slice(0, 160));
      if (msg.cmd === 'connected') {
        // Property inspectors connect the same way but carry an actionid.
        if (msg.actionid) {
          inspectorAction = msg.actionid;
          this.inspectors.set(inspectorAction, ws);
          const action = this.actions.get(inspectorAction);
          ws.send(
            JSON.stringify({
              cmd: 'add',
              uuid: action?.actionUuid || msg.uuid,
              key: msg.key || action?.key || '',
              actionid: inspectorAction,
              param: action?.settings || {},
            })
          );
          return;
        }
        pluginUuid = msg.uuid;
        if (!this.plugins.has(pluginUuid)) {
          try { ws.close(4402, 'unknown plugin'); } catch { /* ignore */ }
          return;
        }
        this.sockets.set(pluginUuid, ws);
        this.crashes.delete(pluginUuid);
        this.emit('connected', pluginUuid);
        if (this.globalSettings.has(pluginUuid)) {
          this._send(pluginUuid, {
            cmd: 'didReceiveGlobalSettings',
            uuid: pluginUuid,
            settings: this.globalSettings.get(pluginUuid),
          });
        }
        this._flushQueue(pluginUuid);
        this._replay(pluginUuid);
        return;
      }
      if (inspectorAction && msg.cmd === 'paramfromplugin') {
        this.setActionSettings(inspectorAction, msg.param || msg.settings || {});
        return;
      }
      if (!pluginUuid && msg.uuid) pluginUuid = msg.uuid;
      this._onPluginMessage(msg);
    });
    ws.on('close', () => {
      if (pluginUuid && this.sockets.get(pluginUuid) === ws) this.sockets.delete(pluginUuid);
      if (inspectorAction && this.inspectors.get(inspectorAction) === ws) this.inspectors.delete(inspectorAction);
    });
    ws.on('error', () => {});
  }

  /** Update one action's settings and push them to its plugin and inspector. */
  setActionSettings(actionid, settings) {
    const action = this.actions.get(actionid);
    if (!action) return false;
    action.settings = settings || {};
    this._send(action.pluginUuid, {
      cmd: 'paramfromapp',
      uuid: action.actionUuid,
      key: action.key,
      actionid,
      param: action.settings,
    });
    const inspector = this.inspectors.get(actionid);
    if (inspector && inspector.readyState === 1) {
      inspector.send(
        JSON.stringify({
          cmd: 'paramfromapp',
          uuid: action.actionUuid,
          key: action.key,
          actionid,
          param: action.settings,
        })
      );
    }
    this.emit('settings', { actionid, settings: action.settings });
    return true;
  }

  /** file:// URL for an action's property inspector, with the SDK query params. */
  inspectorUrl({ plugin, action, actionid, key }) {
    const meta = this.plugins.get(plugin);
    if (!meta) return null;
    const pluginAction = meta.actions.find((a) => a.uuid === action);
    const rel = pluginAction?.propertyInspector;
    if (!rel) return null;
    const file = path.join(meta.dir, rel);
    if (!fs.existsSync(file)) return null;
    const relPath = path.relative(meta.dir, file).split(path.sep).map(encodeURIComponent).join('/');
    // The folder name (…​.ulanziPlugin) is what the Ulanzi SDK uses to locate the
    // plugin root for its localization files.
    const folder = path.basename(meta.dir);
    const url = new URL(`ulanzi-pi://local/${encodeURIComponent(folder)}/${relPath}`);
    // Different SDK generations read different casings of these params.
    url.searchParams.set('actionId', actionid);
    url.searchParams.set('actionid', actionid);
    url.searchParams.set('uuid', plugin);
    url.searchParams.set('key', key || '');
    url.searchParams.set('port', String(this.port));
    url.searchParams.set('address', '127.0.0.1');
    url.searchParams.set('language', this.language);
    url.searchParams.set('controller', 'Keypad');
    return url.toString();
  }

  _send(pluginUuid, message) {
    // NB: the Ulanzi SDK ignores host messages that carry a `code` field
    // unless cmdType === "REQUEST".
    const payload = { ...message };
    const ws = this.sockets.get(pluginUuid);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    } else {
      if (!this.queues.has(pluginUuid)) this.queues.set(pluginUuid, []);
      this.queues.get(pluginUuid).push(payload);
    }
  }

  _flushQueue(pluginUuid) {
    const queue = this.queues.get(pluginUuid);
    if (!queue) return;
    const ws = this.sockets.get(pluginUuid);
    if (!ws || ws.readyState !== 1) return;
    for (const msg of queue) ws.send(JSON.stringify(msg));
    this.queues.delete(pluginUuid);
  }

  // --------------------------------------------------------------- process

  _ensurePlugin(pluginUuid) {
    const meta = this.plugins.get(pluginUuid);
    if (!meta) return null;
    if (!meta.compatible) return null;
    // The server port is resolved asynchronously; wait for it so the plugin
    // and its inspector are pointed at our own server, not at 3906.
    if (!this.wss && this._portPromise) {
      this._portPromise.then((port) => { if (port) this._ensurePlugin(pluginUuid); });
      return meta;
    }
    if (meta.html) {
      // HTML plugins run inside a hidden BrowserWindow and connect to our host
      // over the same WebSocket protocol; main.js owns the window lifecycle.
      if (this.htmlRunning?.has(pluginUuid)) return meta;
      this.htmlRunning?.add(pluginUuid);
      this.launchHtml?.(meta);
      return meta;
    }
    const child = this.children.get(pluginUuid);
    if (child && child.exitCode === null) return meta;
    if (!fs.existsSync(meta.codePath)) {
      this.emit('error', `Plugin code not found: ${meta.codePath}`);
      return null;
    }
    const proc = spawn(
      nodeRuntime(),
      [meta.codePath, '127.0.0.1', String(this.port), this.language, this.appVersion],
      {
        cwd: meta.dir,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    proc.on('error', (err) => {
      this.emit('error', `${meta.name || pluginUuid} could not start: ${err.message}`);
      this.children.delete(pluginUuid);
    });
    this.children.set(pluginUuid, proc);
    const prefix = `[plugin ${meta.name}]`;
    const lineLogger = (stream) => {
      let buffer = '';
      return (data) => {
        buffer += data.toString();
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.trim()) {
            stream.write(`${prefix} ${line.slice(0, 400)}${line.length > 400 ? '…' : ''}\n`);
          }
        }
        if (buffer.length > 200000) buffer = buffer.slice(-2000);
      };
    };
    proc.stdout.on('data', lineLogger(process.stdout));
    proc.stderr.on('data', lineLogger(process.stderr));
    proc.on('exit', (code) => {
      if (this.restarting?.delete(pluginUuid)) return;
      if (this.children.get(pluginUuid) === proc) this.children.delete(pluginUuid);
      const ws = this.sockets.get(pluginUuid);
      if (ws) this.sockets.delete(pluginUuid);
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
    return meta;
  }

  // --------------------------------------------------------------- actions

  _hasActionsFor(pluginUuid) {
    for (const action of this.actions.values()) {
      if (action.pluginUuid === pluginUuid) return true;
    }
    return false;
  }

  _replay(pluginUuid) {
    for (const action of this.actions.values()) {
      if (action.pluginUuid !== pluginUuid) continue;
      this._send(pluginUuid, {
        cmd: 'add',
        uuid: action.actionUuid,
        key: action.key,
        actionid: action.actionid,
        action: action.actionUuid,
        name: action.pluginAction?.name || '',
        param: { ...action.settings, forceRefresh: Date.now() },
      });
      this._send(pluginUuid, {
        cmd: 'setactive',
        uuid: action.actionUuid,
        key: action.key,
        actionid: action.actionid,
        active: action.active,
      });
    }
  }

  /** Stop one plugin and start it again (used by Installed → Reload). */
  restart(pluginUuid) {
    this.restarting = this.restarting || new Set();
    const meta = this.plugins.get(pluginUuid);
    if (meta?.html) {
      this.stopHtml?.(pluginUuid);
      this.htmlRunning?.delete(pluginUuid);
      this.sockets.delete(pluginUuid);
      this._ensurePlugin(pluginUuid);
      return true;
    }
    const proc = this.children.get(pluginUuid);
    if (proc) {
      this.restarting.add(pluginUuid);
      try { proc.kill(); } catch { /* ignore */ }
      this.children.delete(pluginUuid);
      this.sockets.delete(pluginUuid);
      this.crashes.delete(pluginUuid);
      setTimeout(() => {
        if (!this.stopping) this._ensurePlugin(pluginUuid);
      }, 200);
      return true;
    }
    this.sockets.delete(pluginUuid);
    this._ensurePlugin(pluginUuid);
    return true;
  }

  reload() {
    this.stopping = true;
    for (const proc of this.children.values()) {
      try { proc.kill(); } catch { /* ignore */ }
    }
    this.children.clear();
    this.sockets.clear();
    this.queues.clear();
    this.actions.clear();
    this.inspectors.clear();
    this.stopping = false;
    return this.scan();
  }

  /** Stop one plugin, rescan the folders, and restart it if it has actions. */
  reloadOne(uuid) {
    const id = String(uuid);
    const meta = this.plugins.get(id);
    if (meta?.html) {
      try { this.stopHtml?.(id); } catch { /* ignore */ }
      this.htmlRunning?.delete(id);
    }
    const proc = this.children.get(id);
    if (proc) {
      this.restarting = this.restarting || new Set();
      this.restarting.add(id);
      try { proc.kill(); } catch { /* ignore */ }
    }
    this.children.delete(id);
    this.sockets.delete(id);
    this.queues.delete(id);
    this.actions.delete(id);
    this.inspectors.delete(id);
    this.crashes.delete(id);
    this.scan();
    if (this._hasActionsFor(id)) this._ensurePlugin(id);
    return this.list();
  }

  /** Install a .ulanziPlugin folder or a ZIP containing one. */
  install(sourcePath) {
    const fs = require('node:fs');
    const os = require('node:os');
    const { execFileSync } = require('node:child_process');
    fs.mkdirSync(this.appPluginsDir, { recursive: true });

    let workDir = sourcePath;
    let temp = null;
    if (fs.statSync(sourcePath).isFile()) {
      temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-plugin-'));
      try {
        execFileSync('unzip', ['-oq', sourcePath, '-d', temp], { stdio: ['ignore', 'ignore', 'pipe'] });
      } catch (err) {
        const detail = String(err.stderr || '').trim().split('\n').filter(Boolean).pop();
        throw new Error(`Could not unpack the plugin ZIP${detail ? `: ${detail}` : ''}`);
      }
      workDir = temp;
    }

    const findManifest = (dir, depth = 0) => {
      if (depth > 2) return null;
      const direct = path.join(dir, 'manifest.json');
      if (fs.existsSync(direct)) return dir;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const found = findManifest(path.join(dir, entry.name), depth + 1);
        if (found) return found;
      }
      return null;
    };

    try {
      const root = findManifest(workDir);
      if (!root) throw new Error('No manifest.json found in the plugin package');
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
      const uuid = String(manifest.UUID || '').trim();
      if (!uuid) throw new Error('manifest.json has no UUID');
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(uuid)) {
        throw new Error('manifest.json has an invalid UUID');
      }
      const dest = path.join(this.appPluginsDir, `${uuid}.ulanziPlugin`);
      if (path.relative(this.appPluginsDir, dest).startsWith('..')) {
        throw new Error('plugin destination escapes the plugins folder');
      }
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
      fs.cpSync(root, dest, { recursive: true, force: true });
      return { uuid, name: manifest.Name || uuid, list: this.reloadOne(uuid) };
    } finally {
      if (temp) fs.rmSync(temp, { recursive: true, force: true });
    }
  }

  /** Copy an official (read-only) plugin into the app folder so it can be managed. */
  import(uuid) {
    const meta = this.plugins.get(uuid);
    if (!meta) throw new Error('Plugin not found');
    if (meta.writable) return { uuid, list: this.list() };
    const fs = require('node:fs');
    fs.mkdirSync(this.appPluginsDir, { recursive: true });
    const dest = path.join(this.appPluginsDir, path.basename(meta.dir));
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(meta.dir, dest, { recursive: true, force: true });
    return { uuid, list: this.reloadOne(uuid) };
  }

  remove(uuid) {
    const meta = this.plugins.get(uuid);
    if (!meta) throw new Error('Plugin not found');
    if (!meta.writable) throw new Error('This plugin is read-only (installed by Ulanzi Studio)');
    const fs = require('node:fs');
    fs.rmSync(meta.dir, { recursive: true, force: true });
    return this.reloadOne(uuid);
  }

  /**
   * Reconcile the set of plugin-backed keys.
   * @param {Array<{actionid, plugin, action, key, settings, active, name}>} wanted
   */
  sync(wanted) {
    const next = new Map();
    for (const item of wanted || []) {
      if (!item || !item.actionid || !item.plugin) continue;
      next.set(item.actionid, item);
    }

    // remove
    for (const [actionid, current] of this.actions) {
      if (!next.has(actionid)) {
        this._clearAction(current);
        this.actions.delete(actionid);
      }
    }

    // add / update
    for (const [actionid, item] of next) {
      const meta = this.plugins.get(item.plugin);
      if (!meta || !meta.compatible) continue;
      const existing = this.actions.get(actionid);
      const settings = item.settings || {};
      const pluginAction = meta.actions.find((a) => a.uuid === item.action);

      if (!existing) {
        this.actions.set(actionid, {
          actionid,
          pluginUuid: item.plugin,
          actionUuid: item.action,
          key: item.key,
          settings,
          active: item.active !== false,
          meta,
          pluginAction,
        });
        this._ensurePlugin(item.plugin);
        this._send(item.plugin, {
          cmd: 'add',
          uuid: item.action,
          key: item.key,
          actionid,
          action: item.action,
          name: pluginAction?.name || item.name || '',
          // Some plugins (e.g. Currency) only fetch on a settings change; a
          // fresh forceRefresh makes the first render load the value instead
          // of waiting for the next interval.
          param: { ...settings, forceRefresh: Date.now() },
        });
        this._send(item.plugin, {
          cmd: 'setactive',
          uuid: item.action,
          key: item.key,
          actionid,
          active: item.active !== false,
        });
      } else {
        if (JSON.stringify(existing.settings) !== JSON.stringify(settings)) {
          existing.settings = settings;
          this._send(item.plugin, {
            cmd: 'paramfromapp',
            uuid: item.action,
            key: item.key,
            actionid,
            param: settings,
          });
        }
        if (existing.active !== (item.active !== false)) {
          existing.active = item.active !== false;
          this._send(item.plugin, {
            cmd: 'setactive',
            uuid: item.action,
            key: item.key,
            actionid,
            active: existing.active,
          });
        }
      }
    }
  }

  _clearAction(action) {
    this._send(action.pluginUuid, {
      cmd: 'clear',
      uuid: action.actionUuid,
      param: [{ uuid: action.actionUuid, key: action.key, actionid: action.actionid }],
    });
  }

  run(actionid) {
    const action = this.actions.get(actionid);
    if (!action) return false;
    const base = {
      uuid: action.actionUuid,
      key: action.key,
      actionid,
      param: action.settings,
    };
    this._send(action.pluginUuid, { cmd: 'keydown', ...base });
    this._send(action.pluginUuid, { cmd: 'run', ...base });
    setTimeout(() => this._send(action.pluginUuid, { cmd: 'keyup', ...base }), 80);
    return true;
  }

  // -------------------------------------------------------- plugin messages

  _onPluginMessage(msg) {
    const actionid = msg.actionid || msg.param?.actionid;
    const action = actionid ? this.actions.get(actionid) : null;

    switch (msg.cmd) {
      case 'state':
        this._handleState(msg, action);
        if (msg.text || msg.param?.text) {
          this.emit('title', { actionid, text: msg.text ?? msg.param.text });
        }
        if (typeof msg.state === 'number') {
          this.emit('state-index', { actionid, state: msg.state });
        }
        break;
      case 'setImage':
        this._handleState(msg, action);
        break;
      case 'setTitle':
        this.emit('title', { actionid, text: msg.text ?? msg.param?.text ?? '' });
        break;
      case 'setState':
        this.emit('state-index', { actionid, state: msg.param?.state ?? msg.state ?? 0 });
        break;
      case 'setSettings':
      case 'paramfromplugin':
        if (action && msg.settings) {
          action.settings = msg.settings;
          this.emit('settings', { actionid, settings: msg.settings });
        }
        break;
      case 'getSettings':
        if (action) {
          this._send(action.pluginUuid, {
            cmd: 'didReceiveSettings',
            uuid: action.actionUuid,
            key: action.key,
            actionid,
            settings: action.settings,
          });
        }
        break;
      case 'setGlobalSettings':
        if (msg.uuid) {
          this.globalSettings.set(msg.uuid, msg.settings || {});
          this.emit('global-settings', { plugin: msg.uuid, settings: msg.settings || {} });
        }
        break;
      case 'getGlobalSettings':
        this._send(msg.uuid, {
          cmd: 'didReceiveGlobalSettings',
          uuid: msg.uuid,
          settings: this.globalSettings.get(msg.uuid) || {},
        });
        break;
      case 'openurl':
        this._openUrl(msg, action);
        break;
      case 'openview':
        this.openView?.(msg, action);
        break;
      case 'selectdialog':
        this._selectDialog(msg, action);
        break;
      case 'setFeedback':
      case 'setFeedbackLayout':
        // Encoder-only feedback; the D200 has no dials, so accept and ignore.
        break;
      case 'toast':
        this.emit('toast', msg.msg || msg.message || '');
        break;
      case 'logMessage':
        console.log(`[plugin:${msg.level || 'info'}] ${msg.message}`);
        break;
      case 'showAlert':
        this.emit('alert', { actionid });
        break;
      case 'sendToPropertyInspector':
      case 'sendToPlugin':
        this.emit('plugin-message', msg);
        break;
      default:
        break;
    }
  }

  async _selectDialog(msg, action) {
    if (!this.selectDialog) return;
    const reply = (result) => {
      this._send(action?.pluginUuid || msg.uuid, {
        cmd: 'selectdialog',
        uuid: action?.actionUuid || msg.uuid,
        key: action?.key || msg.key || '',
        actionid: action?.actionid || msg.actionid || '',
        type: msg.type || 'file',
        ...result,
      });
    };
    try {
      const result = await this.selectDialog(msg, action);
      if (result) reply(result);
    } catch (err) {
      reply({ canceled: true, error: err.message || String(err) });
    }
  }

  _handleState(msg, action) {
    const list = msg.param?.statelist || msg.statelist || [];
    for (const item of list) {
      const id = item.actionid || msg.actionid;
      const target = this.actions.get(id) || action;
      if (!target) continue;
      let image = null;
      if (item.type === 2 && item.path) {
        image = fileToDataUrl(path.resolve(target.meta.dir, item.path));
      } else if (item.type === 3) {
        image = normalizeImage(item.gifdata, 'image/gif');
      } else if (item.type === 0) {
        const state = Number(item.state || 0);
        image = target.pluginAction?.states?.[state]?.image || null;
      } else {
        image = normalizeImage(item.data);
      }
      this.emit('state', {
        actionid: id,
        image,
        text: item.textData || '',
        showtext: Boolean(item.showtext),
      });
    }
  }

  _openUrl(msg, action) {
    const { shell } = require('electron');
    let url = msg.url || '';
    if (msg.local && action) {
      const file = path.resolve(action.meta.dir, url.replace(/^\.?\//, ''));
      if (!isInside(action.meta.dir, file)) return;
      shell.openPath(file);
      return;
    }
    if (msg.param && typeof msg.param === 'object') {
      const qs = new URLSearchParams(msg.param).toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
  }

  /** Called by main.js when an HTML plugin window closes or is closed. */
  htmlExited(pluginUuid) {
    this.htmlRunning.delete(pluginUuid);
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
    const delay = Math.min(30_000, 1000 * 2 ** (state.count - 1));
    setTimeout(() => {
      if (!this.stopping && this._hasActionsFor(pluginUuid)) this._ensurePlugin(pluginUuid);
    }, delay);
  }

  /** Graceful shutdown: SIGTERM every child, then SIGKILL whatever is left. */
  async shutdown(timeoutMs = 1500) {
    this.stopping = true;
    for (const uuid of this.htmlRunning || []) {
      try { this.stopHtml?.(uuid); } catch { /* ignore */ }
    }
    this.htmlRunning?.clear();
    const procs = [...this.children.values()];
    this.children.clear();
    this.inspectors.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    await Promise.all(
      procs.map(
        (proc) =>
          new Promise((resolve) => {
            if (!proc || proc.exitCode !== null) return resolve();
            const timer = setTimeout(() => {
              try { proc.kill('SIGKILL'); } catch { /* ignore */ }
              resolve();
            }, timeoutMs);
            proc.once('exit', () => {
              clearTimeout(timer);
              resolve();
            });
            try { proc.kill('SIGTERM'); } catch { /* ignore */ }
          })
      )
    );
  }
}

module.exports = { PluginManager, pluginRootDirs, nodeRuntime };
