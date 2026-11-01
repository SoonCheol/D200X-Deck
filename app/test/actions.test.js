'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { execute, setShellErrorHandler } = require('../lib/actions');

test('reports a failing shell command through the error handler', async () => {
  let message = '';
  setShellErrorHandler((value) => {
    message = value;
  });
  try {
    const res = await execute({ type: 'command', value: 'echo nope >&2; exit 7' });
    assert.equal(res.ok, true, 'the key press itself succeeds');
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.match(message, /nope/);
  } finally {
    setShellErrorHandler(null);
  }
});

test('does not report successful shell commands', async () => {
  let message = '';
  setShellErrorHandler((value) => {
    message = value;
  });
  try {
    await execute({ type: 'command', value: 'true' });
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(message, '');
  } finally {
    setShellErrorHandler(null);
  }
});
