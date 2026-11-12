'use strict';

const { execFile } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'windows-apps.ps1');

function run(mode, timeout) {
  return new Promise((resolve) => {
    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', SCRIPT, '-Mode', mode,
    ], { windowsHide: true, timeout, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve(null);
      try { resolve(JSON.parse(stdout.trim())); } catch { resolve(null); }
    });
  });
}

let cachedApps = [];
let appsCachedAt = 0;
let appsPending = null;

/** Start Menu shortcuts only; no destructive registry or file scanning. */
async function listWindowsApps() {
  if (Date.now() - appsCachedAt < 60_000) return cachedApps;
  if (appsPending) return appsPending;
  appsPending = run('list', 15_000).then((data) => {
    if (data !== null) {
      cachedApps = (Array.isArray(data) ? data : [data]).filter(
        (entry) => entry && typeof entry.name === 'string' && typeof entry.path === 'string'
      );
      appsCachedAt = Date.now();
    }
    return cachedApps;
  }).finally(() => { appsPending = null; });
  return appsPending;
}

async function frontmostWindowsApp() {
  const result = await run('frontmost', 10_000);
  return result && typeof result.name === 'string' ? result : null;
}

module.exports = { listWindowsApps, frontmostWindowsApp };
