'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '../renderer', file), 'utf8');

test('icon buttons drop the default button padding so their glyph stays centred', () => {
  const css = read('styles.css');
  const rule = css.match(/\n\.icon-btn \{([^}]*)\}/);
  assert.ok(rule, '.icon-btn rule exists');
  assert.match(rule[1], /padding:\s*0\s*;/);
});
