'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { fetchSiteIcon } = require('../lib/siteicon');

function imageResponse() {
  return {
    ok: true,
    headers: { get: (name) => (name === 'content-type' ? 'image/png' : name === 'content-length' ? '3' : null) },
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  };
}

function htmlResponse(body) {
  return {
    ok: true,
    headers: { get: (name) => (name === 'content-type' ? 'text/html' : null) },
    text: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

test('falls back to the domain root when a deep page has no icon', async () => {
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href === 'https://example.com/deep/page') return { ok: false, status: 404, headers: { get: () => null } };
    if (href === 'https://example.com/') return htmlResponse('<html><link rel="icon" href="/icon.png"></html>');
    if (href === 'https://example.com/icon.png') return imageResponse();
    return { ok: false, status: 404, headers: { get: () => null } };
  };
  try {
    const icon = await fetchSiteIcon('https://example.com/deep/page');
    assert.equal(icon.type, 'image/png');
    assert.equal(icon.source, 'https://example.com/icon.png');
    assert.ok(calls.includes('https://example.com/'), 'should retry the domain root');
  } finally {
    global.fetch = realFetch;
  }
});

test('does not retry the root when the URL is already the root', async () => {
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    calls.push(String(url));
    return { ok: false, status: 404, headers: { get: () => null } };
  };
  try {
    await assert.rejects(fetchSiteIcon('https://example.com/'), /404/);
    assert.equal(calls.filter((href) => href === 'https://example.com/').length, 2);
  } finally {
    global.fetch = realFetch;
  }
});
