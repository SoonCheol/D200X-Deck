'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { PluginHost } = require('../lib/plugin-host');

class TestHost extends PluginHost {
  constructor() {
    super({ dirs: [fs.mkdtempSync(path.join(os.tmpdir(), 'host-test-'))], port: 0, label: 'test' });
  }
}

function fakeProcess() {
  return {
    exitCode: null,
    signals: [],
    kill(signal = 'SIGTERM') {
      this.signals.push(signal);
    },
    once() {},
  };
}

test('shutdown escalates from SIGTERM to SIGKILL', async () => {
  const host = new TestHost();
  const proc = fakeProcess();
  host.children.set('a', proc);
  await host.shutdown(10);
  assert.deepEqual(proc.signals, ['SIGTERM', 'SIGKILL']);
});

test('reloadOne stops one plugin and leaves the others alone', () => {
  const host = new TestHost();
  host.plugins.set('a', { uuid: 'a', compatible: true });
  host.plugins.set('b', { uuid: 'b', compatible: true });
  host.actions.set('a1', { pluginUuid: 'a' });
  host.actions.set('b1', { pluginUuid: 'b' });
  const a = fakeProcess();
  const b = fakeProcess();
  host.children.set('a', a);
  host.children.set('b', b);
  host.scan = () => [];
  host.list = () => [];

  host.reloadOne('a');

  assert.equal(host.actions.has('a1'), false);
  assert.equal(host.actions.has('b1'), true);
  assert.equal(host.children.has('a'), false);
  assert.equal(host.children.has('b'), true);
  assert.deepEqual(a.signals, ['SIGTERM']);
  assert.deepEqual(b.signals, []);
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('a plugin with no keys left is stopped after a grace period; one in use is kept', async () => {
  const host = new TestHost();
  host.idleStopMs = 20;
  host.plugins.set('a', { uuid: 'a', compatible: true });
  host.plugins.set('b', { uuid: 'b', compatible: true });
  host.actions.set('b1', { pluginUuid: 'b' });
  const a = fakeProcess();
  const b = fakeProcess();
  host.children.set('a', a);
  host.children.set('b', b);

  host.reapIdle();
  assert.deepEqual(a.signals, [], 'not stopped at once, so moving a key does not restart it');

  await wait(80);
  assert.deepEqual(a.signals, ['SIGTERM']);
  assert.equal(host.children.has('a'), false);
  assert.deepEqual(b.signals, []);
  assert.equal(host.children.has('b'), true);
});

test('adding the key back within the grace period keeps the plugin running', async () => {
  const host = new TestHost();
  host.idleStopMs = 40;
  host.plugins.set('a', { uuid: 'a', compatible: true });
  const a = fakeProcess();
  host.children.set('a', a);

  host.reapIdle();
  host.actions.set('a1', { pluginUuid: 'a' });
  host.reapIdle();
  await wait(100);

  assert.deepEqual(a.signals, []);
  assert.equal(host.children.has('a'), true);
});
