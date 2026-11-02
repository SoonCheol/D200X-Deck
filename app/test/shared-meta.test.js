'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const mime = require('../lib/mime');
const geometry = require('../lib/geometry');
const meta = require('../lib/actions-meta');

test('the MIME table knows plugin, font and image types', () => {
  assert.equal(mime.byExtension('.mjs'), 'text/javascript');
  assert.equal(mime.byExtension('.woff2'), 'font/woff2');
  assert.equal(mime.byExtension('PNG'), 'image/png');
  assert.equal(mime.byExtension('.txt'), 'application/octet-stream');
  assert.equal(mime.imageByExtension('.jpg'), 'image/jpeg');
  assert.equal(mime.imageByExtension('.txt'), null);
});

test('the grid geometry is internally consistent', () => {
  assert.equal(geometry.COLUMNS * geometry.ROWS, geometry.KEY_SLOTS);
  assert.equal(geometry.KEY_COUNT, geometry.KEY_SLOTS - 1);
  assert.equal(geometry.WIDE_INDEX, 13);
});

test('every action type has a label and belongs to a group', () => {
  for (const type of meta.ACTION_TYPES) {
    assert.ok(meta.ACTION_LABELS[type], `missing label for ${type}`);
  }
  const grouped = new Set();
  for (const [, types] of meta.ACTION_GROUPS) {
    for (const type of types) {
      assert.ok(meta.ACTION_TYPES.includes(type), `unknown type in group: ${type}`);
      grouped.add(type);
    }
  }
  for (const type of meta.ACTION_TYPES) assert.ok(grouped.has(type), `not in any group: ${type}`);
});

test('multi steps cover the editor set without recursive actions', () => {
  const types = meta.MULTI_STEP_TYPES.map(([type]) => type);
  for (const type of [
    'hotkey',
    'media',
    'text',
    'app',
    'url',
    'close',
    'command',
    'sound',
    'timer',
    'brightness',
    'plugin',
    'page',
  ]) {
    assert.ok(types.includes(type), `missing step type: ${type}`);
  }
  for (const type of ['multi', 'toggle', 'pop', 'indicator', 'none']) {
    assert.ok(!types.includes(type), `recursive step type: ${type}`);
  }
  for (const [type, label] of meta.MULTI_STEP_TYPES) {
    assert.ok(meta.ACTION_TYPES.includes(type), `unknown step type: ${type}`);
    assert.ok(label, `missing step label: ${type}`);
  }
});

test('media keys have one label and emoji each', () => {
  assert.equal(new Set(meta.MEDIA_OPS).size, meta.MEDIA_OPS.length);
  for (const op of meta.MEDIA_OPS) {
    assert.ok(meta.MEDIA_LABELS[op], `missing label for ${op}`);
    assert.ok(meta.MEDIA_EMOJI[op], `missing emoji for ${op}`);
  }
});
