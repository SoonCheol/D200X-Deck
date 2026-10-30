'use strict';

const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const { shell, app } = require('electron');

const { MEDIA_OPS } = require('./constants');
const MEDIA = new Set(MEDIA_OPS);
const audioPlayers = new Map(); // action key -> ChildProcess

function mediaBinary() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'mediakey')
    : path.join(__dirname, '..', 'bin', 'mediakey');
}

// Virtual key codes (US layout). Using key codes instead of keystroke matters for
// shifted combinations: keystroke "2" with shift produces "@" for many apps.
const LETTER_CODES = { a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9, b: 11, q: 12, w: 13, e: 14, r: 15, y: 16, t: 17, o: 31, u: 32, i: 34, p: 35, l: 37, j: 38, k: 40, n: 45, m: 46 };
const DIGIT_CODES = { 1: 18, 2: 19, 3: 20, 4: 21, 5: 23, 6: 22, 7: 26, 8: 28, 9: 25, 0: 29 };
const SYMBOL_CODES = { '-': 27, '=': 24, '[': 33, ']': 30, ';': 41, "'": 39, ',': 43, '.': 47, '/': 44, '`': 50, '\\': 42 };

const KEY_CODES = {
  ...LETTER_CODES,
  ...DIGIT_CODES,
  ...SYMBOL_CODES,
  return: 36, enter: 36, tab: 48, space: 49, delete: 51, escape: 53, esc: 53,
  left: 123, right: 124, down: 125, up: 126,
  home: 115, end: 119, pageup: 116, pagedown: 121,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100,
  f9: 101, f10: 109, f11: 103, f12: 111,
  numpad0: 82, numpad1: 83, numpad2: 84, numpad3: 85, numpad4: 86,
  numpad5: 87, numpad6: 88, numpad7: 89, numpad8: 91, numpad9: 92,
  numpadplus: 69, numpadminus: 78, numpadmultiply: 67, numpaddivide: 75,
  numpaddecimal: 65, numpadenter: 76, numpadclear: 71, numpadequal: 81,
};

const MODIFIERS = {
  cmd: 'command down', command: 'command down', meta: 'command down',
  ctrl: 'control down', control: 'control down',
  alt: 'option down', option: 'option down',
  shift: 'shift down',
};

/**
 * Run a shell command. Only the explicit `command` action uses a shell — every
 * other action passes argv arrays to execFile so config values can never be
 * interpreted by the shell.
 */
function runShell(command) {
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-c', String(command)], { detached: true, stdio: 'ignore' });
    child.on('error', (err) => resolve({ ok: false, error: err.message }));
    child.on('spawn', () => {
      child.unref();
      resolve({ ok: true });
    });
  });
}

function execFileResult(file, args, timeout = 10000) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout }, (err, stdout, stderr) => {
      if (!err) return resolve({ ok: true });
      const detail = String(stderr || '').trim() || err.message;
      const message = detail.split('\n').filter(Boolean).pop() || detail;
      if (/assistive access|not allowed|Accessibility/i.test(detail)) {
        return resolve({
          ok: false,
          permission: 'accessibility',
          error: 'macOS blocked the keystroke — grant Accessibility permission to Ulanzi Deck Open.',
        });
      }
      resolve({ ok: false, error: message });
    });
  });
}

function applescript(script) {
  return execFileResult('/usr/bin/osascript', ['-e', script]);
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
    return execFileResult('/usr/bin/xdotool', ['key', comboName]);
  }
  return { ok: false, error: 'hotkeys are only implemented on macOS/Linux' };
}

const SAFE_SCHEMES = /^(https?:|mailto:)/i;

async function openUrl(value) {
  const target = String(value || '').trim();
  if (!target) return { ok: false, error: 'empty URL' };
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(target);
  if (hasScheme && !SAFE_SCHEMES.test(target)) {
    return { ok: false, error: 'unsupported URL scheme' };
  }
  const url = hasScheme ? target : `https://${target}`;
  await shell.openExternal(url);
  return { ok: true };
}

async function openApp(value) {
  const target = String(value || '').trim();
  if (!target) return { ok: false, error: 'empty app' };
  if (process.platform === 'darwin') {
    const byName = await execFileResult('/usr/bin/open', ['-a', target]);
    if (byName.ok) return byName;
    return execFileResult('/usr/bin/open', [target]);
  }
  if (process.platform === 'win32') {
    return execFileResult('cmd', ['/c', 'start', '', target]);
  }
  return execFileResult('/usr/bin/xdg-open', [target]);
}

async function openTarget(value) {
  const target = String(value || '').trim();
  if (!target) return { ok: false, error: 'empty target' };
  if (/^(https?:|mailto:)/i.test(target)) return openUrl(target);
  return openApp(target);
}

async function typeText(value, enter = false) {
  const text = String(value ?? '');
  if (!text && !enter) return { ok: false, error: 'empty text' };
  const parts = [];
  if (text) parts.push(`keystroke ${JSON.stringify(text)}`);
  if (enter) parts.push('key code 36');
  return applescript(`tell application "System Events" to ${parts.join('\n')}`);
}

async function closeApp(value) {
  const name = String(value || '').trim();
  if (!name) return { ok: false, error: 'empty app name' };
  return applescript(`tell application ${JSON.stringify(name)} to quit`);
}

function playSound(action, id = 'default') {
  const file = String(action.value || '').trim();
  if (!file) return { ok: false, error: 'no audio file' };
  if (!require('node:fs').existsSync(file)) return { ok: false, error: 'audio file not found' };
  try {
    const previous = audioPlayers.get(id);
    if (previous) {
      try { previous.kill(); } catch { /* ignore */ }
    }
    const volume = Math.min(1, Math.max(0, Number(action.volume) || 1));
    const child = spawn('/usr/bin/afplay', ['-v', String(volume), file], { stdio: 'ignore' });
    audioPlayers.set(id, child);
    child.on('exit', () => {
      if (audioPlayers.get(id) === child) audioPlayers.delete(id);
    });
    child.on('error', () => audioPlayers.delete(id));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function stopSound(id = 'default') {
  const child = audioPlayers.get(id);
  if (!child) return { ok: true };
  try { child.kill(); } catch { /* ignore */ }
  audioPlayers.delete(id);
  return { ok: true };
}

function mediaKey(op) {
  return new Promise((resolve) => {
    if (!MEDIA.has(op)) return resolve({ ok: false, error: `unknown media key: ${op}` });
    const child = spawn(mediaBinary(), [op], { stdio: 'ignore' });
    child.on('error', (err) => resolve({ ok: false, error: err.message }));
    child.on('exit', (code) => resolve({ ok: code === 0, error: code ? `mediakey exited ${code}` : undefined }));
  });
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
      return runShell(action.value);
    case 'hotkey':
      return runHotkey(action.value);
    case 'text':
      return typeText(action.value, Boolean(action.enter));
    case 'media':
      return mediaKey(action.op);
    case 'close':
      return closeApp(action.value);
    case 'sound':
      return action.op === 'stop' ? stopSound(action.value || 'default') : playSound(action, action.value || 'default');
    default:
      return { ok: false, error: `unknown action type: ${action.type}` };
  }
}

module.exports = { execute, runHotkey, openTarget, openApp, openUrl };
