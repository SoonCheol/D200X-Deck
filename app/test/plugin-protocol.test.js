'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createPluginProtocol } = require('../lib/plugin-protocol');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-protocol-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>inspector</body></html>');
  fs.writeFileSync(path.join(dir, 'app.js'), 'console.log(1)');
  return dir;
}

function handlerFor(dir, transformHtml) {
  return createPluginProtocol({
    getPluginDir: (folder) => (folder === 'plug' ? dir : null),
    transformHtml,
  });
}

test('serves a file from the plugin directory with its MIME type', async () => {
  const dir = fixture();
  const handler = handlerFor(dir);
  const res = await handler(new Request('ulanzi-pi://local/plug/app.js'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/javascript');
  assert.equal(await res.text(), 'console.log(1)');
});

test('runs the HTML transform for .html files only', async () => {
  const dir = fixture();
  const handler = handlerFor(dir, (html) => html.replace('</body>', '<b>bridge</b></body>'));
  const html = await (await handler(new Request('ulanzi-pi://local/plug/index.html'))).text();
  assert.match(html, /<b>bridge<\/b>/);
  const js = await (await handler(new Request('ulanzi-pi://local/plug/app.js'))).text();
  assert.equal(js, 'console.log(1)');
});

test('refuses paths that escape the plugin directory', async () => {
  const dir = fixture();
  const handler = handlerFor(dir);
  const escaped = await handler(new Request('ulanzi-pi://local/plug/a%2f..%2f..%2fetc/passwd'));
  assert.equal(escaped.status, 403);
  // The URL parser folds a literal "../" before the handler sees it, which
  // lands on an unknown plugin folder rather than escaping.
  const folded = await handler(new Request('ulanzi-pi://local/plug/%2e%2e/%2e%2e/etc/passwd'));
  assert.equal(folded.status, 404);
});

test('returns 404 for an unknown plugin folder', async () => {
  const dir = fixture();
  const handler = handlerFor(dir);
  const res = await handler(new Request('ulanzi-pi://local/other/index.html'));
  assert.equal(res.status, 404);
});

test('refuses a symlink that points outside the plugin directory', async (t) => {
  const dir = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-protocol-outside-'));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(outside, 'secret.html'), 'secret');
  fs.symlinkSync(path.join(outside, 'secret.html'), path.join(dir, 'link.html'));
  const handler = handlerFor(dir);

  const res = await handler(new Request('ulanzi-pi://local/plug/link.html'));

  assert.equal(res.status, 403);
});
