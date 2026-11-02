'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  weightPreset,
  weightValue,
  normalizeWeightPreset,
  fontStack,
  normalizeFamily,
  normalizeWeight,
  normalizeAlign,
  normalizeColor,
  normalizeBackground,
} = require('../lib/text-style');

test('weights map to the three caption presets', () => {
  assert.equal(weightPreset(300), 'light');
  assert.equal(weightPreset(400), 'regular');
  assert.equal(weightPreset(600), 'regular');
  assert.equal(weightPreset(700), 'bold');
  assert.equal(weightPreset(800), 'bold');
  assert.equal(weightValue('light'), 300);
  assert.equal(weightValue('regular'), 400);
  assert.equal(weightValue('bold'), 700);
  assert.equal(normalizeWeightPreset(800, 400), 700);
  assert.equal(normalizeWeightPreset(undefined, 700), 700);
});

test('font families resolve to stable stacks', () => {
  assert.match(fontStack('georgia'), /Georgia/);
  assert.match(fontStack('menlo'), /Menlo/);
  assert.match(fontStack('avenir'), /Avenir Next/);
  assert.match(fontStack('missing'), /-apple-system/);
});

test('style values are clamped to their safe sets', () => {
  assert.equal(normalizeFamily('georgia'), 'georgia');
  assert.equal(normalizeFamily('comic'), 'system');
  assert.equal(normalizeWeight(5000), 900);
  assert.equal(normalizeWeight(undefined, 700), 700);
  assert.equal(normalizeAlign('justify'), 'center');
  assert.equal(normalizeAlign(undefined, 'left'), 'left');
  assert.equal(normalizeColor('red'), '#ffffff');
  assert.equal(normalizeColor('#a1b2c3'), '#a1b2c3');
  assert.equal(normalizeBackground('stars'), 'gradient');
  assert.equal(normalizeBackground('none'), 'none');
});
