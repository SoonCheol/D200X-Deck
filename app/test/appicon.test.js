'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { promisify } = require('node:util');

function tempApp(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-appicon-test-'));
  const app = path.join(root, 'Demo.app');
  fs.mkdirSync(path.join(app, 'Contents', 'Resources'), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return app;
}

function loadAppicon(t, execImpl) {
  execImpl[promisify.custom] = (file, args, options) =>
    new Promise((resolve, reject) => {
      execImpl(file, args, options, (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve({ stdout, stderr });
      });
    });
  const original = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'node:child_process') return { execFile: execImpl };
    return original.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../lib/appicon')];
    return require('../lib/appicon');
  } finally {
    Module._load = original;
  }
}

test('findIconFile prefers the Info.plist icon and falls back to AppIcon', async (t) => {
  const app = tempApp(t);
  fs.writeFileSync(path.join(app, 'Contents', 'Resources', 'AppIcon.icns'), 'icns');
  fs.writeFileSync(path.join(app, 'Contents', 'Resources', 'Custom.icns'), 'custom');
  fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), 'plist');
  const appicon = loadAppicon(t, (_file, args, _options, callback) => {
    if (String(args[0]).includes('Info.plist') || args[0] === '-convert') {
      callback(null, JSON.stringify({ CFBundleIconFile: 'Custom' }));
    } else {
      callback(null, '');
    }
  });

  assert.equal(await appicon.findIconFile(app), path.join(app, 'Contents', 'Resources', 'Custom.icns'));

  const noPlist = tempApp(t);
  fs.writeFileSync(path.join(noPlist, 'Contents', 'Resources', 'AppIcon.icns'), 'icns');
  const fallback = loadAppicon(t, (_file, _args, _options, callback) => callback(new Error('no plist')));
  assert.equal(
    await fallback.findIconFile(noPlist),
    path.join(noPlist, 'Contents', 'Resources', 'AppIcon.icns')
  );
});

test('resolveAppPath accepts an existing bundle and rejects an empty name', async (t) => {
  const app = tempApp(t);
  const appicon = loadAppicon(t, () => {});

  assert.equal(await appicon.resolveAppPath(app), app);
  assert.equal(await appicon.resolveAppPath(''), null);
  assert.equal(await appicon.resolveAppPath(path.join(app, 'missing.app')), null);
});

test('appIconDataUrl converts through sips and caches the result', async (t) => {
  const app = tempApp(t);
  const icns = path.join(app, 'Contents', 'Resources', 'AppIcon.icns');
  fs.writeFileSync(icns, 'icns');
  let sips = 0;
  const appicon = loadAppicon(t, (_file, args, _options, callback) => {
    if (args.includes('--out')) {
      sips += 1;
      const destination = args[args.indexOf('--out') + 1];
      fs.writeFileSync(destination, Buffer.from('png'));
    }
    callback(null, '');
  });

  const first = await appicon.appIconDataUrl(app);
  const second = await appicon.appIconDataUrl(app);

  assert.equal(first, 'data:image/png;base64,cG5n');
  assert.equal(second, first);
  assert.equal(sips, 1, 'the icon is cached');
});
