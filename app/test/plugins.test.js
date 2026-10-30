'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { PluginManager } = require('../lib/plugins');

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-plugin-test-'));
  const plugins = path.join(root, 'Plugins');
  fs.mkdirSync(plugins, { recursive: true });
  return { root, plugins };
}

function writePlugin(dir, manifest) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, 'app.js'), '// test plugin\n');
  return dir;
}

test('install copies a valid plugin folder', () => {
  const { root, plugins } = workspace();
  const source = writePlugin(path.join(root, 'src', 'Demo.ulanziPlugin'), {
    UUID: 'com.example.demo',
    Name: 'Demo',
    Actions: [{ UUID: 'com.example.demo.action', Name: 'Run' }],
  });
  const manager = new PluginManager({ dirs: [plugins], appPluginsDir: plugins });
  const out = manager.install(source);
  assert.equal(out.uuid, 'com.example.demo');
  assert.ok(fs.existsSync(path.join(plugins, 'com.example.demo.ulanziPlugin', 'app.js')));
});

test('install rejects a UUID that would escape the plugins folder', () => {
  const { root, plugins } = workspace();
  const source = writePlugin(path.join(root, 'src', 'Evil.ulanziPlugin'), {
    UUID: '../../../../tmp/evil',
    Name: 'Evil',
    Actions: [],
  });
  const manager = new PluginManager({ dirs: [plugins], appPluginsDir: plugins });
  assert.throws(() => manager.install(source), /invalid UUID/i);
  assert.equal(fs.existsSync('/tmp/evil.ulanziPlugin'), false);
});

test('install rejects a package without a manifest', () => {
  const { root, plugins } = workspace();
  const empty = path.join(root, 'empty');
  fs.mkdirSync(empty, { recursive: true });
  const manager = new PluginManager({ dirs: [plugins], appPluginsDir: plugins });
  assert.throws(() => manager.install(empty), /manifest/i);
});
