'use strict';

const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const electron = require('electron');
const { shell, app, dialog, BrowserWindow } = electron;
const { schemeOf, hasControlCharacters, isBlockedScheme, isKnownScheme } = require('./url-safety');

const { MEDIA_OPS } = require('./constants');
const MEDIA = new Set(MEDIA_OPS);
const audioPlayers = new Map(); // action key -> ChildProcess

function helperBinary(name) {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin', name)
    : path.join(__dirname, '..', 'bin', name);
}

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
let shellErrorHandler = null;

/** Report non-zero exits from `Run command` without blocking the key press. */
function setShellErrorHandler(handler) {
  shellErrorHandler = typeof handler === 'function' ? handler : null;
}

function runShell(command, meta = null) {
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-c', String(command)], {
      detached: true,
      // A background child inherits these handles, so stdout goes to /dev/null
      // and stderr is closed as soon as the shell exits.
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr = (stderr + data.toString()).slice(-4000);
    });
    child.on('error', (err) => resolve({ ok: false, error: err.message }));
    child.on('spawn', () => {
      child.unref();
      resolve({ ok: true });
    });
    child.on('exit', (code, signal) => {
      stderr = stderr.trim();
      child.stderr.destroy();
      if (code === 0) return;
      const detail = stderr.split('\n').filter(Boolean).pop() || '';
      const reason = detail || (signal ? `killed by ${signal}` : `exited with code ${code}`);
      if (shellErrorHandler) shellErrorHandler(reason, meta, stderr);
    });
  });
}

/**
 * Turn a command's stdout into a key face: text, a data URL, raw SVG, or a
 * path to an image file. Kept separate so the parsing rules are testable
 * without starting a process.
 */
function parseCommandOutput(value) {
  const text = String(value || '').trim();
  if (!text) return { ok: true, text: '' };
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(text)) return { ok: true, image: text };
  if (/^<svg[\s>]/i.test(text)) {
    return {
      ok: true,
      image: `data:image/svg+xml;base64,${Buffer.from(text).toString('base64')}`,
    };
  }
  const file = text.split(/\r?\n/)[0].trim();
  const mime = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  }[path.extname(file).toLowerCase()];
  if (mime && fs.existsSync(file)) {
    try {
      const stat = fs.statSync(file);
      if (stat.isFile() && stat.size <= 512 * 1024) {
        const image = fs.readFileSync(file);
        return { ok: true, image: `data:${mime};base64,${image.toString('base64')}` };
      }
    } catch {
      /* fall through to text */
    }
  }
  return { ok: true, text: text.replace(/\s+/g, ' ').slice(0, 120) };
}

const COMMAND_OUTPUT_MAX = 256 * 1024;
const COMMAND_STDERR_KEEP = 4000;

/**
 * Run a shell command for a key that displays its output. The shell leads its
 * own process group, so a timeout or the output cap kills pipelines and `;`
 * lists too; killing only `/bin/sh` would leave their children on PID 1.
 */
function runCommandOutput(command, { timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('/bin/sh', ['-c', String(command)], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      return resolve({ ok: false, error: err.message });
    }

    let settled = false;
    let timedOut = false;
    let overflow = false;
    const chunks = [];
    let bytes = 0;
    let stderr = Buffer.alloc(0);

    const stop = () => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }
    };
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeout);

    child.stdout.on('data', (chunk) => {
      if (overflow) return;
      bytes += chunk.length;
      if (bytes > COMMAND_OUTPUT_MAX) {
        overflow = true;
        const keep = chunk.length - (bytes - COMMAND_OUTPUT_MAX);
        if (keep > 0) chunks.push(chunk.subarray(0, keep));
        stop();
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = Buffer.concat([stderr, chunk]);
      if (stderr.length > COMMAND_STDERR_KEEP) {
        stderr = stderr.subarray(stderr.length - COMMAND_STDERR_KEEP);
      }
    });
    child.on('error', (err) => finish({ ok: false, error: err.message }));
    child.on('close', (code, signal) => {
      if (timedOut) return finish({ ok: false, error: 'command timed out' });
      if (overflow) {
        return finish({ ok: false, error: `command output exceeded ${COMMAND_OUTPUT_MAX / 1024} KB` });
      }
      if (code !== 0) {
        const detail = stderr.toString('utf8').trim();
        const last = detail.split('\n').filter(Boolean).pop();
        return finish({
          ok: false,
          error: last || (signal ? `killed by ${signal}` : 'command failed'),
        });
      }
      finish(parseCommandOutput(Buffer.concat(chunks).toString('utf8')));
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

// After an ad-hoc update macOS can keep the Accessibility entry switched on but
// drop the native helpers' events without any error, so check before posting.
function accessibilityBlocked() {
  try {
    return (
      process.platform === 'darwin' && electron.systemPreferences?.isTrustedAccessibilityClient(false) === false
    );
  } catch {
    return false;
  }
}

const ACCESSIBILITY_STALE = {
  ok: false,
  permission: 'accessibility',
  error:
    'Accessibility is not granted to this build. Remove Ulanzi Deck Open in Device Control and Data Access, then add it again.',
};

function applescript(script) {
  return execFileResult('/usr/bin/osascript', ['-e', script]);
}

/** Windows input via a checked-in, argv-only PowerShell/Win32 bridge. */
function windowsInput(mode, value, enter = false) {
  const args = [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(__dirname, 'windows-input.ps1'),
    '-Mode', mode,
    '-PayloadBase64', Buffer.from(String(value), 'utf8').toString('base64'),
  ];
  if (enter) args.push('-Enter');
  return execFileResult('powershell.exe', args, 15000);
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
      // Post at HID level first: screen-capture and other tools ignore
      // System Events keystrokes.
      const helper = helperBinary('hotkey');
      if (require('node:fs').existsSync(helper)) {
        if (accessibilityBlocked()) return { ...ACCESSIBILITY_STALE };
        const flags = [];
        if (parts.includes('cmd') || parts.includes('command') || parts.includes('meta')) flags.push('cmd');
        if (parts.includes('shift')) flags.push('shift');
        if (parts.includes('alt') || parts.includes('option')) flags.push('alt');
        if (parts.includes('ctrl') || parts.includes('control')) flags.push('ctrl');
        return execFileResult(helper, [String(KEY_CODES[keyName]), ...flags]);
      }
      return applescript(`tell application "System Events" to key code ${KEY_CODES[keyName]}${using}`);
    }
    const ch = keyName === 'plus' ? '+' : keyName;
    return applescript(`tell application "System Events" to keystroke ${JSON.stringify(ch)}${using}`);
  }
  if (process.platform === 'linux') {
    const comboName = [...parts, keyName].join('+');
    return execFileResult('/usr/bin/xdotool', ['key', comboName]);
  }
  if (process.platform === 'win32') {
    return windowsInput('hotkey', parts.concat(keyName).join('+'));
  }
  return { ok: false, error: 'hotkeys unsupported on this platform' };
}

// Custom app schemes (slack://, zoommtg://, linear://) are useful. Known ones
// open directly; anything else asks once per app session. Local files and
// script schemes never reach the OS handler.
const approvedSchemes = new Set();

function askToOpenScheme(scheme, url) {
  if (!dialog?.showMessageBox) return Promise.resolve(false);
  const win = BrowserWindow?.getAllWindows?.().find((candidate) => !candidate.isDestroyed()) || null;
  try {
    if (win) {
      if (!win.isVisible()) win.show();
      win.focus();
    }
    app.focus({ steal: true });
  } catch {
    /* focus is best-effort */
  }
  /** @type {import('electron').MessageBoxOptions} */
  const options = {
    type: 'question',
    buttons: ['Cancel', 'Open'],
    defaultId: 0,
    cancelId: 0,
    message: `Open a “${scheme}” link?`,
    detail: `${url}\n\nThis launches another app. Only continue if you trust this link.`,
  };
  return (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options))
    .then((result) => result.response === 1)
    .catch(() => false);
}

