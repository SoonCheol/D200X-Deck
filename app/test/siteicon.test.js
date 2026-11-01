'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { fetchSiteIcon, isBlockedHost, isBlockedIp } = require('../lib/siteicon');

test('private, loopback and link-local addresses are blocked', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ]) {
    assert.equal(isBlockedIp(ip), true, `blocked: ${ip}`);
  }
});

test('public addresses are allowed', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
    assert.equal(isBlockedIp(ip), false, `allowed: ${ip}`);
  }
});

test('local hostnames are blocked by name', () => {
  for (const host of ['localhost', 'foo.localhost', 'printer.local', 'db.internal', '']) {
    assert.equal(isBlockedHost(host), true, `blocked: ${JSON.stringify(host)}`);
  }
  assert.equal(isBlockedHost('github.com'), false);
});

test('fetching a loopback URL is refused before any request', async () => {
  await assert.rejects(fetchSiteIcon('http://127.0.0.1:9/favicon.ico'), /not reachable/);
});
