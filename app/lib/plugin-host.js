'use strict';

const { EventEmitter } = require('node:events');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebSocketServer } = require('ws');

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
    const helper = path.join(
      path.dirname(exe),
      '..',
      'Frameworks',
      `${name} Helper.app`,
      'Contents',
      'MacOS',
      `${name} Helper`
    );
    if (fs.existsSync(helper)) return helper;
  } catch {
    /* fall through */
  }
  return process.execPath;
}

/**
 * Shared lifecycle for the Ulanzi and Stream Deck plugin hosts: discovery,
 * the WebSocket server and port fallback, spawn/exit/backoff, settings
 * persistence, install/import/remove and shutdown.
 *
 * Subclasses supply the manifest reader, spawn command and protocol messages.
 */
class PluginHost extends EventEmitter {
  constructor({
    dirs,
    appPluginsDir = null,
    port,
    language = 'en',
    appVersion = '0.1.0',
    logFile = null,
    label = 'plugin',
  }) {
    super();
    this.dirs = dirs;
    this.appPluginsDir = appPluginsDir || dirs[0];
    this.port = port;
    this.language = language;
    this.appVersion = appVersion;
    this.logFile = logFile;
    this.label = label;

    this.plugins = new Map(); // uuid -> meta
    this.sockets = new Map(); // uuid -> ws
    this.inspectors = new Map(); // actionid/context -> ws
    this.queues = new Map(); // uuid -> messages[]
    this.children = new Map(); // uuid -> ChildProcess
    this.actions = new Map(); // actionid -> action instance
    this.globalSettings = new Map(); // uuid -> object
    this.crashes = new Map(); // uuid -> { count, last }
    this.htmlRunning = new Set();
    this.starting = new Set();
    this.restarting = new Set();

    this.wss = null;
    this.stopping = false;
    this.launchHtml = null;
    this.stopHtml = null;
    this.openView = null;
    this.selectDialog = null;
    this._portPromise = null;
    this._portReady = false;
    this._portFailed = false;
    this.retired = new Set();
    this.spawn = spawn;
    this._settingsFile = path.join(this.appPluginsDir, '.global-settings.json');
    this._loadGlobalSettings();
  }

  // ------------------------------------------------------------- hooks

  /** True when a directory entry is one of this host's plugin folders. */
  isPluginDir(_entry) {
    return false;
  }

  /** Parse one plugin directory into a meta object (or null to skip it). */
  readPlugin(_dir, _root) {
    return null;
  }

  /** True when the plugin runs as an HTML page in a hidden window. */
  isHtml(_meta) {
    return false;
  }

  /** Start an HTML plugin. Subclasses may wait for the port first. */
  launchHtmlPlugin(meta) {
    this.launchHtml?.(meta);
  }

  /** Absolute path of the plugin's executable/code file. */
  executableFor(meta) {
    return meta.codePath || null;
  }

  /**
   * Build the command used to start a child process.
   * @returns {{ command: string, args: string[], env: NodeJS.ProcessEnv }}
   */
  spawnCommand(_meta, _executable, _port) {
    throw new Error('spawnCommand must be implemented');
  }

  /** Called before a message is queued or sent (logging in the SD host). */
  beforeSend(_uuid, _message) {}

  /** Re-send the actions of a plugin after it connects. */
  _replay(_uuid) {}

  /** Reconcile plugin-backed keys. Implemented by each protocol. */
  sync(_wanted) {}

  list() {
    return [];
  }

  /** Human-readable list of plugin metadata; implemented by each protocol. */
  _onConnection(_ws) {
    throw new Error('_onConnection must be implemented');
  }

  // --------------------------------------------------------- settings

  _loadGlobalSettings() {
    try {
      const data = JSON.parse(fs.readFileSync(this._settingsFile, 'utf8'));
      for (const [uuid, value] of Object.entries(data || {})) this.globalSettings.set(uuid, value);
    } catch {
      /* no persisted settings yet */
    }
  }

  /** Report an error without assuming a listener is attached yet. */
  _reportError(message) {
    if (this.listenerCount('error') > 0) this.emit('error', message);
    else console.error(`[${this.label}] ${message}`);
  }

  _saveGlobalSettings() {
    try {
      fs.mkdirSync(this.appPluginsDir, { recursive: true });
      fs.writeFileSync(this._settingsFile, JSON.stringify(Object.fromEntries(this.globalSettings), null, 2), {
        mode: 0o600,
      });
    } catch (err) {
      this._reportError(`Could not save plugin settings: ${err.message}`);
    }
  }

