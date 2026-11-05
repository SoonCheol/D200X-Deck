'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createCrashGuard } = require('../lib/renderer-crash');

test('three renderer crashes reload, the fourth does not', () => {
  let clock = 0;
  const guard = createCrashGuard({ now: () => clock });

  clock = 1_000;
  assert.equal(guard.record(), true);
  clock = 2_000;
  assert.equal(guard.record(), true);
  clock = 3_000;
  assert.equal(guard.record(), true);
  clock = 4_000;
  assert.equal(guard.record(), false, 'the fourth crash in a minute stops the loop');
  assert.equal(guard.count(), 4);
});

test('the window is rolling: old crashes age out', () => {
  let clock = 0;
  const guard = createCrashGuard({ now: () => clock });

  clock = 1_000;
  guard.record();
  guard.record();
  guard.record();
  clock = 2_000;
  assert.equal(guard.record(), false);

  clock = 61_500; // more than a minute after the first three
  assert.equal(guard.record(), true);
  assert.equal(guard.count(), 2, 'the fourth crash is still inside the window');
});

test('reset clears the window', () => {
  const guard = createCrashGuard({ now: () => 0 });
  guard.record();
  guard.record();
  guard.record();
  guard.record();
  guard.reset();
  assert.equal(guard.count(), 0);
  assert.equal(guard.record(), true);
});
