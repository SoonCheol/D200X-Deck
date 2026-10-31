'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { StreamDeckCatalog, normalizeVersion } = require('../lib/sdcatalog');

test('normalizes release and manifest versions', () => {
  assert.equal(normalizeVersion('v1.2.3'), '1.2.3');
  assert.equal(normalizeVersion('1.4.0'), '1.4');
  assert.equal(normalizeVersion(''), '');
});

test('reports updates for archive and OpenAction entries', async () => {
  const catalog = new StreamDeckCatalog();
  catalog.list = async () => [
    { id: 'com.test.archive', version: '1.4', source: 'elgato' },
    { id: 'me.test.action', version: '', source: 'openaction' },
  ];
  catalog.release = async (entry) => {
    assert.equal(entry.id, 'me.test.action');
    return { version: '2.0.0', url: 'https://example.invalid/plugin.zip' };
  };
  const updates = await catalog.updates([
    { uuid: 'com.test.archive.sdPlugin', version: '1.3' },
    { uuid: 'me.test.action.sdPlugin', version: '1.0.0' },
  ]);
  assert.deepEqual(updates, { 'com.test.archive': '1.4', 'me.test.action': '2.0.0' });
});
