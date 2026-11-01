'use strict';

const { BrowserWindow } = require('electron');

/**
 * Open the hidden window that runs an HTML plugin's own JavaScript. Both
 * plugin hosts use the same shell; only the post-load hook differs.
 */
function openHtmlPluginWindow({ codePath, title, onConsole, onLoaded, onClosed }) {
  const frame = new BrowserWindow({
    show: false,
    width: 420,
    height: 320,
    ...(title ? { title } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  if (onConsole) frame.webContents.on('console-message', onConsole);
  frame.on('closed', () => onClosed?.());
  frame
    .loadFile(codePath)
    .then(() => onLoaded?.(frame))
    .catch((err) => {
      console.error(`[plugin] could not load ${codePath}:`, err.message);
      try {
        frame.close();
      } catch {
        /* already gone */
      }
    });
  return frame;
}

module.exports = { openHtmlPluginWindow };
