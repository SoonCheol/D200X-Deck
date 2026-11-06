'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { seizeLineState, keyCaptureUnsupported, UNSUPPORTED_STATE } = require('../lib/seize');

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

test('key capture is skipped on macOS 27 and later, where the kernel refuses the seize', () => {
  assert.equal(keyCaptureUnsupported('27.2.0'), true);
  assert.equal(keyCaptureUnsupported('28.0'), true);
  assert.equal(keyCaptureUnsupported('26.4.1'), false);
  assert.equal(keyCaptureUnsupported('15.1'), false);
  assert.equal(keyCaptureUnsupported(undefined), false, 'unknown version: try the helper');
  assert.equal(keyCaptureUnsupported('nonsense'), false);
  assert.deepEqual(UNSUPPORTED_STATE, { running: false, message: 'Not needed on macOS 27', need: 'unsupported' });
});
