'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const execFileAsync = promisify(execFile);
const cache = new Map();

async function findIconFile(appPath) {
  const resDir = path.join(appPath, 'Contents', 'Resources');
  const infoPath = path.join(appPath, 'Contents', 'Info.plist');

  let iconName = '';
  try {
    const { stdout } = await execFileAsync(
      '/usr/bin/plutil',
      ['-convert', 'json', '-o', '-', infoPath],
      { timeout: 3000 }
    );
    const info = JSON.parse(stdout);
    iconName = String(info.CFBundleIconFile || '');
  } catch {
    /* fall through to the candidates */
  }

  const candidates = [];
  if (iconName) {
    candidates.push(path.join(resDir, iconName));
    if (!/\.icns$/i.test(iconName)) candidates.push(path.join(resDir, `${iconName}.icns`));
  }
  for (const name of ['AppIcon.icns', 'AppIconUpdated.icns', 'app.icns', 'icon.icns', 'Icon.icns']) {
    candidates.push(path.join(resDir, name));
  }
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      /* next */
    }
  }

  try {
    const entries = await fs.readdir(resDir);
    for (const entry of entries) {
      if (/\.icns$/i.test(entry)) return path.join(resDir, entry);
    }
  } catch {
    /* no resources */
  }
  return null;
}

const APP_DIRS = [
  '/Applications',
  '/System/Applications',
  '/System/Applications/Utilities',
  '/Applications/Utilities',
  '/System/Library/CoreServices',
  path.join(os.homedir(), 'Applications'),
];

/** Turn "Safari" or a path into a real .app path when possible. */
async function resolveAppPath(value) {
  const target = String(value || '').trim();
  if (!target) return null;
  if (/\.app$/i.test(target)) {
    try {
      const stat = await fs.stat(target);
      if (stat.isDirectory()) return target;
    } catch {
      /* fall through to a name lookup */
    }
  }
  const name = target.replace(/\.app$/i, '');
  const wanted = `${name}.app`.toLowerCase();
  for (const dir of APP_DIRS) {
    try {
      const entries = await fs.readdir(dir);
      const hit = entries.find((entry) => entry.toLowerCase() === wanted);
      if (hit) return path.join(dir, hit);
    } catch {
      /* directory missing */
    }
  }
  return null;
}

/** Extract an app's .icns and convert it to a 196x196 PNG data URL. */
async function appIconDataUrl(appPath) {
  if (cache.has(appPath)) return cache.get(appPath);
  let result = null;
  try {
    const icns = await findIconFile(appPath);
    if (icns) {
      const tmp = path.join(os.tmpdir(), `ulanzi-icon-${process.pid}-${Date.now()}.png`);
      await execFileAsync('/usr/bin/sips', ['-s', 'format', 'png', '-Z', '196', icns, '--out', tmp], {
        timeout: 5000,
      });
      const buffer = await fs.readFile(tmp);
      await fs.unlink(tmp).catch(() => {});
      if (buffer.length) result = `data:image/png;base64,${buffer.toString('base64')}`;
    }
  } catch {
    result = null;
  }
  cache.set(appPath, result);
  return result;
}

module.exports = { appIconDataUrl, findIconFile, resolveAppPath };
