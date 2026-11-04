'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { SCHEME, fileName, imageUrl, urlToFileName } = require('../lib/image-url');

test('file refs become private image URLs', () => {
  assert.equal(imageUrl('file:abc123.png'), `${SCHEME}://images/abc123.png`);
  assert.equal(imageUrl('file:a.b-c_d.svg'), `${SCHEME}://images/a.b-c_d.svg`);
});

test('non-ref values pass through unchanged', () => {
  const data = 'data:image/png;base64,YQ==';
  assert.equal(imageUrl(data), data);
  assert.equal(imageUrl('assets/actions/plugin.svg'), 'assets/actions/plugin.svg');
  assert.equal(imageUrl(null), null);
  assert.equal(imageUrl(undefined), undefined);
  assert.equal(imageUrl(42), 42);
});

test('file names are validated, never treated as paths', () => {
  assert.equal(fileName('file:abc.png'), 'abc.png');
  assert.equal(fileName('file:../config.json'), null);
  assert.equal(fileName('file:/etc/passwd'), null);
  assert.equal(fileName('file:a/b.png'), null);
  assert.equal(fileName('file:'), null);
  assert.equal(fileName('file:.'), null);
  assert.equal(fileName('file:..'), null);
  assert.equal(fileName('data:image/png;base64,YQ=='), null);
  assert.equal(fileName(null), null);
});

test('image URLs map back to a file name', () => {
  assert.equal(urlToFileName(`${SCHEME}://images/abc.png`), 'abc.png');
  assert.equal(urlToFileName(`${SCHEME}://images/a%20b.png`), null);
  assert.equal(urlToFileName(`${SCHEME}://other/abc.png`), null);
  assert.equal(urlToFileName(`${SCHEME}://images/..%2Fconfig.json`), null);
  assert.equal(urlToFileName(`${SCHEME}://images/`), null);
  assert.equal(urlToFileName('file:///tmp/abc.png'), null);
  assert.equal(urlToFileName('not a url'), null);
});
