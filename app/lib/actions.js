'use strict';

const { spawn } = require('node:child_process');
const { shell } = require('electron');

const KEY_CODES = {
  return: 36, enter: 36, tab: 48, space: 49, delete: 51, escape: 53, esc: 53,
  left: 123, right: 124, down: 125, up: 126,
  home: 115, end: 119, pageup: 116, pagedown: 121,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100,
  f9: 101, f10: 109, f11: 103, f12: 111,
};

const MODIFIERS = {
  cmd: 'command down', command: 'command down', meta: 'command down',
  ctrl: 'control down', control: 'control down',
  alt: 'option down', option: 'option down',
  shift: 'shift down',
};

function run(command, timeout = 0) {
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-c', command], { detached: true, stdio: 'ignore' });
    let done = false;
    const finish = (ok, error) => {
      if (done) return;
      done = true;
      resolve({ ok, error });
    };
    child.on('error', (err) => finish(false, err.message));
    child.on('spawn', () => {
      child.unref();
      finish(true);
    });
    if (timeout) setTimeout(() => finish(true), timeout);
  });
}

function applescript(script) {
  return run(`osascript -e ${JSON.stringify(script)}`);
}

async function runHotkey(combo) {
  const parts = String(combo || '')
    .toLowerCase()
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return { ok: false, error: 'empty hotkey' };
  const keyName = parts.pop();
  const mods = parts.map((m) => MODIFIERS[m]).filter(Boolean);

  if (process.platform === 'darwin') {
    const using = mods.length ? ` using {${mods.join(', ')}}` : '';
    if (KEY_CODES[keyName] !== undefined) {
      return applescript(`tell application "System Events" to key code ${KEY_CODES[keyName]}${using}`);
    }
    const ch = keyName === 'plus' ? '+' : keyName;
    return applescript(`tell application "System Events" to keystroke ${JSON.stringify(ch)}${using}`);
  }
  if (process.platform === 'linux') {
    const comboName = [...parts, keyName].join('+');
    return run(`xdotool key ${JSON.stringify(comboName)}`);
  }
  return { ok: false, error: 'hotkeys are only implemented on macOS/Linux' };
}

async function openUrl(value) {
  const target = String(value || '').trim();
  if (!target) return { ok: false, error: 'empty URL' };
  const url = /^(https?:|mailto:|file:)/i.test(target) ? target : `https://${target}`;
  await shell.openExternal(url);
  return { ok: true };
}

async function openApp(value) {
  const target = String(value || '').trim();
  if (!target) return { ok: false, error: 'empty app' };
  if (process.platform === 'darwin') {
    return run(`open -a ${JSON.stringify(target)} 2>/dev/null || open ${JSON.stringify(target)}`);
  }
  if (process.platform === 'win32') {
    return run(`start "" ${JSON.stringify(target)}`);
  }
  return run(`xdg-open ${JSON.stringify(target)}`);
}

async function openTarget(value) {
  const target = String(value || '').trim();
  if (!target) return { ok: false, error: 'empty target' };
  if (/^(https?:|mailto:)/i.test(target)) return openUrl(target);
  return openApp(target);
}

/**
 * Execute a key action.
 * Page actions are handled by the renderer (it owns navigation).
 */
async function execute(action) {
  if (!action || !action.type || action.type === 'none') return { ok: true };
  switch (action.type) {
    case 'app':
      return openApp(action.value);
    case 'url':
      return openUrl(action.value);
    case 'open':
      // legacy configs
      return openTarget(action.value);
    case 'command':
      return run(action.value);
    case 'hotkey':
      return runHotkey(action.value);
    default:
      return { ok: false, error: `unknown action type: ${action.type}` };
  }
}

module.exports = { execute, runHotkey, openTarget, openApp, openUrl };
