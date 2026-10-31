'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');

const { buildPage, WIDE_SLOT } = require('../lib/page');

const images = [
  { index: 0, png: 'aGk=' },
  { index: 13, png: 'aGk=' },
];

test('the wide slot carries the selected panel mode', async () => {
  for (const [mode, value] of [['clock', 1], ['stats', 0], ['blank', 2]]) {
    const zip = await buildPage(images, mode);
    const manifest = JSON.parse(await (await JSZip.loadAsync(zip)).file('manifest.json').async('string'));
    assert.equal(manifest[WIDE_SLOT].SmallViewMode, value);
  }
  const blankZip = await JSZip.loadAsync(await buildPage(images, 'blank'));
  const blankManifest = JSON.parse(await blankZip.file('manifest.json').async('string'));
  assert.match(blankManifest[WIDE_SLOT].ViewParam[0].Icon, /^Images\/[0-9a-f]{40}\.png$/);
  const clockZip = await JSZip.loadAsync(await buildPage(images, 'clock'));
  const clockManifest = JSON.parse(await clockZip.file('manifest.json').async('string'));
  assert.equal(clockManifest[WIDE_SLOT].ViewParam[0].Icon, undefined);

  const fallback = await buildPage(images);
  const manifest = JSON.parse(await (await JSZip.loadAsync(fallback)).file('manifest.json').async('string'));
  assert.equal(manifest[WIDE_SLOT].SmallViewMode, 1);
});
