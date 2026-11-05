'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { LogSink } = require('../lib/log-sink');

function tempFile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-log-sink-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'streamdeck.log');
}

function countingFs() {
  const calls = { exists: 0, stat: 0 };
  return {
    calls,
    fs: {
      existsSync: (file) => {
        calls.exists += 1;
        return fs.existsSync(file);
      },
      statSync: (file) => {
        calls.stat += 1;
        return fs.statSync(file);
      },
      createWriteStream: (...args) => fs.createWriteStream(...args),
      renameSync: (...args) => fs.renameSync(...args),
      appendFileSync: (...args) => fs.appendFileSync(...args),
    },
  };
}

test('many lines cost one stat, not one per line', async (t) => {
  const file = tempFile(t);
  fs.writeFileSync(file, 'existing\n');
  const spy = countingFs();
  const sink = new LogSink(file, { fs: spy.fs });

  for (let i = 0; i < 200; i += 1) sink.write(`line ${i}`);
  await sink.close();

  assert.equal(spy.calls.stat, 1, 'the size is tracked in memory');
  assert.equal(spy.calls.exists, 1);

  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.equal(lines.length, 201, 'the existing line is kept and the rest appended');
  assert.match(lines[1], /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z line 0$/);
});

test('the log rotates once it passes its limit', async (t) => {
  const file = tempFile(t);
  const sink = new LogSink(file, { maxBytes: 200 });

  for (let i = 0; i < 40; i += 1) sink.write(`line ${i}`);
  await sink.close();

  assert.equal(fs.existsSync(`${file}.1`), true, 'the previous log is kept');
  assert.ok(fs.statSync(file).size < 200, 'the new log starts under the limit');
});
