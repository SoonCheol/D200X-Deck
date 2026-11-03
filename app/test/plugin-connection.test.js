'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const { PluginManager } = require('../lib/plugins');
const { StreamDeckPlugins } = require('../lib/streamdeck-plugins');

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-plugin-connection-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.sent = [];
    this.closed = null;
  }

  send(raw) {
    this.sent.push(JSON.parse(String(raw)));
  }

  close(code, reason) {
    this.readyState = 3;
    this.closed = { code, reason };
    this.emit('close');
  }

  message(payload) {
    this.emit('message', Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)));
  }
}

test('Ulanzi connection registers a known plugin and replays its state', (t) => {
  const dir = tempDir(t);
  const manager = new PluginManager({ dirs: [dir], appPluginsDir: dir });
  manager.plugins.set('plugin', { uuid: 'plugin', name: 'Plugin', compatible: true });
  manager.globalSettings.set('plugin', { token: 'saved' });
  manager.queues.set('plugin', [{ cmd: 'queued' }]);
  const replays = [];
  manager._replay = (uuid) => replays.push(uuid);
  const socket = new FakeSocket();

  manager._onConnection(socket);
  socket.message({ cmd: 'connected', uuid: 'plugin' });

  assert.equal(manager.sockets.get('plugin'), socket);
  assert.deepEqual(replays, ['plugin']);
  assert.deepEqual(socket.sent[0], {
    cmd: 'didReceiveGlobalSettings',
    uuid: 'plugin',
    settings: { token: 'saved' },
  });
  assert.deepEqual(socket.sent[1], { cmd: 'queued' });
});

test('Ulanzi connection rejects an unknown plugin and ignores malformed JSON', (t) => {
  const dir = tempDir(t);
  const manager = new PluginManager({ dirs: [dir], appPluginsDir: dir });
  const unknown = new FakeSocket();
  manager._onConnection(unknown);

  unknown.message('{not json');
  unknown.message({ cmd: 'connected', uuid: 'missing' });

  assert.deepEqual(unknown.closed, { code: 4402, reason: 'unknown plugin' });
  assert.equal(manager.sockets.has('missing'), false);
});

test('Ulanzi inspector connection adds the action and accepts parameter updates', (t) => {
  const dir = tempDir(t);
  const manager = new PluginManager({ dirs: [dir], appPluginsDir: dir });
  manager.plugins.set('plugin', { uuid: 'plugin', name: 'Plugin', compatible: true });
  manager.actions.set('action', {
    pluginUuid: 'plugin',
    actionUuid: 'action-uuid',
    key: '0_0',
    settings: { first: 1 },
  });
  const socket = new FakeSocket();

  manager._onConnection(socket);
  socket.message({ cmd: 'connected', uuid: 'plugin', actionid: 'action' });

  assert.equal(manager.inspectors.get('action'), socket);
  assert.deepEqual(socket.sent[0], {
    cmd: 'add',
    uuid: 'action-uuid',
    key: '0_0',
    actionid: 'action',
    param: { first: 1 },
  });

  socket.message({ cmd: 'paramfromplugin', actionid: 'action', param: { second: 2 } });
  assert.deepEqual(manager.actions.get('action').settings, { second: 2 });
});

test('Ulanzi close only removes the socket it owns', (t) => {
  const dir = tempDir(t);
  const manager = new PluginManager({ dirs: [dir], appPluginsDir: dir });
  manager.plugins.set('plugin', { uuid: 'plugin', name: 'Plugin', compatible: true });
  const first = new FakeSocket();
  const second = new FakeSocket();
  manager._onConnection(first);
  manager._onConnection(second);
  first.message({ cmd: 'connected', uuid: 'plugin' });
  second.message({ cmd: 'connected', uuid: 'plugin' });

  assert.equal(manager.sockets.get('plugin'), second);
  first.emit('close');
  assert.equal(manager.sockets.get('plugin'), second);
  second.emit('close');
  assert.equal(manager.sockets.has('plugin'), false);
});

test('Stream Deck registration connects, replays and replaces an older socket', (t) => {
  const dir = tempDir(t);
  const host = new StreamDeckPlugins({ appPluginsDir: dir });
  host.plugins.set('com.test.sdPlugin', {
    uuid: 'com.test.sdPlugin',
    name: 'Test',
    compatible: true,
    actions: [],
  });
  const replays = [];
  host._replay = (uuid) => replays.push(uuid);
  const first = new FakeSocket();
  const second = new FakeSocket();

  host._onConnection(first);
  first.message({ event: 'registerPlugin', uuid: 'com.test' });

  assert.equal(host.sockets.get('com.test.sdPlugin'), first);
  assert.deepEqual(replays, ['com.test.sdPlugin']);
  assert.equal(first.sent[0].event, 'deviceDidConnect');

  host._onConnection(second);
  second.message({ event: 'registerPlugin', uuid: 'com.test.sdPlugin' });

  assert.deepEqual(first.closed, { code: 4409, reason: 'replaced' });
  assert.equal(host.sockets.get('com.test.sdPlugin'), second);
});

test('Stream Deck rejects unknown plugins and inspectors', (t) => {
  const dir = tempDir(t);
  const host = new StreamDeckPlugins({ appPluginsDir: dir });
  const unknownPlugin = new FakeSocket();
  host._onConnection(unknownPlugin);
  unknownPlugin.message({ event: 'registerPlugin', uuid: 'missing' });
  assert.deepEqual(unknownPlugin.closed, { code: 4402, reason: 'unknown plugin' });

  const unknownInspector = new FakeSocket();
  host._onConnection(unknownInspector);
  unknownInspector.message({ event: 'registerPropertyInspector', uuid: 'missing' });
  assert.deepEqual(unknownInspector.closed, { code: 4403, reason: 'unknown context' });
});

test('Stream Deck inspector registration sends its action settings', (t) => {
  const dir = tempDir(t);
  const host = new StreamDeckPlugins({ appPluginsDir: dir });
  host.plugins.set('com.test.sdPlugin', {
    uuid: 'com.test.sdPlugin',
    name: 'Test',
    compatible: true,
    actions: [],
  });
  host.actions.set('context', {
    pluginUuid: 'com.test.sdPlugin',
    actionUuid: 'com.test.action',
    key: '0_0',
    settings: { first: 1 },
  });
  const socket = new FakeSocket();

  host._onConnection(socket);
  socket.message({ event: 'registerPropertyInspector', uuid: 'context' });

  assert.equal(host.inspectors.get('context'), socket);
  assert.equal(socket.sent[0].event, 'didReceiveSettings');
  assert.equal(socket.sent[0].payload.settings.first, 1);
});
