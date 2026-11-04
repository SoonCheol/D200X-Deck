'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createImageProtocol } = require('../lib/image-protocol');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-image-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function request(url) {
  return { url };
}

test('the image protocol serves content-addressed images with CORS', async (t) => {
  const dir = fixture(t);
  const name = `${'a'.repeat(40)}.png`;
  const body = Buffer.from('fake png bytes');
  fs.writeFileSync(path.join(dir, name), body);
  const handle = createImageProtocol({ imagesDir: dir });

  const response = await handle(request(`ulanzi-image://images/${name}`));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('cache-control'), /immutable/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), body);
});

test('the image protocol rejects missing files and non-image names', async (t) => {
  const dir = fixture(t);
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'text');
  const handle = createImageProtocol({ imagesDir: dir });

  assert.equal((await handle(request('ulanzi-image://images/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'))).status, 404);
  assert.equal((await handle(request('ulanzi-image://images/notes.txt'))).status, 404);
  assert.equal((await handle(request('ulanzi-image://images/..%2Fconfig.json'))).status, 404);
  assert.equal((await handle(request('ulanzi-image://other/notes.txt'))).status, 404);
  assert.equal((await handle(request('file:///etc/passwd'))).status, 404);
});
