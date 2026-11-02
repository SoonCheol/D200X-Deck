'use strict';

const { BrowserWindow, dialog, shell } = require('electron');
const path = require('node:path');

const { PluginManager, pluginRootDirs } = require('./lib/plugins');
const { StreamDeckPlugins } = require('./lib/streamdeck-plugins');
const { openHtmlPluginWindow } = require('./lib/html-window');
const { isInside } = require('./lib/paths');
const { CH } = require('./lib/channels');

/**
 * Create and start both plugin hosts. `getWin`/`getStore`/`getDeck` are lazy
 * because the hosts start before the window is shown.
 */
function initPluginHosts({ baseDir, appVersion, send, getWin, getStore, getDeck }) {
  const htmlPluginWindows = new Map();
  const sdHtmlWindows = new Map();
  let plugins = null;
  let sdPlugins = null;

  function initPlugins() {
    const dirs = [path.join(baseDir, 'Plugins'), ...pluginRootDirs()];
    plugins = new PluginManager({ dirs, appPluginsDir: dirs[0], port: 3906, appVersion });
    plugins.on('error', (message) => {
      console.error('[plugins]', message);
      send(CH.pluginError, message);
    });
    plugins.launchHtml = (meta) => {
      if (htmlPluginWindows.has(meta.uuid)) return;
      const frame = openHtmlPluginWindow({
        codePath: meta.codePath,
        title: meta.name,
        onConsole: (event) => {
          if (event.level === 'error') console.log(`[plugin:${meta.uuid}]`, String(event.message).slice(0, 200));
        },
        onClosed: () => {
          htmlPluginWindows.delete(meta.uuid);
          plugins?.htmlExited(meta.uuid);
        },
      });
      htmlPluginWindows.set(meta.uuid, frame);
    };
    plugins.openView = (msg, action) => {
      let target = String(msg.url || '');
      if (msg.param && typeof msg.param === 'object') {
        const qs = new URLSearchParams(msg.param).toString();
        if (qs) target += (target.includes('?') ? '&' : '?') + qs;
      }
      if (!/^https?:/i.test(target) && action) {
        const file = path.resolve(action.meta.dir, target.replace(/^\.?\//, ''));
        if (!isInside(action.meta.dir, file)) return;
        const view = new BrowserWindow({
          width: 760,
          height: 680,
          title: action.meta.name || 'Plugin',
          backgroundColor: '#0b0e14',
        });
        view.loadFile(file).catch((err) => console.error('[plugin view]', err.message));
        return;
      }
      if (/^https?:|^mailto:/i.test(target)) shell.openExternal(target);
    };

    plugins.selectDialog = async (msg) => {
      const type = msg.type === 'folder' ? 'folder' : 'file';
      const filters = [];
      const extensions = [...String(msg.filter || '').matchAll(/\*\.([a-z0-9]+)/gi)].map((m) => m[1]);
      if (extensions.length) filters.push({ name: 'Supported files', extensions });
      const options = {
        title: type === 'folder' ? 'Choose a folder' : 'Choose a file',
        properties: type === 'folder' ? ['openDirectory', 'createDirectory'] : ['openFile'],
        ...(filters.length ? { filters } : {}),
      };
      const result = getWin() ? await dialog.showOpenDialog(getWin(), options) : await dialog.showOpenDialog(options);
      return result.canceled || !result.filePaths.length
        ? { canceled: true, path: '' }
        : { canceled: false, path: result.filePaths[0] };
    };

    plugins.stopHtml = (uuid) => {
      const frame = htmlPluginWindows.get(uuid);
      if (frame) {
        htmlPluginWindows.delete(uuid);
        try { frame.destroy(); } catch { /* ignore */ }
      }
    };
    plugins.scan();
    plugins.start();
    plugins.on('state', (payload) => send(CH.pluginState, payload));
    plugins.on('state-index', (payload) => send(CH.pluginStateIndex, payload));
    plugins.on('title', (payload) => send(CH.pluginTitle, payload));
    plugins.on('settings', (payload) => send(CH.pluginSettings, payload));
    plugins.on('toast', (payload) => send(CH.pluginToast, payload));
    plugins.on('alert', (payload) => send(CH.pluginAlert, payload));
    plugins.on('connected', (uuid) => console.log('[plugins] connected', uuid));
  }

  function initSdPlugins() {
    sdPlugins = new StreamDeckPlugins({
      appPluginsDir: path.join(baseDir, 'StreamDeckPlugins'),
      language: 'en',
      appVersion,
      logFile: path.join(baseDir, 'streamdeck.log'),
    });
    sdPlugins.on('error', (message) => {
      console.error('[sd-plugins]', message);
      send(CH.pluginError, message);
    });
    sdPlugins.launchHtml = (meta, info) => {
      if (sdHtmlWindows.has(meta.uuid)) return;
      const frame = openHtmlPluginWindow({
        codePath: path.join(meta.dir, meta.code.path),
        title: meta.name,
        onClosed: () => {
          sdHtmlWindows.delete(meta.uuid);
          sdPlugins?.htmlExited(meta.uuid);
        },
        onLoaded: (frame) => {
          let tries = 0;
          const connect = () => {
            if (tries++ > 100) return;
            const payload = [sdPlugins.port, meta.uuid, 'registerPlugin', info];
            frame.webContents
              .executeJavaScript(
                `(() => {
                  try {
                    if (typeof connectOpenActionSocket === 'function') return connectOpenActionSocket(${JSON.stringify(
                      payload[0]
                    )}, ${JSON.stringify(payload[1])}, ${JSON.stringify(payload[2])}, ${JSON.stringify(payload[3])}), true;
                    if (typeof connectElgatoStreamDeckSocket === 'function') return connectElgatoStreamDeckSocket(${JSON.stringify(
                      payload[0]
                    )}, ${JSON.stringify(payload[1])}, ${JSON.stringify(payload[2])}, ${JSON.stringify(payload[3])}), true;
                  } catch (err) { console.error(err); }
                  return false;
                })()`
              )
              .then((ok) => { if (!ok) setTimeout(connect, 100); })
              .catch(() => setTimeout(connect, 100));
          };
          connect();
        },
      });
      sdHtmlWindows.set(meta.uuid, frame);
    };
    sdPlugins.stopHtml = (uuid) => {
      const frame = sdHtmlWindows.get(uuid);
      if (frame) {
        sdHtmlWindows.delete(uuid);
        try { frame.destroy(); } catch { /* ignore */ }
      }
    };
    sdPlugins.scan();
    sdPlugins.start();
    sdPlugins.on('state', (payload) => send(CH.pluginState, payload));
    sdPlugins.on('state-index', (payload) => send(CH.pluginStateIndex, payload));
    sdPlugins.on('title', (payload) => send(CH.pluginTitle, payload));
    sdPlugins.on('settings', (payload) => send(CH.pluginSettings, payload));
    sdPlugins.on('alert', (payload) => send(CH.pluginAlert, payload));
    sdPlugins.on('ok', (payload) => send(CH.pluginOk, payload));
    sdPlugins.on('connected', (uuid) => console.log('[sd-plugins] connected', uuid));
    sdPlugins.on('switch-profile', (payload) => send(CH.pluginSwitchProfile, payload));
    sdPlugins.on('brightness', (payload) => {
      const value = Number(payload.value) || 0;
      const current = Number(getStore().config.settings.brightness) || 0;
      const next = Math.max(0, Math.min(100, payload.action === 'increase' ? current + value : payload.action === 'decrease' ? current - value : value));
      getStore().config.settings.brightness = next;
      getStore().save(getStore().config);
      try { getDeck()?.setBrightness(next); } catch { /* ignore */ }
      send(CH.deckBrightness, next);
    });
  }

  initPlugins();
  initSdPlugins();

  return { plugins, sdPlugins };
}

module.exports = { initPluginHosts };
