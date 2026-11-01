'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { compareVersions, isNewer, normalizeVersion } = require('../lib/version');

test('versions compare numerically, not as strings', () => {
  assert.equal(compareVersions('1.10', '1.9'), 1);
  assert.equal(compareVersions('1.9', '1.10'), -1);
  assert.equal(isNewer('1.10', '1.9'), true);
});

test('missing and trailing zeros are equivalent', () => {
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('v1.2', '1.2.0'), 0);
  assert.equal(isNewer('1.0.0', '1.0'), false);
});

test('a pre-release sorts below its release', () => {
  assert.equal(compareVersions('1.0.0-beta', '1.0.0'), -1);
  assert.equal(compareVersions('1.0.0', '1.0.0-beta'), 1);
});

test('normalizeVersion drops a leading v and whitespace', () => {
  assert.equal(normalizeVersion('  v2.3.4 '), '2.3.4');
});
