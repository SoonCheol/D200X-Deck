'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { StreamDeckCatalog, normalizeVersion } = require('../lib/sdcatalog');

test('normalizes release and manifest versions', () => {
  assert.equal(normalizeVersion('v1.2.3'), '1.2.3');
  assert.equal(normalizeVersion('1.4.0'), '1.4');
  assert.equal(normalizeVersion(''), '');
});

test('resolves versions from GitHub releases and reports updates', async () => {
  const catalog = new StreamDeckCatalog();
  catalog.list = async () => [
    { id: 'me.test.action', version: '', source: 'openaction', repository: 'https://github.com/test/action' },
  ];
  catalog.release = async (entry) => {
    assert.equal(entry.id, 'me.test.action');
    return { version: '2.0.0', url: 'https://example.invalid/plugin.zip' };
  };
  const updates = await catalog.updates([{ uuid: 'me.test.action.sdPlugin', version: '1.0.0' }]);
  assert.deepEqual(updates, { 'me.test.action': '2.0.0' });
});

test('skips plugins that are missing from the catalogue or have no version', async () => {
  const catalog = new StreamDeckCatalog();
  catalog.list = async () => [{ id: 'me.test.action', version: '', source: 'openaction' }];
  catalog.release = async () => ({ version: '1.0.0', url: 'https://example.invalid/plugin.zip' });
  const updates = await catalog.updates([
    { uuid: 'com.other.plugin.sdPlugin', version: '1.0.0' },
    { uuid: 'me.test.action.sdPlugin', version: '' },
  ]);
  assert.deepEqual(updates, {});
});