async function openUrl(value, { confirmScheme = askToOpenScheme } = {}) {
  const target = String(value || '').trim();
  if (!target) return { ok: false, error: 'empty URL' };
  if (hasControlCharacters(target)) return { ok: false, error: 'unsupported URL scheme' };
  const scheme = schemeOf(target);
  if (scheme && isBlockedScheme(scheme)) {
    return { ok: false, error: 'unsupported URL scheme' };
  }
  if (scheme && !isKnownScheme(scheme) && !approvedSchemes.has(scheme)) {
    if (!(await confirmScheme(scheme, target))) {
      return { ok: false, error: 'URL scheme not approved' };
    }
    approvedSchemes.add(scheme);
  }
  const url = scheme ? target : `https://${target}`;
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
    // Electron launches the selected executable/file without cmd.exe quoting or injection.
    const error = await shell.openPath(target);
    return error ? { ok: false, error } : { ok: true };
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
  // The helper posts Unicode, so emoji work; System Events keystroke types "a" for them.
  const helper = helperBinary('hotkey');
  if (process.platform === 'darwin' && require('node:fs').existsSync(helper)) {
    if (accessibilityBlocked()) return { ...ACCESSIBILITY_STALE };
    return execFileResult(helper, text ? ['text', text, ...(enter ? ['enter'] : [])] : ['36']);
  }
  if (process.platform === 'win32') {
    if (!text && enter) return windowsInput('hotkey', 'enter');
    return windowsInput('text', text, enter);
  }
  const parts = [];
  if (text) parts.push(`keystroke ${JSON.stringify(text)}`);
  if (enter) parts.push('key code 36');
  return applescript(`tell application "System Events" to ${parts.join('\n')}`);
}

async function closeApp(value) {
  const name = String(value || '').trim();
  if (!name) return { ok: false, error: 'empty app name' };
  if (process.platform === 'win32') {
    // A graceful request only: never force-kill apps with unsaved documents.
    const base = path.win32.basename(name);
    if (!/^[\w .()-]+\.exe$/i.test(base)) {
      return { ok: false, error: 'Windows close requires an executable name ending in .exe' };
    }
    return execFileResult('taskkill.exe', ['/IM', base]);
  }
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
    const rawVolume = Number(action.volume);
    const volume = Number.isFinite(rawVolume) ? Math.min(1, Math.max(0, rawVolume)) : 1;
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
  if (!MEDIA.has(op)) return Promise.resolve({ ok: false, error: `unknown media key: ${op}` });
  if (process.platform === 'win32') return windowsInput('hotkey', op);
  return new Promise((resolve) => {
    // Native helper mirrors Ulanzi Studio's MediaKeysBridge (prime the event
    // queue, key-down, key-up with no gap). See native/mediakey.m.
    const child = spawn(mediaBinary(), [op], { stdio: 'ignore' });
    child.on('error', (err) => resolve({ ok: false, error: err.message }));
    child.on('exit', (code) => resolve({ ok: code === 0, error: code ? `mediakey exited ${code}` : undefined }));
  });
}

/**
 * Execute a key action.
 * Page actions are handled by the renderer (it owns navigation).
 */
async function execute(action, meta = null) {
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
      return runShell(action.value, meta);
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

module.exports = {
  execute,
  runHotkey,
  openTarget,
  openApp,
  openUrl,
  runCommandOutput,
  parseCommandOutput,
  setShellErrorHandler,
};
