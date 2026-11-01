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

test('scans and installs Stream Deck plugins', () => {
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

  const installed = host.install(pluginDir);
  assert.equal(installed.uuid, 'com.test.sdPlugin');
  assert.equal(host.list().length, 1);
  assert.equal(host.list()[0].writable, true);
  assert.ok(fs.existsSync(path.join(appDir, 'com.test.sdPlugin', 'manifest.json')));
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
