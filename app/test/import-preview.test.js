'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');

const { parseProfile, previewProfile } = require('../lib/import-ulanzi');

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-import-preview-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeProfile(root, name = 'Test') {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'manifest.json'),
    JSON.stringify({ Name: name, Device: { Model: 'D200' }, Pages: { Current: 'p1', Pages: ['p1'] } })
  );
  const page = path.join(root, 'Profiles', 'p1');
  fs.mkdirSync(page, { recursive: true });
  fs.writeFileSync(
    path.join(page, 'manifest.json'),
    JSON.stringify({ Controllers: [{ Type: 'Keypad', Actions: {} }] })
  );
}

async function makeProfileZip(t, name = 'Test') {
  const zip = new JSZip();
  zip.file(
    `${name}.ulanziProfile/manifest.json`,
    JSON.stringify({ Name: name, Device: { Model: 'D200' }, Pages: { Current: 'p1', Pages: ['p1'] } })
  );
  zip.file(
    `${name}.ulanziProfile/Profiles/p1/manifest.json`,
    JSON.stringify({ Controllers: [{ Type: 'Keypad', Actions: {} }] })
  );
  const dir = tempDir(t);
  const file = path.join(dir, 'profile.zip');
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }));
  return file;
}

test('previewProfile reads a live profile directory', async (t) => {
  const dir = tempDir(t);
  writeProfile(dir, 'Live Profile');

  const result = await previewProfile(dir);

  assert.equal(result.cleanup, null);
  assert.equal(result.profiles.length, 1);
  assert.equal(result.profiles[0].name, 'Live Profile');
});

test('previewProfile extracts a plain profile ZIP and cleans it up', async (t) => {
  const file = await makeProfileZip(t, 'Zipped');

  const result = await previewProfile(file);

  assert.ok(result.cleanup);
  assert.equal(result.profiles.length, 1);
  assert.equal(result.profiles[0].name, 'Zipped');
  assert.equal(fs.existsSync(result.cleanup), true);
  fs.rmSync(result.cleanup, { recursive: true, force: true });
});

test('previewProfile extracts a #Version: 2 export', async (t) => {
  const zip = await makeProfileZip(t, 'Exported');
  const exported = path.join(path.dirname(zip), 'exported.ulanziDeckProfile');
  fs.writeFileSync(exported, Buffer.concat([Buffer.from('#Version: 2\n'), fs.readFileSync(zip)]));

  const result = await previewProfile(exported);

  assert.equal(result.profiles[0].name, 'Exported');
  fs.rmSync(result.cleanup, { recursive: true, force: true });
});

test('parseProfile rejects more than 200 pages before reading them', (t) => {
  const dir = tempDir(t);
  const pages = Array.from({ length: 201 }, (_, index) => `p${index}`);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ Pages: { Pages: pages } }));

  assert.throws(() => parseProfile(dir), /too many pages/i);
});

test('parseProfile links folder pages, names them and keeps multi-state views', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ Name: 'Folders', Pages: { Current: 'parent', Pages: ['parent', 'child'] } })
  );
  const parentDir = path.join(dir, 'Profiles', 'parent');
  const childDir = path.join(dir, 'Profiles', 'child');
  fs.mkdirSync(parentDir, { recursive: true });
  fs.mkdirSync(childDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentDir, 'manifest.json'),
    JSON.stringify({
      Controllers: [
        {
          Type: 'Keypad',
          Actions: {
            '0_0': {
              Action: 'com.ulanzi.ulanzideck.page.folder',
              ActionParam: { PageUUID: 'child' },
              ViewParam: [{ Text: 'Folder' }],
              State: 1,
            },
            '1_0': {
              Action: 'com.ulanzi.ulanzideck.system.text',
              ActionParam: { Text: 'Hello' },
              State: 1,
              ViewParam: [{ Text: 'One' }, { Text: 'Two' }],
            },
          },
        },
      ],
    })
  );
  fs.writeFileSync(
    path.join(childDir, 'manifest.json'),
    JSON.stringify({ Controllers: [{ Type: 'Keypad', Actions: {} }] })
  );

  const parsed = parseProfile(dir);
  const child = parsed.pages.find((page) => page.id === 'child');
  const multi = parsed.pages.find((page) => page.id === 'parent').keys[1];

  assert.equal(child.name, 'Folder');
  assert.equal(child.parentId, 'parent');
  assert.equal(multi.states.length, 2);
  assert.equal(multi.states[1].label, 'Two');
  assert.equal(multi.stateIndex, 1);
});
