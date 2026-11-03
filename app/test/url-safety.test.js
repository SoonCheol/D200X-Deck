'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { schemeOf, hasControlCharacters, isBlockedScheme, isKnownScheme } = require('../lib/url-safety');

test('schemeOf normalizes case and ignores schemeless values', () => {
  assert.equal(schemeOf('Slack://channel'), 'slack');
  assert.equal(schemeOf('  https://example.com  '), 'https');
  assert.equal(schemeOf('example.com'), '');
  assert.equal(schemeOf('java\tscript:alert(1)'), '');
});

test('dangerous schemes are blocked and common app schemes are known', () => {
  for (const scheme of ['file', 'javascript', 'data', 'shortcuts', 'smb', 'x-apple.systempreferences']) {
    assert.equal(isBlockedScheme(scheme), true, scheme);
  }
  for (const scheme of ['http', 'https', 'mailto', 'slack', 'zoommtg', 'linear']) {
    assert.equal(isKnownScheme(scheme), true, scheme);
    assert.equal(isBlockedScheme(scheme), false, scheme);
  }
  assert.equal(isKnownScheme('myapp'), false);
});

test('control characters are rejected before the scheme check', () => {
  assert.equal(hasControlCharacters('java\tscript:alert(1)'), true);
  assert.equal(hasControlCharacters('data:text/html,\u0000'), true);
  assert.equal(hasControlCharacters('https://example.com'), false);
});
