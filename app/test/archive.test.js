'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');

const { extractZip, inspectZip, readZipEntry } = require('../lib/archive');

async function makeZip(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content, { createFolders: false });
  }
  const file = path.join(dir, 'test.zip');
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }));
  return file;
}

test('inspectZip reports the entries and expanded size', async (t) => {
  const file = await makeZip(t, { 'plugin/manifest.json': '{}', 'plugin/app.js': '// app\n' });

  const info = inspectZip(file);

  assert.equal(info.entries, 2);
  assert.equal(info.expandedBytes, 9);
  assert.deepEqual(info.names.sort(), ['plugin/app.js', 'plugin/manifest.json']);
});

test('inspectZip rejects unsafe entry paths', async (t) => {
  const file = await makeZip(t, { '../escape.txt': 'x' });

  assert.throws(() => inspectZip(file), /unsafe path/i);
});

test('inspectZip enforces entry and expanded-size limits', async (t) => {
  const many = await makeZip(t, { 'a': '1', 'b': '2', 'c': '3' });
  assert.throws(() => inspectZip(many, { maxEntries: 2 }), /too many files/i);

  const large = await makeZip(t, { 'large.bin': 'x'.repeat(2048) });
  assert.throws(() => inspectZip(large, { maxExpandedBytes: 1024 }), /expands to more/i);
});

test('extractZip unpacks a bounded archive and rechecks its size', async (t) => {
  const file = await makeZip(t, { 'plugin/manifest.json': '{"Name":"Demo"}' });
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-out-'));
  t.after(() => fs.rmSync(destination, { recursive: true, force: true }));

  const result = await extractZip(file, destination);

  assert.equal(result.entries, 1);
  assert.equal(result.extractedBytes, 15);
  assert.equal(fs.readFileSync(path.join(destination, 'plugin', 'manifest.json'), 'utf8'), '{"Name":"Demo"}');
});

test('readZipEntry reads one entry without extracting the archive', async (t) => {
  const file = await makeZip(t, { 'manifest.json': '{"Name":"Demo"}', 'app.js': '// app' });

  assert.equal(await readZipEntry(file, 'manifest.json'), '{"Name":"Demo"}');
  assert.equal(await readZipEntry(file, 'missing.json'), null);
});
