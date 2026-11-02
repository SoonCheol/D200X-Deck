'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isInside } = require('./paths');
const { byExtension } = require('./mime');
const { PluginHost, nodeRuntime } = require('./plugin-host');

const os = require('node:os');

function fileToDataUrl(file) {
  try {
    const ext = path.extname(file).toLowerCase();
    const mime = byExtension(ext);
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

class PluginManager extends PluginHost {
  constructor({ dirs = pluginRootDirs(), appPluginsDir = null, port = 3906, language = 'en-US', appVersion = '0.1.0' } = {}) {
    super({ dirs, appPluginsDir, port, language, appVersion, label: 'plugins' });
  }

  // ------------------------------------------------------------- hooks

  isPluginDir(entry) {
    return entry.isDirectory() && entry.name.endsWith('.ulanziPlugin');
  }

  readPlugin(dir, root) {
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const uuid = manifest.UUID || path.basename(dir).replace(/\.ulanziPlugin$/, '');
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
    return {
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
    };
  }

  isHtml(meta) {
    return Boolean(meta?.html);
  }

  executableFor(meta) {
    return meta.codePath;
  }

  spawnCommand(meta, executable, port) {
    return {
      command: nodeRuntime(),
      args: [executable, '127.0.0.1', String(port), this.language, this.appVersion],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    };
  }

  readOnlyMessage() {
    return 'This plugin is read-only (installed by Ulanzi Studio)';
  }

  get noPluginMessage() {
    return 'No manifest.json found in the plugin package';
  }

  findPluginRoot(workDir) {
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
    return findManifest(workDir);
  }

  installTarget(root) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    const uuid = String(manifest.UUID || '').trim();
    if (!uuid) throw new Error('manifest.json has no UUID');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(uuid)) {
      throw new Error('manifest.json has an invalid UUID');
    }
    return { folder: `${uuid}.ulanziPlugin`, uuid, name: manifest.Name || uuid };
  }
  // ------------------------------------------------------------- discovery

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
        this._noteConnected(pluginUuid);
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

  // --------------------------------------------------------------- process

  // --------------------------------------------------------------- actions

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


}

module.exports = { PluginManager, pluginRootDirs, nodeRuntime };
