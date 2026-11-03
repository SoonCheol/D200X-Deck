'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { appLogPath, appendAppLog } = require('../lib/app-log');

test('appLogPath points at the user Library Logs folder', () => {
  assert.equal(
    appLogPath('reload', '/Users/demo'),
    '/Users/demo/Library/Logs/Ulanzi Deck Open/reload.log'
  );
});

test('appendAppLog creates the directory and appends timestamped lines', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-log-'));
  const file = path.join(dir, 'nested', 'reload.log');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  appendAppLog('reload', 'OK /tmp/config.json', { file });
  appendAppLog('reload', 'FAIL broken', { file });

  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^\d{4}-\d{2}-\d{2}T.* OK \/tmp\/config\.json$/);
  assert.match(lines[1], / FAIL broken$/);
});
