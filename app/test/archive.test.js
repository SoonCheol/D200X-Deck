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

test('inspectZip rejects an oversized archive, a non-ZIP and a truncated file', async (t) => {
  const file = await makeZip(t, { 'safe.txt': 'x' });
  assert.throws(() => inspectZip(file, { maxArchiveBytes: 10 }), /too large/i);

  const notZip = path.join(path.dirname(file), 'not.zip');
  fs.writeFileSync(notZip, 'not a zip');
  assert.throws(() => inspectZip(notZip), /not a ZIP/i);

  const truncated = path.join(path.dirname(file), 'truncated.zip');
  const data = fs.readFileSync(file);
  fs.writeFileSync(truncated, data.subarray(0, data.length - 60));
  assert.throws(() => inspectZip(truncated), /ZIP/i);
});

test('inspectZip rejects ZIP64 and invalid central-directory offsets', async (t) => {
  const file = await makeZip(t, { 'safe.txt': 'x' });
  const data = fs.readFileSync(file);
  const eocd = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0);

  const zip64 = Buffer.from(data);
  zip64.writeUInt16LE(0xffff, eocd + 10);
  const zip64File = path.join(path.dirname(file), 'zip64.zip');
  fs.writeFileSync(zip64File, zip64);
  assert.throws(() => inspectZip(zip64File), /ZIP64/i);

  const badOffset = Buffer.from(data);
  badOffset.writeUInt32LE(data.length + 100, eocd + 16);
  const badOffsetFile = path.join(path.dirname(file), 'bad-offset.zip');
  fs.writeFileSync(badOffsetFile, badOffset);
  assert.throws(() => inspectZip(badOffsetFile), /invalid directory/i);
});

test('inspectZip rejects absolute, drive and backslash traversal names', async (t) => {
  for (const name of ['/absolute.txt', 'C:\\drive.txt', '..\\escape.txt']) {
    const file = await makeZip(t, { [name]: 'x' });
    assert.throws(() => inspectZip(file), /unsafe path/i, name);
  }
});

test('readZipEntry enforces its output cap', async (t) => {
  const file = await makeZip(t, { 'large.txt': '0123456789' });

  await assert.rejects(readZipEntry(file, 'large.txt', 2));
});

test('extractZip stops an archive that expands beyond the budget while unpacking', async (t) => {
  const file = await makeZip(t, { 'safe.txt': 'x' });
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-fake-unzip-'));
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-monitor-'));
  t.after(() => {
    fs.rmSync(bin, { recursive: true, force: true });
    fs.rmSync(destination, { recursive: true, force: true });
  });
  const script = path.join(bin, 'unzip');
  fs.writeFileSync(
    script,
    `#!/bin/sh\nout=""\nwhile [ $# -gt 0 ]; do case "$1" in -d) out="$2"; shift 2;; *) shift;; esac; done\nmkdir -p "$out"\ndd if=/dev/zero of="$out/chunk.bin" bs=1024 count=1024 2>/dev/null\nsleep 0.8\necho done > "$out/completed"\n`
  );
  fs.chmodSync(script, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}:${originalPath}`;
  t.after(() => {
    process.env.PATH = originalPath;
  });

  await assert.rejects(
    extractZip(file, destination, { maxExpandedBytes: 1024 }),
    /expands to more/i
  );
  assert.equal(fs.existsSync(path.join(destination, 'completed')), false, 'unzip was stopped');
});

