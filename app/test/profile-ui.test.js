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

test('the profile dialog saves from a footer, not from beside the name field', () => {
  const html = read('index.html');
  const modal = html.slice(html.indexOf('id="profile-modal"'), html.indexOf('id="import-modal"'));
  assert.ok(
    modal.indexOf('id="profile-save"') > modal.indexOf('id="profile-bg-clear"'),
    'Save comes after the linked app and background fields'
  );
  assert.match(modal, /id="profile-cancel"/);
  assert.match(read('app.js'), /#profile-save'\)\.textContent = editing \? 'Save changes' : 'Create profile'/);
});

test('profile actions live in one menu next to the profile picker', () => {
  const html = read('index.html');
  const menu = html.match(/<div id="profile-menu"[\s\S]*?\n {10}<\/div>/);
  assert.ok(menu, 'profile menu exists');
  for (const id of ['profile-add', 'profile-edit', 'import-btn', 'profile-export']) {
    assert.match(menu[0], new RegExp(`id="${id}"`), `${id} is in the menu`);
    assert.equal(html.split(`id="${id}"`).length - 1, 1, `${id} appears once`);
  }
  const row = html.slice(html.indexOf('class="profile-row"'), html.indexOf('class="sidebar-sep"'));
  assert.equal((row.match(/class="icon-btn"/g) || []).length, 1, 'one icon button beside the picker');
});

test('there is one import entry and one file picker for both profile formats', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /id="profile-import"/);
  assert.match(html, /<h2 id="import-title">Import profile<\/h2>/);
  assert.match(read('app.js'), /res\.kind === 'deckopen'/);
});
