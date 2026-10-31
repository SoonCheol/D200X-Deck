'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Store, createDefaultConfig, validateConfig } = require('../lib/store');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-store-test-'));
}

test('createDefaultConfig is valid and has no wide key', () => {
  const config = createDefaultConfig();
  assert.ok(Array.isArray(config.pages) && config.pages.length > 0);
  for (const page of config.pages) {
    assert.equal(page.keys[13], undefined);
    assert.equal(page.keys[14], undefined);
  }
});

test('POP menus are capped at nine actions', () => {
  const config = createDefaultConfig();
  config.pages[0].keys[0] = {
    emoji: '',
    label: 'POP',
    color: '#1b2130',
    icon: null,
    action: {
      type: 'pop',
      steps: Array.from({ length: 12 }, () => ({ action: { type: 'text', value: '👍' } })),
    },
  };
  const validated = validateConfig(config);
  assert.equal(validated.pages[0].keys[0].action.steps.length, 9);
});

test('caption fonts and lock-screen settings survive save/load', () => {
  const dir = tempDir();
  const store = new Store(dir);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const config = createDefaultConfig();
  config.pages[0].keys[0] = {
    emoji: '🚀',
    label: 'Launch',
    color: '#1b2130',
    icon: null,
    action: { type: 'none' },
    font: { size: 26, weight: 800, align: 'center', color: '#7fd1ff', showLabel: false },
  };
  config.settings.lockScreen = true;
  config.settings.lockImage = png;
  store.save(config);
  const loaded = store.load();
  assert.deepEqual(loaded.pages[0].keys[0].font, {
    size: 26,
    weight: 800,
    align: 'center',
    color: '#7fd1ff',
    showLabel: false,
  });
  assert.equal(loaded.settings.lockScreen, true);
  assert.equal(loaded.settings.launchAtLogin, false);
  assert.match(loaded.settings.lockImage, /^data:image\/png/);
});

test('parents stay inside the profile and cycles are dropped', () => {
  const config = createDefaultConfig();
  const [first, second] = config.pages;
  second.parentId = first.id;
  second.autoExitSeconds = 30;
  const valid = validateConfig(config);
  assert.equal(valid.pages.find((p) => p.id === second.id).parentId, first.id);
  assert.equal(valid.pages.find((p) => p.id === second.id).autoExitSeconds, 30);

  first.parentId = second.id;
  const cyclic = validateConfig(config);
  assert.equal(cyclic.pages.find((p) => p.id === first.id).parentId, undefined);

  config.profiles.push({ id: 'other', name: 'Other' });
  config.pages.push({ id: 'other-page', name: 'Other page', profileId: 'other', keys: {} });
  second.parentId = 'other-page';
  const cross = validateConfig(config);
  assert.equal(cross.pages.find((p) => p.id === second.id).parentId, undefined);
});

test('migration drops legacy wide-key slots and rewrites open actions', () => {
  const dir = tempDir();
  const store = new Store(dir);
  const config = {
    version: 1,
    pages: [
      {
        id: 'p1',
        name: 'Main',
        keys: {
          0: { emoji: '🌐', label: 'Site', action: { type: 'open', value: 'https://example.com' } },
          1: { emoji: '🧭', label: 'Safari', action: { type: 'open', value: 'Safari' } },
          13: { emoji: '🎛', label: 'Wide' },
          14: { emoji: '🎛', label: 'Old' },
        },
      },
    ],
    activePageId: 'p1',
  };
  const migrated = store._migrate(config);
  assert.equal(migrated.version, 6);
  assert.ok(migrated.profiles.length >= 1);
  assert.ok(migrated.pages.every((p) => p.profileId === migrated.profiles[0].id));
  assert.equal(migrated.pages[0].keys[13], undefined);
  assert.equal(migrated.pages[0].keys[14], undefined);
  assert.equal(migrated.pages[0].keys[0].action.type, 'url');
  assert.equal(migrated.pages[0].keys[1].action.type, 'app');
});

test('a corrupt config falls back to the backup', () => {
  const dir = tempDir();
  const file = path.join(dir, 'config.json');
  const good = createDefaultConfig();
  good.pages[0].name = 'Backup page';
  fs.writeFileSync(`${file}.bak`, JSON.stringify(good));
  fs.writeFileSync(file, '{ this is not json');

  const store = new Store(dir);
  store.load();
  assert.equal(store.config.pages[0].name, 'Backup page');
  assert.ok(fs.existsSync(`${file}.corrupt`), 'broken file is preserved for inspection');
});

test('key images are stored as files, not inside config.json', () => {
  const dir = tempDir();
  const store = new Store(dir);
  store.load();
  const png = Buffer.from('fake-png-bytes').toString('base64');
  store.config.pages[0].keys[0] = {
    emoji: '', label: '', color: '#1b2130',
    icon: `data:image/png;base64,${png}`,
    action: { type: 'none' },
  };
  store.save(store.config);

  const raw = fs.readFileSync(path.join(dir, 'config.json'), 'utf8');
  assert.equal(raw.includes('data:image'), false, 'config must not embed base64 images');
  const files = fs.readdirSync(path.join(dir, 'Images'));
  assert.equal(files.length, 1);

  const reloaded = new Store(dir);
  reloaded.load();
  assert.match(reloaded.config.pages[0].keys[0].icon, /^data:image\/png;base64,/);
});

test('a profile without pages gets a default page on load', () => {
  const dir = tempDir();
  const store = new Store(dir);
  const config = {
    version: 6,
    settings: { brightness: 80, sleepSeconds: 0, autoPush: true },
    profiles: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }],
    activeProfileId: 'p2',
    pages: [{ id: 'page1', name: 'Only', profileId: 'p1', keys: {} }],
    activePageId: 'page1',
  };
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config));
  store.load();
  const two = store.config.pages.filter((p) => p.profileId === 'p2');
  assert.equal(two.length, 1, 'the empty profile gets a page');
  assert.equal(store.config.activePageId, two[0].id, 'active page belongs to the active profile');
});

test('pinned keys, backgrounds and standby settings survive save/load', () => {
  const dir = tempDir();
  const store = new Store(dir);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const config = createDefaultConfig();
  config.settings.standbySeconds = 45;
  config.settings.standbyImage = png;
  config.profiles[0].pinned = {
    4: { emoji: '⏱️', label: 'Timer', action: { type: 'timer', seconds: 60, sound: false } },
  };
  config.pages[0].background = png;
  store.save(config);

  const onDisk = JSON.parse(fs.readFileSync(store.file, 'utf8'));
  assert.equal(onDisk.settings.standbySeconds, 45);
  assert.match(onDisk.settings.standbyImage, /^file:/);
  assert.match(onDisk.pages[0].background, /^file:/);
  assert.equal(onDisk.profiles[0].pinned[4].action.type, 'timer');

  const loaded = store.load();
  assert.equal(loaded.settings.standbySeconds, 45);
  assert.match(loaded.settings.standbyImage, /^data:image\/png/);
  assert.match(loaded.pages[0].background, /^data:image\/png/);
  assert.equal(loaded.profiles[0].pinned[4].action.seconds, 60);
});
