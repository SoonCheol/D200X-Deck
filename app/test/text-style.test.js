'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  weightPreset,
  weightValue,
  fontStack,
  contrastOutline,
  outlineWidth,
  normalizeFamily,
  normalizeWeight,
  normalizeAlign,
  normalizeColor,
  normalizeEffect,
  normalizeBackground,
} = require('../lib/text-style');

test('weights map to the three caption presets', () => {
  assert.equal(weightPreset(300), 'light');
  assert.equal(weightPreset(450), 'light');
  assert.equal(weightPreset(500), 'regular');
  assert.equal(weightPreset(600), 'regular');
  assert.equal(weightPreset(700), 'bold');
  assert.equal(weightPreset(800), 'bold');
  assert.equal(weightValue('light'), 300);
  assert.equal(weightValue('regular'), 600);
  assert.equal(weightValue('bold'), 800);
});

test('font families resolve to stable stacks', () => {
  assert.match(fontStack('georgia'), /Georgia/);
  assert.match(fontStack('menlo'), /Menlo/);
  assert.match(fontStack('avenir'), /Avenir Next/);
  assert.match(fontStack('missing'), /-apple-system/);
});

test('outline contrast follows the text colour', () => {
  assert.match(contrastOutline('#ffffff'), /rgba\(0,0,0/);
  assert.match(contrastOutline('#111111'), /rgba\(255,255,255/);
  assert.equal(outlineWidth(17), 2);
  assert.equal(outlineWidth(118), 6);
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
  assert.equal(normalizeEffect('glow'), 'none');
  assert.equal(normalizeEffect('outline'), 'outline');
  assert.equal(normalizeBackground('stars'), 'gradient');
  assert.equal(normalizeBackground('none'), 'none');
});
