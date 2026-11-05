'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { seizeLineState } = require('../lib/seize');

test('hidseize lines map to the key capture state', () => {
  assert.deepEqual(seizeLineState('access 0'), { running: true, message: 'Waiting for the Deck…' });
  assert.equal(seizeLineState('access 1').need, 'permission');
  assert.equal(seizeLineState('manager 0xe00002e2').need, 'permission');
  assert.equal(seizeLineState('seized 1').message, 'Capturing keys');
  assert.equal(seizeLineState('match 0 page=1 usage=6'), null);
});

test('a not-privileged seize is not reported as a busy Deck', () => {
  const state = seizeLineState('seize 0xe00002c1');
  assert.equal(state.need, 'privilege');
  assert.equal(state.message, 'Not allowed by macOS');
  assert.equal(seizeLineState('seize 0xe00002c5').message, 'The Deck is in use by another app');
});
