'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { readCapped } = require('../lib/http');

test('reads a body below the cap', async () => {
  const res = new Response('hello');
  assert.equal((await readCapped(res, 10)).toString(), 'hello');
});

test('rejects a declared oversize body before reading it', async () => {
  const res = new Response('hello', { headers: { 'content-length': '999' } });
  await assert.rejects(readCapped(res, 10), /too large/);
});

test('rejects a streamed body that crosses the cap', async () => {
  const res = new Response('x'.repeat(100));
  await assert.rejects(readCapped(res, 10), /too large/);
});
