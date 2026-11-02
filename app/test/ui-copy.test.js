'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('hotkeys render as macOS glyphs in the inspector', () => {
  const source = fs.readFileSync(path.join(__dirname, '../renderer/hotkeys.js'), 'utf8');
  const start = source.indexOf('const HOTKEY_GLYPHS');
  const end = source.indexOf('const HOTKEY_CATEGORIES');
  assert.ok(start >= 0 && end > start, 'hotkey formatter must be available');

  const context = vm.createContext({});
  new vm.Script(source.slice(start, end)).runInContext(context);
  assert.equal(vm.runInContext('prettyHotkey("cmd+shift+4")', context), '⌘ ⇧ 4');
  assert.equal(vm.runInContext('prettyHotkey("ctrl+alt+delete")', context), '⌃ ⌥ ⌫');
  assert.equal(vm.runInContext('prettyHotkey("")', context), '');
});
