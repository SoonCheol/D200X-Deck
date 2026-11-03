'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Market } = require('../lib/market');

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-market-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function response(body, { status = 200, headers = {} } = {}) {
  const data = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    arrayBuffer: async () => data,
    body: null,
  };
}

function redirect(location, status = 302) {
  return response('', { status, headers: { location } });
}

function mockFetch(t, handler) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return handler(String(url), options, calls.length);
  };
  t.after(() => {
    global.fetch = original;
  });
  return calls;
}

test('the session token is stripped on a redirect away from the vendor', async (t) => {
  const market = new Market({ dir: tempDir(t) });
  market.token = 'secret';
  const calls = mockFetch(t, (_url, _options, index) =>
    index === 1 ? redirect('https://evil.example/next', 307) : response({ code: 200, data: [] })
  );

  await market.request('/list');

  assert.equal(calls[0].options.headers.authToken, 'secret');
  assert.equal(calls[1].options.headers.authToken, undefined);
  assert.equal(calls[1].url, 'https://evil.example/next');
});

test('a POST redirect to another origin is rejected before replaying the body', async (t) => {
  const market = new Market({ dir: tempDir(t) });
  mockFetch(t, () => redirect('https://evil.example/next', 307));

  await assert.rejects(
    market.request('/login', { method: 'POST', form: { userName: 'u', password: 'p' } }),
    /credentials request/
  );
});

test('303 turns a form POST into a GET without its content type', async (t) => {
  const market = new Market({ dir: tempDir(t) });
  const calls = mockFetch(t, (_url, _options, index) =>
    index === 1 ? redirect('/next', 303) : response({ code: 200, data: [] })
  );

  await market.request('/login', { method: 'POST', form: { userName: 'u', password: 'p' } });

  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[1].options.method, 'GET');
  assert.equal(calls[1].options.body, undefined);
  assert.equal(calls[1].options.headers['Content-Type'], undefined);
});

test('an HTTP redirect is rejected', async (t) => {
  const market = new Market({ dir: tempDir(t) });
  mockFetch(t, () => redirect('http://ugc.ulanzistudio.com/next', 302));

  await assert.rejects(market.request('/list'), /must use HTTPS/);
});

test('login persists a private token file and logout removes it', async (t) => {
  const market = new Market({ dir: tempDir(t) });
  mockFetch(t, () => response({ code: 200, data: 'token-123' }));

  assert.deepEqual(await market.login('Eduardo', 'password'), {
    signedIn: true,
    user: 'Eduardo',
  });
  assert.equal(market.token, 'token-123');
  assert.equal(fs.existsSync(market.file), true);
  assert.equal(fs.statSync(market.file).mode & 0o777, 0o600);

  market.logout();
  assert.equal(market.session().signedIn, false);
  assert.equal(fs.existsSync(market.file), false);
});

test('download rejects HTML masquerading as a package', async (t) => {
  const market = new Market({ dir: tempDir(t) });
  const destination = path.join(tempDir(t), 'plugin.zip');
  mockFetch(t, () => response('not a zip', { headers: { 'content-type': 'text/html' } }));

  await assert.rejects(
    market.download('https://ugc.ulanzistudio.com/plugin.zip', destination),
    /no longer has this file/
  );
  assert.equal(fs.existsSync(destination), false);
});

test('checkFile reports an HTML response as unavailable', async (t) => {
  const market = new Market({ dir: tempDir(t) });
  mockFetch(t, () => response('', { headers: { 'content-type': 'text/html' } }));

  const result = await market.checkFile('https://ugc.ulanzistudio.com/plugin.zip');

  assert.equal(result.ok, false);
  assert.equal(result.contentType, 'text/html');
});

test('categories and list normalize the store payload', async (t) => {
  const market = new Market({ dir: tempDir(t) });
  mockFetch(t, (url) => {
    if (url.includes('/cateList')) {
      return response({
        code: 200,
        data: [
          { id: 1, nameEn: 'plugins' },
          { id: 2, nameEn: 'lcons' },
          { id: 3, nameEn: 'Other' },
        ],
      });
    }
    return response({
      code: 200,
      count: 1,
      data: [{ id: 9, titleEn: 'Weather', files: 'weather.zip' }],
    });
  });

  assert.deepEqual((await market.categories()).map((category) => category.name), ['plugins', 'Icons']);
  const list = await market.list();
  assert.equal(list.total, 1);
  assert.equal(list.items[0].id, '9');
  assert.equal(list.items[0].name, 'Weather');
  assert.equal(list.items[0].files, 'https://ugc.ulanzistudio.com/weather.zip');
});

test('a store resource exposes cover, banner screenshots and the long description', async (t) => {
  const market = new Market({ dir: tempDir(t) });
  mockFetch(t, () =>
    response({
      code: 200,
      tResources: {
        id: 7,
        titleEn: 'Weather',
        author: 'Dev',
        version: '2.0.1',
        uuid: 'com.test.weather',
        files: '/cdn/weather.zip',
        coverUrl: '/cdn/cover.png',
        banner: '/cdn/shot-1.png, https://cdn.example/shot-2.png ,',
        overviewEn: 'Short <b>summary</b>',
        detailDescEn: '<p>Long <b>text</b></p><ul><li>One</li><li>Two</li></ul>',
      },
    })
  );

  const item = await market.resource(7);

  assert.equal(item.icon, 'https://ugc.ulanzistudio.com/cdn/cover.png');
  assert.deepEqual(item.screenshots, [
    'https://ugc.ulanzistudio.com/cdn/shot-1.png',
    'https://cdn.example/shot-2.png',
  ]);
  assert.equal(item.summary, 'Short summary');
  assert.equal(item.longDescription, 'Long text\n• One\n• Two');
});

test('a resource without a cover uses the first screenshot as its icon', async (t) => {
  const market = new Market({ dir: tempDir(t) });
  mockFetch(t, () =>
    response({
      code: 200,
      tResources: { id: 8, titleEn: 'Icons', banner: '/cdn/only.png', files: '/cdn/icons.zip' },
    })
  );

  const item = await market.resource(8);

  assert.equal(item.icon, 'https://ugc.ulanzistudio.com/cdn/only.png');
  assert.deepEqual(item.screenshots, ['https://ugc.ulanzistudio.com/cdn/only.png']);
  assert.equal(item.longDescription, '');
});

test('a legacy /static cover is resolved against the main site', async (t) => {
  const market = new Market({ dir: tempDir(t) });
  mockFetch(t, () =>
    response({
      code: 200,
      tResources: {
        id: 262,
        titleEn: 'Nanoleaf',
        version: '1.6.1',
        uuid: 'com.ulanzi.ulanzideck.nanoleaf',
        coverUrl: '/static/release/deck/marketplace/plugin/nanoleaf.png',
        banner: '/profile/upload/2025/09/25/1971098156473073666.png',
        files: '',
      },
    })
  );

  const item = await market.resource(262);

  assert.equal(
    item.icon,
    'https://www.ulanzistudio.com/static/release/deck/marketplace/plugin/nanoleaf.png'
  );
  assert.deepEqual(item.screenshots, [
    'https://ugc.ulanzistudio.com/profile/upload/2025/09/25/1971098156473073666.png',
  ]);
});
