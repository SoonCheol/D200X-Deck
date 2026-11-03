'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { StreamDeckPlugins } = require('../lib/streamdeck-plugins');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-sd-test-'));
}

function writePlugin(root, name = 'com.test.sdPlugin') {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      Name: 'SD Test',
      Author: 'Test',
      Version: '1.2.3',
      Category: 'Test',
      CodePath: 'plugin.js',
      OS: [{ Platform: 'mac' }],
      Actions: [
        {
          Name: 'Test Action',
          UUID: 'com.test.action',
          Icon: 'icon.svg',
          States: [{ Image: 'icon.svg' }, { Image: 'icon.svg' }],
          Controllers: ['Keypad'],
          PropertyInspectorPath: 'pi.html',
        },
      ],
    })
  );
  fs.writeFileSync(path.join(dir, 'plugin.js'), 'process.exit(0);\n');
  fs.writeFileSync(path.join(dir, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.writeFileSync(path.join(dir, 'pi.html'), '<html></html>');
  return dir;
}

test('scans and installs Stream Deck plugins', async () => {
  const appDir = tempDir();
  const source = tempDir();
  const pluginDir = writePlugin(source);

  const host = new StreamDeckPlugins({ appPluginsDir: appDir });
  host.dirs = [appDir, source];
  const list = host.scan();
  assert.equal(list.length, 1);
  assert.equal(list[0].sdk, 'streamdeck');
  assert.equal(list[0].name, 'SD Test');
  assert.equal(list[0].compatible, true);
  assert.equal(list[0].actions[0].uuid, 'com.test.action');
  assert.equal(list[0].actions[0].states.length, 2);

  const installed = await host.install(pluginDir);
  assert.equal(installed.uuid, 'com.test.sdPlugin');
  assert.equal(host.list().length, 1);
  assert.equal(host.list()[0].writable, true);
  assert.ok(fs.existsSync(path.join(appDir, 'com.test.sdPlugin', 'manifest.json')));
});

test('rejects a DRM-protected Stream Deck manifest with a clear message', async () => {
  const appDir = tempDir();
  const source = tempDir();
  const pluginDir = writePlugin(source);
  fs.writeFileSync(path.join(pluginDir, 'manifest.json'), 'ELGATO\x01\x00encrypted');
  const host = new StreamDeckPlugins({ appPluginsDir: appDir });

  await assert.rejects(host.install(pluginDir), /DRM-protected by Elgato Marketplace/);
});

test('launches a plugin once when several actions sync before the port resolves', async () => {
  const appDir = tempDir();
  const source = tempDir();
  writePlugin(source);

  const host = new StreamDeckPlugins({ appPluginsDir: appDir });
  host.dirs = [appDir, source];
  const [plugin] = host.scan();

  const spawned = [];
  host.spawn = () => {
    spawned.push(plugin.uuid);
    return { on() {}, kill() {}, exitCode: null, stdout: null, stderr: null };
  };
  host._portPromise = Promise.resolve(57116);

  host._ensurePlugin(plugin.uuid);
  host._ensurePlugin(plugin.uuid);
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(spawned.length, 1, 'the plugin must not be launched twice');
  assert.equal(host.starting.size, 0, 'the reservation must be released after launch');
});

test('marks Intel-only plugins that need Rosetta', { skip: process.arch !== 'arm64' }, () => {
  const appDir = tempDir();
  const source = tempDir();
  const dir = path.join(source, 'com.intel.sdPlugin');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      Name: 'Intel Only',
      Version: '1.0.0',
      CodePathMac: 'bin',
      OS: [{ Platform: 'mac' }],
      Actions: [{ Name: 'Run', UUID: 'com.intel.action', States: [{}] }],
    })
  );
  // Thin 64-bit Mach-O header for x86_64 (magic + cputype).
  const header = Buffer.alloc(8);
  header.writeUInt32BE(0xfeedfacf, 0);
  header.writeUInt32BE(0x01000007, 4);
  fs.writeFileSync(path.join(dir, 'bin'), header);

  const host = new StreamDeckPlugins({ appPluginsDir: appDir });
  host.dirs = [appDir, source];
  host.rosettaAvailable = () => false;
  const [plugin] = host.scan();
  assert.equal(plugin.compatible, false);
  assert.equal(plugin.compatReason, 'Needs Rosetta');
  assert.equal(plugin.actions.length, 1);
});

test('an empty setImage restores the manifest default image', () => {
  const host = new StreamDeckPlugins({ appPluginsDir: tempDir() });
  const actionid = 'ctx-default';
  host.actions.set(actionid, {
    actionid,
    pluginUuid: 'com.test.sdPlugin',
    actionUuid: 'com.test.action',
    key: '0_0',
    settings: {},
    active: true,
    meta: { dir: tempDir(), uuid: 'com.test.sdPlugin' },
    actionMeta: { states: [{ image: 'default.png' }, { image: 'other.png' }] },
    state: 0,
    image: 'default.png',
    images: new Map([[0, 'default.png'], [1, 'other.png']]),
    defaultImages: new Map([[0, 'default.png'], [1, 'other.png']]),
    titles: new Map(),
  });
  const states = [];
  host.on('state', (payload) => states.push(payload));

  // A custom image is stored for the state.
  host._onPluginMessage('com.test.sdPlugin', {
    event: 'setImage',
    context: actionid,
    payload: { image: 'data:image/png;base64,AAAA' },
  });
  assert.equal(host.actions.get(actionid).images.get(0), 'data:image/png;base64,AAAA');

  // An empty image means "back to the manifest default", not "no image".
  host._onPluginMessage('com.test.sdPlugin', {
    event: 'setImage',
    context: actionid,
    payload: { image: '' },
  });
  assert.equal(host.actions.get(actionid).images.get(0), 'default.png');
  assert.equal(states.at(-1).image, 'default.png');
});
