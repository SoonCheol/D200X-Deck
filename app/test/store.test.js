'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Store, createDefaultConfig } = require('../lib/store');

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
  assert.equal(migrated.version, 4);
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
