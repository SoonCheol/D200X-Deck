'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { childDir, parsePackId } = require('../lib/iconpacks');

const root = path.join(path.sep, 'tmp', 'Icons');

test('a plain icon-pack name resolves inside its root', () => {
  assert.equal(childDir(root, 'my-pack'), path.join(root, 'my-pack'));
  assert.equal(childDir(root, 'My Pack 2'), path.join(root, 'My Pack 2'));
});

test('icon-pack names cannot escape their root', () => {
  for (const name of ['..', '.', '', '../..', '../../Library', 'a/b', 'a\\b', '/etc', '\0x']) {
    assert.equal(childDir(root, name), null, `rejected: ${JSON.stringify(name)}`);
  }
});

test('pack ids split into a known scope and a name', () => {
  assert.deepEqual(parsePackId('app:pack'), { scope: 'app', name: 'pack' });
  assert.deepEqual(parsePackId('ulanzi:pack'), { scope: 'ulanzi', name: 'pack' });
  assert.deepEqual(parsePackId('pack'), { scope: 'app', name: 'pack' });
  assert.equal(parsePackId('evil:pack'), null);
  assert.deepEqual(parsePackId(''), { scope: 'app', name: '' });
});

test('an id that would traverse still resolves to nothing', () => {
  // The two helpers are used together in main.js; this is the exact pair that
  // used to delete the whole app-data directory.
  const parsed = parsePackId('app:..');
  assert.equal(childDir(root, parsed.name), null);
});
