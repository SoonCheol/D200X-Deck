'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { isInside, isInsideReal } = require('../lib/paths');

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

test('isInsideReal rejects a symlink that leaves the root', (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-paths-parent-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-paths-outside-'));
  t.after(() => {
    fs.rmSync(parent, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(parent, 'inside.txt'), 'inside');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
  fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(parent, 'link.txt'));

  assert.equal(isInsideReal(parent, path.join(parent, 'inside.txt')), true);
  assert.equal(isInsideReal(parent, path.join(parent, 'link.txt')), false);
  assert.equal(isInsideReal(parent, path.join(parent, 'missing.txt')), false);
});
