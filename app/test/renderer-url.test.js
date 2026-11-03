'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { isRendererFile } = require('../lib/renderer-url');

test('the renderer directory is the only trusted file origin', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-renderer-url-'));
  const renderer = path.join(root, 'renderer');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-renderer-outside-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  fs.mkdirSync(renderer, { recursive: true });
  fs.writeFileSync(path.join(renderer, 'index.html'), '<html></html>');
  fs.writeFileSync(path.join(renderer, 'app.js'), '// app');
  fs.writeFileSync(path.join(outside, 'secret.html'), 'secret');
  fs.symlinkSync(path.join(outside, 'secret.html'), path.join(renderer, 'link.html'));

  assert.equal(isRendererFile(pathToFileURL(path.join(renderer, 'index.html')).href, renderer), true);
  assert.equal(isRendererFile(pathToFileURL(path.join(renderer, 'app.js')).href, renderer), true);
  assert.equal(isRendererFile(pathToFileURL(path.join(root, 'index.html')).href, renderer), false);
  assert.equal(isRendererFile('https://example.com/index.html', renderer), false);
  assert.equal(isRendererFile('file:///etc/passwd', renderer), false);
  assert.equal(
    isRendererFile(`${pathToFileURL(path.join(renderer, 'index.html')).href}?x=1`, renderer),
    false
  );
  assert.equal(
    isRendererFile(`${pathToFileURL(path.join(renderer, 'index.html')).href}#hash`, renderer),
    false
  );
  assert.equal(isRendererFile(pathToFileURL(path.join(renderer, 'link.html')).href, renderer), false);
});
