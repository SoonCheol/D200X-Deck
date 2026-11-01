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
