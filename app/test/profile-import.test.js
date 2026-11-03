'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { planProfileImport } = require('../lib/profile-import');

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

function remapKeys(keys, idMap) {
  const out = {};
  for (const [slot, key] of Object.entries(keys || {})) {
    out[slot] = JSON.parse(JSON.stringify(key));
    if (out[slot].action?.type === 'page' && idMap.has(out[slot].action.value)) {
      out[slot].action.value = idMap.get(out[slot].action.value);
    }
  }
  return out;
}

const data = {
  format: 'ulanzi-deck-open-profile',
  name: 'Marcelo',
  profile: { name: 'Marcelo', appPath: '/Applications/Safari.app', background: 'bg', pinned: {} },
  pages: [
    { id: 'p1', name: 'Main', keys: { 0: { action: { type: 'text', value: 'hi' } } } },
    { id: 'p2', name: 'Apps', parentId: 'p1', keys: {} },
  ],
};

test('a new profile is imported with remapped page ids', () => {
  const plan = planProfileImport(data, {
    profiles: [],
    pages: [],
    uuid: ids(),
    basename: (p) => p.split('/').pop(),
    remapKeys,
  });

  assert.equal(plan.replaced, false);
  assert.equal(plan.name, 'Marcelo');
  assert.equal(plan.profiles.length, 1);
  assert.equal(plan.profiles[0].appName, 'Safari.app');
  assert.equal(plan.pages.length, 2);
  assert.notEqual(plan.pages[0].id, 'p1');
  assert.equal(plan.pages[1].parentId, plan.pages[0].id);
  assert.equal(plan.activePageId, plan.pages[0].id);
});

test('a colliding name gets a suffix when replace is off', () => {
  const plan = planProfileImport(data, {
    profiles: [{ id: 'old', name: 'Marcelo' }],
    pages: [{ id: 'old-page', profileId: 'old', keys: {} }],
    uuid: ids(),
    basename: (p) => p.split('/').pop(),
    remapKeys,
  });

  assert.equal(plan.replaced, false);
  assert.equal(plan.name, 'Marcelo (2)');
  assert.equal(plan.profiles.length, 2);
  assert.equal(plan.pages.some((page) => page.id === 'old-page'), true, 'existing pages are kept');
});

test('replace keeps the profile id and name and removes only its pages', () => {
  const plan = planProfileImport(data, {
    profiles: [
      { id: 'old', name: 'Marcelo', icon: 'old-icon', appPath: '/old', pinned: { 0: {} } },
      { id: 'other', name: 'Other' },
    ],
    pages: [
      { id: 'old-page', profileId: 'old', keys: {} },
      { id: 'other-page', profileId: 'other', keys: {} },
    ],
    uuid: ids(),
    basename: (p) => p.split('/').pop(),
    remapKeys,
    replace: true,
  });

  assert.equal(plan.replaced, true);
  assert.equal(plan.name, 'Marcelo');
  assert.equal(plan.profiles.length, 2);
  const profile = plan.profiles.find((p) => p.id === 'old');
  assert.equal(profile.appPath, '/Applications/Safari.app');
  assert.equal(profile.icon, undefined, 'old icon is replaced');
  assert.equal(plan.pages.some((page) => page.id === 'old-page'), false);
  assert.equal(plan.pages.some((page) => page.id === 'other-page'), true);
  assert.equal(plan.pages.filter((page) => page.profileId === 'old').length, 2);
});

test('invalid profile payloads are rejected', () => {
  assert.throws(() => planProfileImport({ format: 'nope', pages: [] }), /Not a valid/);
  assert.throws(
    () =>
      planProfileImport(
        { format: 'ulanzi-deck-open-profile', pages: [null] },
        { uuid: ids(), basename: () => '', remapKeys }
      ),
    /no usable pages/
  );
});