  // -------------------------------------------------------- discovery

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
        if (!this.isPluginDir(entry)) continue;
        const dir = path.join(root, entry.name);
        try {
          const meta = this.readPlugin(dir, root);
          // First source wins: app-installed plugins shadow the vendor copy.
          if (meta && !this.plugins.has(meta.uuid)) this.plugins.set(meta.uuid, meta);
        } catch (err) {
          this._reportError(`Failed to read ${path.join(dir, 'manifest.json')}: ${err.message}`);
        }
      }
    }
    return this.list();
  }

  // ----------------------------------------------------------- server

  start() {
    if (this.wss) return;
    this._portPromise = new Promise((resolve) => {
      const tryPort = (port, left) => {
        const wss = new WebSocketServer({
          host: '127.0.0.1',
          port,
          // Plugin processes are Node clients (no Origin). Property inspectors
          // run in our own scheme. Anything from a web page is refused.
          verifyClient: (info, done) => {
            const origin = String(info.origin || info.req?.headers?.origin || '');
            if (/^https?:/i.test(origin)) return done(false, 403, 'forbidden');
            done(true);
          },
        });
        wss.once('listening', () => {
          this.wss = wss;
          this.port = port;
          this._portReady = true;
          this._portFailed = false;
          console.log(`[${this.label}] listening on ${port}`);
          wss.on('connection', (ws) => this._onConnection(ws));
          resolve(port);
        });
        wss.once('error', (err) => {
          if (err.code === 'EADDRINUSE' && left > 0) {
            // Another instance owns the port. Plugins get the port as an
            // argument and inspectors from the URL, so any free port works.
            try { wss.close(); } catch { /* ignore */ }
            tryPort(port + 1, left - 1);
            return;
          }
          this._portFailed = true;
          this._reportError(`Plugin server: ${err.message}`);
          resolve(null);
        });
      };
      tryPort(this.port, 20);
    });
  }

  _send(pluginUuid, message) {
    this.beforeSend(pluginUuid, message);
    const ws = this.sockets.get(pluginUuid);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(message));
      return;
    }
    if (!this.queues.has(pluginUuid)) this.queues.set(pluginUuid, []);
    this.queues.get(pluginUuid).push(message);
  }

  _flushQueue(pluginUuid) {
    const queue = this.queues.get(pluginUuid);
    if (!queue) return;
    const ws = this.sockets.get(pluginUuid);
    if (!ws || ws.readyState !== 1) return;
    for (const message of queue) ws.send(JSON.stringify(message));
    this.queues.delete(pluginUuid);
  }

  // ---------------------------------------------------------- lifecycle

  _ensurePlugin(pluginUuid) {
    const meta = this.plugins.get(pluginUuid);
    if (!meta || !meta.compatible) return null;
    if (this.stopping || this._portFailed) return meta;
    // The server port is resolved asynchronously; wait for it so the plugin
    // is pointed at our own server, not at the vendor app's.
    if (!this.wss && this._portPromise && !this._portReady) {
      this._portPromise.then((port) => {
        this._portReady = true;
        if (this.stopping) return;
        if (!port) {
          this._portFailed = true;
          this._reportError('Plugin server did not start; plugins will not be launched.');
          return;
        }
        this._ensurePlugin(pluginUuid);
      });
      return meta;
    }
    if (this.isHtml(meta)) {
      if (this.htmlRunning.has(pluginUuid)) return meta;
      this.htmlRunning.add(pluginUuid);
      this.launchHtmlPlugin(meta);
      return meta;
    }
    const existing = this.children.get(pluginUuid);
    if (existing && existing.exitCode === null) return meta;
    if (this.starting.has(pluginUuid)) return meta;
    this.starting.add(pluginUuid);
    const executable = this.executableFor(meta);
    if (!executable || !fs.existsSync(executable)) {
      this.starting.delete(pluginUuid);
      this._reportError(`Plugin code not found: ${executable}`);
      return null;
    }
    this._spawn(meta, executable, this.port);
    this.starting.delete(pluginUuid);
    return meta;
  }

  _spawn(meta, executable, port) {
    const { command, args, env } = this.spawnCommand(meta, executable, port);
    this._log(`spawn ${meta.uuid} ${command} ${args.slice(1).join(' ')}`);
    const proc = this.spawn(command, args, { cwd: meta.dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    proc.on('error', (err) => {
      this._reportError(`${meta.name} could not start: ${err.message}`);
      this.children.delete(meta.uuid);
    });
    this.children.set(meta.uuid, proc);
    this._logStream(meta, proc.stdout, 'out');
    this._logStream(meta, proc.stderr, 'err');
    proc.on('exit', (code) => this._onChildExit(meta, proc, code));
    return proc;
  }

  _onChildExit(meta, proc, code) {
    this._log(`exit ${meta.uuid} code=${code}`);
    if (this.restarting.delete(meta.uuid)) return;
    if (this.children.get(meta.uuid) === proc) this.children.delete(meta.uuid);
    this.sockets.delete(meta.uuid);
    if (this.stopping || !this._hasActionsFor(meta.uuid)) return;
    const now = Date.now();
    const state = this.crashes.get(meta.uuid) || { count: 0, last: 0 };
    state.count = now - state.last < 60_000 ? state.count + 1 : 1;
    state.last = now;
    this.crashes.set(meta.uuid, state);
    if (state.count > 5) {
      this._reportError(`${meta.name} keeps crashing — not restarting it.`);
      return;
    }
    const delay = Math.min(30_000, 1000 * 2 ** (state.count - 1));
    this._reportError(`${meta.name} exited${code ? ` (${code})` : ''}; retrying in ${Math.round(delay / 1000)}s`);
    setTimeout(() => {
      if (!this.stopping && this._hasActionsFor(meta.uuid)) this._ensurePlugin(meta.uuid);
    }, delay);
  }

  _hasActionsFor(pluginUuid) {
    for (const action of this.actions.values()) {
      if (action.pluginUuid === pluginUuid) return true;
    }
    return false;
  }

  /** Stop one plugin and start it again (used by Installed → Reload). */
  restart(pluginUuid) {
    const meta = this.plugins.get(pluginUuid);
    if (this.isHtml(meta)) {
      try { this.stopHtml?.(pluginUuid); } catch { /* ignore */ }
      this.htmlRunning.delete(pluginUuid);
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
      // Do not overlap the replacement with a child that may still be alive.
      let started = false;
      const start = () => {
        if (started) return;
        started = true;
        if (!this.stopping) this._ensurePlugin(pluginUuid);
      };
      proc.once('exit', start);
      setTimeout(start, 2000);
      return true;
    }
    this.sockets.delete(pluginUuid);
    this._ensurePlugin(pluginUuid);
    return true;
  }

  reload() {
    this.stopping = true;
    for (const proc of this.children.values()) {
      // Keep a handle until it exits, so shutdown can still SIGKILL a process
      // that ignores SIGTERM after the reload.
      this.retired.add(proc);
      proc.once('exit', () => this.retired.delete(proc));
      try { proc.kill(); } catch { /* ignore */ }
    }
    for (const uuid of this.htmlRunning) {
      try { this.stopHtml?.(uuid); } catch { /* ignore */ }
    }
    this.children.clear();
    this.sockets.clear();
    this.queues.clear();
    this.actions.clear();
    this.inspectors.clear();
    this.htmlRunning.clear();
    this.starting.clear();
    this.stopping = false;
    return this.scan();
  }

  /** Stop one plugin, rescan the folders, and restart it if it has actions. */
  reloadOne(uuid) {
    const id = String(uuid);
    const meta = this.plugins.get(id);
    if (this.isHtml(meta)) {
      try { this.stopHtml?.(id); } catch { /* ignore */ }
      this.htmlRunning.delete(id);
    }
    const proc = this.children.get(id);
    if (proc) {
      this.restarting.add(id);
      try { proc.kill(); } catch { /* ignore */ }
    }
    this.children.delete(id);
    this.sockets.delete(id);
    this.queues.delete(id);
    for (const [actionid, action] of this.actions) {
      if (action.pluginUuid === id) this.actions.delete(actionid);
    }
    this.inspectors.delete(id);
    this.crashes.delete(id);
    this.starting.delete(id);
    this.scan();
    if (this._hasActionsFor(id)) this._ensurePlugin(id);
    return this.list();
  }

  /** Called by the window wiring when an HTML plugin window closes. */
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
      this._reportError(`${meta?.name || pluginUuid} keeps closing — not restarting it.`);
      return;
    }
    setTimeout(() => {
      if (!this.stopping && this._hasActionsFor(pluginUuid)) this._ensurePlugin(pluginUuid);
    }, Math.min(30_000, 1000 * 2 ** (state.count - 1)));
  }

  // ------------------------------------------------------------ install

  unpack(source, temp) {
    execFileSync('unzip', ['-oq', source, '-d', temp], { stdio: ['ignore', 'ignore', 'pipe'] });
  }

  /** Locate the plugin root inside an unpacked package. */
  findPluginRoot(_workDir) {
    return null;
  }

  /**
   * Validate the manifest and return the destination folder and identity.
   * @returns {{ folder: string, uuid: string, name: string }}
   */
  installTarget(_root) {
    throw new Error('installTarget must be implemented');
  }

  get noPluginMessage() {
    return 'No plugin found in the package';
  }

  install(sourcePath) {
    fs.mkdirSync(this.appPluginsDir, { recursive: true });
    let workDir = sourcePath;
    let temp = null;
    try {
      if (fs.statSync(sourcePath).isFile()) {
        temp = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-'));
        try {
          this.unpack(sourcePath, temp);
        } catch (err) {
          const detail = String(err.stderr || err.message || '').trim().split('\n').filter(Boolean).pop();
          throw new Error(`Could not unpack the plugin ZIP${detail ? `: ${detail}` : ''}`);
        }
        workDir = temp;
      }
      const root = this.findPluginRoot(workDir);
      if (!root) throw new Error(this.noPluginMessage);
      const target = this.installTarget(root);
      const dest = path.join(this.appPluginsDir, target.folder);
      if (path.relative(this.appPluginsDir, dest).startsWith('..')) {
        throw new Error('Invalid plugin destination');
      }
      // Stage the copy first: a failed install must not destroy the previous
      // working copy, and selecting the installed folder itself must be safe.
      const staging = `${dest}.installing-${process.pid}-${Date.now()}`;
      try {
        fs.cpSync(root, staging, { recursive: true, force: true });
        if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
        fs.renameSync(staging, dest);
      } finally {
        if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
      }
      return { uuid: target.uuid, name: target.name, list: this.reloadOne(target.uuid) };
    } finally {
      if (temp) fs.rmSync(temp, { recursive: true, force: true });
    }
  }

  /** Copy an official (read-only) plugin into the app folder so it can be managed. */
  import(uuid) {
    const meta = this.plugins.get(uuid);
    if (!meta) throw new Error('Plugin not found');
    if (meta.writable) return { uuid, list: this.list() };
    fs.mkdirSync(this.appPluginsDir, { recursive: true });
    const dest = path.join(this.appPluginsDir, path.basename(meta.dir));
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(meta.dir, dest, { recursive: true, force: true });
    return { uuid, list: this.reloadOne(uuid) };
  }

  readOnlyMessage() {
    return 'This plugin is read-only';
  }

  remove(uuid) {
    const meta = this.plugins.get(uuid);
    if (!meta) throw new Error('Plugin not found');
    if (!meta.writable) throw new Error(this.readOnlyMessage());
    fs.rmSync(meta.dir, { recursive: true, force: true });
    return this.reloadOne(uuid);
  }

  // ------------------------------------------------------------- logging

  /** Console prefix for plugin stdout/stderr. */
  logLine(meta, line, isError) {
    const target = isError ? console.error : console.log;
    target(`[${this.label}:${meta.name}] ${line}`);
  }

  _logStream(meta, stream, kind) {
    if (!stream || typeof stream.on !== 'function') return;
    let buffer = '';
    stream.on('data', (data) => {
      buffer += data.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        const text = `${line.slice(0, 500)}${line.length > 500 ? '…' : ''}`;
        this.logLine(meta, text, kind === 'err');
        this._log(`${kind === 'err' ? 'plugin-err' : 'plugin-out'} ${meta.uuid} ${text}`);
      }
      if (buffer.length > 200_000) buffer = buffer.slice(-2000);
    });
  }

  /** Append a timestamped line to the diagnostics log, when configured. */
  _log(line) {
    if (!this.logFile) return;
    try {
      const stat = fs.existsSync(this.logFile) ? fs.statSync(this.logFile) : null;
      if (stat && stat.size > 1_000_000) {
        try { fs.renameSync(this.logFile, `${this.logFile}.1`); } catch { /* ignore */ }
      }
      fs.appendFileSync(this.logFile, `${new Date().toISOString()} ${line}\n`);
    } catch {
      /* logging must never break the host */
    }
  }

  // ------------------------------------------------------------ shutdown

  /** Graceful shutdown: SIGTERM every child, then SIGKILL whatever is left. */
  async shutdown(timeoutMs = 1500) {
    this.stopping = true;
    for (const uuid of this.htmlRunning) {
      try { this.stopHtml?.(uuid); } catch { /* ignore */ }
    }
    this.htmlRunning.clear();
    const procs = [...this.children.values(), ...this.retired];
    this.children.clear();
    this.retired.clear();
    this.starting.clear();
    this.inspectors.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    await Promise.all(
      procs.map(
        (proc) =>
          new Promise((resolve) => {
            if (!proc || proc.exitCode !== null) return resolve(undefined);
            const timer = setTimeout(() => {
              try { proc.kill('SIGKILL'); } catch { /* ignore */ }
              resolve(undefined);
            }, timeoutMs);
            proc.once('exit', () => {
              clearTimeout(timer);
              resolve(undefined);
            });
            try { proc.kill('SIGTERM'); } catch { /* ignore */ }
          })
      )
    );
  }
}

module.exports = { PluginHost, nodeRuntime };
