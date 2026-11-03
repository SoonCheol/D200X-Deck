'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { fetchLatestRelease, isNewer, plainNotes, releaseNotes } = require('../lib/updates');

function releaseResponse(overrides = {}) {
  return new Response(
    JSON.stringify({
      tag_name: 'v0.3.0',
      html_url: 'https://github.com/edufalcao/ulanzi-deck-open/releases/tag/v0.3.0',
      body: '## Changes\n\n### Features\n- **Store** thing\n- Another thing\n\n---\n\nUnsigned build notes',
      published_at: '2026-11-02T10:00:00Z',
      assets: [
        { name: 'Ulanzi-Deck-Open-0.3.0.dmg' },
        { name: 'SHA256SUMS.txt' },
      ],
      ...overrides,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

test('reads the latest release and its DMG asset', async () => {
  const release = await fetchLatestRelease({ fetchImpl: async () => releaseResponse() });
  assert.equal(release.version, '0.3.0');
  assert.equal(release.dmg, 'Ulanzi-Deck-Open-0.3.0.dmg');
  assert.match(release.url, /releases\/tag\/v0\.3\.0$/);
  assert.equal(isNewer(release.version, '0.2.0'), true);
  assert.equal(isNewer(release.version, '0.3.0'), false);
  assert.equal(isNewer(release.version, '0.4.0'), false);
});

test('treats a repository without releases as up to date', async () => {
  const release = await fetchLatestRelease({
    fetchImpl: async () => ({ status: 404, ok: false, statusText: 'Not Found' }),
  });
  assert.equal(release, null);
});

test('throws on other HTTP failures', async () => {
  await assert.rejects(
    fetchLatestRelease({ fetchImpl: async () => ({ status: 500, ok: false, statusText: 'Server Error' }) }),
    /500/
  );
});

test('rejects malformed release JSON and a release without a version', async () => {
  await assert.rejects(
    fetchLatestRelease({ fetchImpl: async () => new Response('{bad', { status: 200 }) }),
    /JSON/
  );
  await assert.rejects(
    fetchLatestRelease({ fetchImpl: async () => releaseResponse({ tag_name: '', name: '' }) }),
    /no version/i
  );
});

test('aborts a stalled release request at the timeout', async () => {
  const fetchImpl = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    });

  await assert.rejects(fetchLatestRelease({ fetchImpl, timeout: 5 }), /aborted/);
});

test('flattens release notes for the dialog and drops the build footer', () => {
  const body = '## Changes\n\n### Features\n- **Store** thing\n- `code` thing\n\n---\n\nUnsigned build notes';
  assert.equal(releaseNotes(body), '## Changes\n\n### Features\n- **Store** thing\n- `code` thing');
  assert.equal(plainNotes(body), 'Features\n• Store thing\n• code thing');
  assert.equal(plainNotes('x'.repeat(2000)).length, 2000);
  assert.match(plainNotes('x'.repeat(2000), 1200), /…$/);
});
