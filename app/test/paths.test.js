'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { isInside } = require('../lib/paths');

const root = path.join(path.sep, 'tmp', 'plugins', 'Foo.ulanziPlugin');

test('a file below the root is inside it', () => {
  assert.equal(isInside(root, path.join(root, 'ui', 'index.html')), true);
});

test('the root itself and siblings are not inside it', () => {
  assert.equal(isInside(root, root), false);
  assert.equal(isInside(root, path.join(path.sep, 'tmp', 'plugins', 'Foo.ulanziPlugin2', 'x')), false);
  assert.equal(isInside(root, path.join(path.sep, 'tmp', 'elsewhere')), false);
});

test('a traversal path is not inside it', () => {
  assert.equal(isInside(root, path.join(root, '..', 'secret')), false);
});
