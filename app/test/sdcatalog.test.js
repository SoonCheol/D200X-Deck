'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { StreamDeckCatalog, normalizeVersion, compareVersions } = require('../lib/sdcatalog');

test('normalizes release and manifest versions', () => {
  assert.equal(normalizeVersion('v1.2.3'), '1.2.3');
  assert.equal(normalizeVersion('1.4.0'), '1.4.0');
  assert.equal(normalizeVersion(''), '');
});

test('compares dotted versions numerically', () => {
  assert.equal(compareVersions('1.0.0', '1.0'), 0);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('v1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.2.3', '1.2.4'), -1);
  assert.equal(compareVersions('2.0.0', '2.0.0-beta'), 1);
  assert.equal(compareVersions('2.0.0-beta', '2.0.0'), -1);
});

test('does not report an update when the versions are equivalent', async () => {
  const catalog = new StreamDeckCatalog();
  catalog.list = async () => [{ id: 'com.test.same', version: '', source: 'openaction' }];
  catalog.release = async () => ({ version: '1.0', url: 'https://example.invalid/plugin.zip' });
  const updates = await catalog.updates([{ uuid: 'com.test.same.sdPlugin', version: '1.0.0' }]);
  assert.deepEqual(updates, {});
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

function jsonResponse(body) {
  const data = Buffer.from(JSON.stringify(body));
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: (name) => (String(name).toLowerCase() === 'content-length' ? String(data.length) : null) },
    arrayBuffer: async () => data,
    body: null,
  };
}

test('refreshing the catalogue expires resolved releases', async (t) => {
  const originalFetch = global.fetch;
  let releaseTag = 'v1.0.0';
  global.fetch = async (url) => {
    if (String(url).includes('catalogue.json')) {
      return jsonResponse({
        'com.test.plugin': { name: 'Test plugin', repository: 'https://github.com/test/plugin' },
      });
    }
    return jsonResponse({
      tag_name: releaseTag,
      assets: [{ name: 'plugin.zip', browser_download_url: 'https://example.invalid/plugin.zip' }],
    });
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const catalog = new StreamDeckCatalog();
  const [entry] = await catalog.list(true);
  assert.equal((await catalog.release(entry)).version, '1.0.0');

  releaseTag = 'v2.0.0';
  await catalog.list(true);

  assert.equal((await catalog.release(entry)).version, '2.0.0');
});
