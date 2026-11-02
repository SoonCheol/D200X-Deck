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

test('install copies a valid plugin folder', async () => {
  const { root, plugins } = workspace();
  const source = writePlugin(path.join(root, 'src', 'Demo.ulanziPlugin'), {
    UUID: 'com.example.demo',
    Name: 'Demo',
    Actions: [{ UUID: 'com.example.demo.action', Name: 'Run' }],
  });
  const manager = new PluginManager({ dirs: [plugins], appPluginsDir: plugins });
  const out = await manager.install(source);
  assert.equal(out.uuid, 'com.example.demo');
  assert.ok(fs.existsSync(path.join(plugins, 'com.example.demo.ulanziPlugin', 'app.js')));
});

test('install rejects a UUID that would escape the plugins folder', async () => {
  const { root, plugins } = workspace();
  const source = writePlugin(path.join(root, 'src', 'Evil.ulanziPlugin'), {
    UUID: '../../../../tmp/evil',
    Name: 'Evil',
    Actions: [],
  });
  const manager = new PluginManager({ dirs: [plugins], appPluginsDir: plugins });
  await assert.rejects(manager.install(source), /invalid UUID/i);
  assert.equal(fs.existsSync('/tmp/evil.ulanziPlugin'), false);
});

test('install rejects a package without a manifest', async () => {
  const { root, plugins } = workspace();
  const empty = path.join(root, 'empty');
  fs.mkdirSync(empty, { recursive: true });
  const manager = new PluginManager({ dirs: [plugins], appPluginsDir: plugins });
  await assert.rejects(manager.install(empty), /manifest/i);
});

test('selectdialog replies to the action with the chosen path', async () => {
  const { plugins } = workspace();
  const manager = new PluginManager({ dirs: [plugins], appPluginsDir: plugins });
  const sent = [];
  manager._send = (_uuid, msg) => sent.push(msg);
  manager.actions.set('action-1', {
    actionid: 'action-1',
    pluginUuid: 'com.example.demo',
    actionUuid: 'com.example.demo.action',
    key: '0_0',
    settings: {},
  });
  manager.selectDialog = async () => ({ canceled: false, path: '/tmp/picked.png' });
  manager._onPluginMessage({ cmd: 'selectdialog', actionid: 'action-1', type: 'file' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const reply = sent.find((msg) => msg.cmd === 'selectdialog');
  assert.ok(reply);
  assert.equal(reply.path, '/tmp/picked.png');
  assert.equal(reply.uuid, 'com.example.demo.action');
  assert.equal(reply.key, '0_0');
});

test('selectdialog reports cancellation', async () => {
  const { plugins } = workspace();
  const manager = new PluginManager({ dirs: [plugins], appPluginsDir: plugins });
  const sent = [];
  manager._send = (_uuid, msg) => sent.push(msg);
  manager.actions.set('action-2', {
    actionid: 'action-2',
    pluginUuid: 'com.example.demo',
    actionUuid: 'com.example.demo.action',
    key: '1_0',
    settings: {},
  });
  manager.selectDialog = async () => ({ canceled: true, path: '' });
  manager._onPluginMessage({ cmd: 'selectdialog', actionid: 'action-2', type: 'folder' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const reply = sent.find((msg) => msg.cmd === 'selectdialog');
  assert.equal(reply.canceled, true);
});

test('replayed actions use the action UUID, not the plugin UUID', () => {
  const { plugins } = workspace();
  const manager = new PluginManager({ dirs: [plugins], appPluginsDir: plugins });
  const sent = [];
  manager._send = (_uuid, msg) => sent.push(msg);
  manager.actions.set('action-3', {
    actionid: 'action-3',
    pluginUuid: 'com.example.demo',
    actionUuid: 'com.example.demo.action',
    key: '2_0',
    active: true,
    settings: {},
    pluginAction: { name: 'Run' },
  });
  manager._replay('com.example.demo');
  assert.equal(sent.length, 2);
  assert.equal(sent[0].uuid, 'com.example.demo.action');
  assert.equal(sent[1].uuid, 'com.example.demo.action');
});
