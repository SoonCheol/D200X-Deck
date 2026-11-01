'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { CH } = require('../lib/channels');

const root = path.join(__dirname, '..');
const known = new Set(Object.values(CH));

function literals(file, patterns) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const found = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

test('every channel used by the preload is declared in lib/channels.js', () => {
  const used = literals('preload.js', [/invoke\('([^']+)'/g, /subscribe\('([^']+)'/g]);
  assert.ok(used.length > 50, 'expected to find the preload API');
  for (const name of used) assert.ok(known.has(name), `unknown channel: ${name}`);
});

test('every channel used by the POP preload is declared', () => {
  const used = literals('pop-preload.js', [/ipcRenderer\.on\('([^']+)'/g, /ipcRenderer\.send\('([^']+)'/g]);
  assert.ok(used.length >= 2);
  for (const name of used) assert.ok(known.has(name), `unknown channel: ${name}`);
});

test('every channel the preload invokes has a registered handler', () => {
  const source = fs.readFileSync(path.join(root, 'ipc.js'), 'utf8');
  const registered = new Set();
  for (const match of source.matchAll(/handle\(CH\.(\w+)/g)) {
    registered.add(CH[match[1]]);
  }
  const invoked = literals('preload.js', [/invoke\('([^']+)'/g]);
  for (const name of invoked) assert.ok(registered.has(name), `no handler for: ${name}`);
});
