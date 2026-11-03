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

test('duplicate profile and page ids are regenerated on validation', () => {
  const config = createDefaultConfig();
  const profile = config.profiles[0];
  config.profiles.push({ id: profile.id, name: 'Duplicate' });
  const page = config.pages[0];
  config.pages.push({ id: page.id, name: 'Duplicate page', profileId: profile.id, keys: {} });
  const valid = validateConfig(config);
  assert.equal(new Set(valid.profiles.map((p) => p.id)).size, valid.profiles.length);
  assert.equal(new Set(valid.pages.map((p) => p.id)).size, valid.pages.length);
});

test('tile faces keep their accent, glyph, text and sizes', () => {
  const config = createDefaultConfig();
  config.pages[0].keys[0] = {
    face: 'tile',
    color: '#1b2130',
    label: 'Fallback',
    tile: {
      accent: '#ff0000',
      glyph: '🐙',
      title: 'GitHub',
      subtitle: 'Open repo',
      glyphSize: 40,
      titleSize: 18,
      subtitleSize: 11,
    },
    action: { type: 'url', value: 'https://github.com' },
  };
  const key = validateConfig(config).pages[0].keys[0];
  assert.equal(key.face, 'tile');
  assert.deepEqual(key.tile, {
    accent: '#ff0000',
    glyph: '🐙',
    title: 'GitHub',
    subtitle: 'Open repo',
    glyphSize: 40,
    titleSize: 18,
    subtitleSize: 11,
  });
});

test('tile glyph colour is kept when valid and dropped otherwise', () => {
  const config = createDefaultConfig();
  config.pages[0].keys[0] = {
    face: 'tile',
    tile: { glyph: '?', glyphColor: '#e5a00d' },
    action: { type: 'none' },
  };
  assert.equal(validateConfig(config).pages[0].keys[0].tile.glyphColor, '#e5a00d');

  config.pages[0].keys[0].tile.glyphColor = 'red';
  assert.equal('glyphColor' in validateConfig(config).pages[0].keys[0].tile, false);
});

test('tile glyphs allow a short string, not just an emoji', () => {
  const config = createDefaultConfig();
  config.pages[0].keys[0] = {
    face: 'tile',
    tile: { glyph: '12345678', title: 'T', subtitle: '' },
    action: { type: 'none' },
  };
  assert.equal(validateConfig(config).pages[0].keys[0].tile.glyph, '12345678');

  config.pages[0].keys[0].tile.glyph = 'x'.repeat(60);
  assert.equal(validateConfig(config).pages[0].keys[0].tile.glyph.length, 40);
});

test('command output settings are validated', () => {
  const config = createDefaultConfig();
  config.pages[0].keys[0] = {
    action: { type: 'command', value: 'status', showOutput: 'yes', outputInterval: 1 },
  };
  const key = validateConfig(config).pages[0].keys[0];
  assert.equal(key.action.showOutput, undefined);
  assert.equal(key.action.outputInterval, undefined);

  config.pages[0].keys[0].action.showOutput = true;
  config.pages[0].keys[0].action.outputInterval = 1;
  const enabled = validateConfig(config).pages[0].keys[0];
  assert.equal(enabled.action.showOutput, true);
  assert.equal(enabled.action.outputInterval, 5);
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

test('Toggle actions are capped at two actions', () => {
  const config = createDefaultConfig();
  config.pages[0].keys[0] = {
    emoji: '',
    label: 'Toggle',
    color: '#1b2130',
    icon: null,
    action: {
      type: 'toggle',
      steps: Array.from({ length: 4 }, () => ({ action: { type: 'text', value: 'x' } })),
    },
  };
  const validated = validateConfig(config);
  assert.equal(validated.pages[0].keys[0].action.steps.length, 2);
});

test('a zero-millisecond delay step remains a delay', () => {
  const config = createDefaultConfig();
  config.pages[0].keys[0] = {
    emoji: '',
    label: 'Wait',
    color: '#1b2130',
    action: { type: 'multi', steps: [{ delay: 0 }] },
  };
  const validated = validateConfig(config);
  assert.deepEqual(validated.pages[0].keys[0].action.steps[0], { delay: 0 });
});

test('reload reads an external edit and refuses an invalid file without overwriting it', () => {
  const dir = tempDir();
  const store = new Store(dir);
  const config = createDefaultConfig();
  store.save(config);
  const edited = JSON.parse(fs.readFileSync(store.file, 'utf8'));
  edited.pages[0].name = 'Edited on disk';
  fs.writeFileSync(store.file, JSON.stringify(edited));

  assert.equal(store.reload().pages[0].name, 'Edited on disk');

  const broken = '{ not json';
  fs.writeFileSync(store.file, broken);
  const previous = store.config;
  assert.throws(() => store.reload());
  assert.equal(fs.readFileSync(store.file, 'utf8'), broken, 'a failed reload must not write defaults');
  assert.equal(store.config, previous, 'a failed reload keeps the running config');
  assert.equal(fs.readFileSync(`${store.file}.rejected`, 'utf8'), broken);

  fs.writeFileSync(store.file, JSON.stringify({ pages: [null] }));
  assert.throws(() => store.reload(), /no usable pages/);
  assert.equal(store.config, previous, 'parseable but unusable input is rejected too');

  fs.rmSync(dir, { recursive: true, force: true });
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
    font: { size: 26, weight: 700, align: 'center', color: '#7fd1ff', showLabel: false },
  };
  config.settings.lockScreen = true;
  config.settings.lockImage = png;
  store.save(config);
  const loaded = store.load();
  assert.deepEqual(loaded.pages[0].keys[0].font, {
    size: 26,
    weight: 700,
    align: 'center',
    color: '#7fd1ff',
    showLabel: false,
  });
  assert.equal(loaded.settings.lockScreen, true);
  assert.equal(loaded.settings.launchAtLogin, false);
  assert.match(loaded.settings.lockImage, /^data:image\/png/);
});

test('text and caption styles are bounded and survive save/load', () => {
  const dir = tempDir();
  const store = new Store(dir);
  const config = createDefaultConfig();
  config.pages[0].keys[0] = {
    emoji: 'Hi',
    label: 'Cap',
    color: '#1b2130',
    icon: null,
    action: { type: 'none' },
    font: {
      size: 26,
      weight: 800,
      align: 'right',
      color: '#7fd1ff',
      showLabel: true,
      family: 'georgia',
      background: 'solid',
    },
    textStyle: { family: 'menlo', weight: 800, color: '#ff0000' },
  };
  store.save(config);

  const key = store.load().pages[0].keys[0];
  assert.deepEqual(key.font, {
    size: 26,
    weight: 700,
    align: 'right',
    color: '#7fd1ff',
    showLabel: true,
    family: 'georgia',
    background: 'solid',
  });
  assert.deepEqual(key.textStyle, {
    family: 'menlo',
    weight: 700,
    color: '#ff0000',
  });
});

test('invalid text styles fall back to safe values', () => {
  const config = createDefaultConfig();
  config.pages[0].keys[0] = {
    emoji: 'Hi',
    label: 'Cap',
    color: '#1b2130',
    icon: null,
    action: { type: 'none' },
    font: { family: 'comic', background: 'stars' },
    textStyle: { family: 'comic', weight: 5000, color: 'red' },
  };

  const key = validateConfig(config).pages[0].keys[0];

  assert.equal(key.font.family, 'system');
  assert.equal(key.font.background, 'gradient');
  assert.deepEqual(key.textStyle, {
    family: 'system',
    weight: 700,
    color: '#ffffff',
  });
});

test('a plugin caption is explicit and survives save/load', () => {
  const dir = tempDir();
  const store = new Store(dir);
  const config = createDefaultConfig();
  config.pages[0].keys[0] = {
    emoji: '',
    label: 'Claude',
    color: '#1b2130',
    icon: null,
    action: { type: 'plugin', plugin: 'com.example.claude', action: 'run', actionid: 'a1', settings: {} },
    font: { showLabel: true, captionExplicit: true },
  };
  config.pages[0].keys[1] = {
    ...config.pages[0].keys[0],
    font: { showLabel: true },
  };
  store.save(config);
  const loaded = store.load();
  assert.equal(loaded.pages[0].keys[0].font.captionExplicit, true);
  assert.equal(loaded.pages[0].keys[1].font.showLabel, true);
  assert.equal(loaded.pages[0].keys[1].font.captionExplicit, undefined);
});

test('a cleared icon keeps its face and suppresses automatic icons', () => {
  const dir = tempDir();
  const store = new Store(dir);
  const config = createDefaultConfig();
  config.pages[0].keys[0] = {
    emoji: 'S',
    label: '',
    color: '#1b2130',
    icon: null,
    iconCleared: true,
    face: 'icon',
    action: { type: 'app', value: '/Applications/Safari.app' },
  };
  store.save(config);
  const loaded = new Store(dir).load();
  const key = loaded.pages[0].keys[0];
  assert.equal(key.iconCleared, true);
  assert.equal(key.face, 'icon');
  assert.equal(key.icon, null);
});

test('a page keeps its wide-key mode across a save', () => {
  const dir = tempDir();
  const store = new Store(dir);
  const config = createDefaultConfig();
  config.pages[0].wideMode = 'stats';
  store.save(config);
  const loaded = new Store(dir).load();
  assert.equal(loaded.pages[0].wideMode, 'stats');

  config.pages[0].wideMode = 'nonsense';
  store.save(config);
  assert.equal(new Store(dir).load().pages[0].wideMode, undefined);
});

test('a key keeps its icon/text face across a save', () => {
  const dir = tempDir();
  const store = new Store(dir);
  const config = createDefaultConfig();
  config.pages[0].keys[0] = {
    emoji: 'S',
    label: '',
    color: '#1b2130',
    icon: 'data:image/png;base64,YQ==',
    face: 'text',
    action: { type: 'app', value: '/Applications/Safari.app' },
  };
  store.save(config);
  const onDisk = JSON.parse(fs.readFileSync(store.file, 'utf8'));
  assert.equal(onDisk.pages[0].keys[0].face, 'text');

  const loaded = new Store(dir).load();
  assert.equal(loaded.pages[0].keys[0].face, 'text');
});

test('orphaned images are pruned while current and backup references stay', () => {
  const dir = tempDir();
  const store = new Store(dir);
  const config = createDefaultConfig();
  config.pages[0].keys[0] = {
    emoji: '',
    label: 'A',
    color: '#1b2130',
    icon: 'data:image/png;base64,YQ==',
    action: { type: 'none' },
  };
  config.pages[0].keys[1] = {
    emoji: '',
    label: 'B',
    color: '#1b2130',
    icon: 'data:image/png;base64,Yg==',
    action: { type: 'none' },
  };
  store.save(config);
  let onDisk = JSON.parse(fs.readFileSync(store.file, 'utf8'));
  const first = onDisk.pages[0].keys[0].icon.slice(5);
  const second = onDisk.pages[0].keys[1].icon.slice(5);
  assert.ok(fs.existsSync(path.join(store.imagesDir, first)));
  assert.ok(fs.existsSync(path.join(store.imagesDir, second)));

  delete config.pages[0].keys[0];
  store.save(config);
  assert.ok(fs.existsSync(path.join(store.imagesDir, first)), 'the .bak still references it');

  store.save(config);
  assert.equal(fs.existsSync(path.join(store.imagesDir, first)), false);
  assert.ok(fs.existsSync(path.join(store.imagesDir, second)));
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

test('state, pinned, profile and lock images stay file-backed', () => {
  const dir = tempDir();
  const store = new Store(dir);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const svg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';
  const key = (icon) => ({
    emoji: '',
    label: '',
    color: '#1b2130',
    icon,
    action: { type: 'none' },
    states: [{ icon: svg }, { icon: svg }],
  });
  const config = createDefaultConfig();
  config.pages[0].keys[0] = key(png);
  config.pages[0].background = png;
  config.profiles[0].background = png;
  config.profiles[0].pinned = { 1: key(png) };
  config.settings.lockImage = svg;
  config.settings.standbyImage = png;
  store.save(config);

  const onDisk = JSON.parse(fs.readFileSync(store.file, 'utf8'));
  assert.match(onDisk.pages[0].keys[0].icon, /^file:/);
  assert.match(onDisk.pages[0].keys[0].states[0].icon, /^file:/);
  assert.match(onDisk.pages[0].background, /^file:/);
  assert.match(onDisk.profiles[0].background, /^file:/);
  assert.match(onDisk.profiles[0].pinned[1].icon, /^file:/);
  assert.match(onDisk.profiles[0].pinned[1].states[0].icon, /^file:/);
  assert.match(onDisk.settings.lockImage, /^file:.*\.svg$/);
  assert.equal(onDisk.settings.lockImage.includes('data:image'), false);

  const loaded = store.load();
  assert.equal(loaded.pages[0].keys[0].icon, png);
  assert.equal(loaded.pages[0].keys[0].states[0].icon, svg);
  assert.equal(loaded.pages[0].background, png);
  assert.equal(loaded.profiles[0].background, png);
  assert.equal(loaded.profiles[0].pinned[1].icon, png);
  assert.equal(loaded.profiles[0].pinned[1].states[0].icon, svg);
  assert.equal(loaded.settings.lockImage, svg);
});

test('a missing or traversing file image becomes null on load', () => {
  const dir = tempDir();
  const store = new Store(dir);
  fs.mkdirSync(path.join(dir, 'Images'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'outside.png'), 'outside');
  const config = createDefaultConfig();
  config.pages[0].keys[0] = {
    emoji: '',
    label: '',
    color: '#1b2130',
    icon: 'file:../outside.png',
    action: { type: 'none' },
  };
  store.save(config);

  const loaded = store.load();
  assert.equal(loaded.pages[0].keys[0].icon, null);
});

test('one malformed page is dropped instead of discarding the config', () => {
  const config = createDefaultConfig();
  const good = config.pages[0];
  const validated = validateConfig({ ...config, pages: [null, good, 'nope', undefined] });
  assert.equal(validated.pages.length, 1);
  assert.equal(validated.pages[0].id, good.id);
});

test('load reports a backup recovery once', () => {
  const dir = tempDir();
  const file = path.join(dir, 'config.json');
  const good = createDefaultConfig();
  fs.writeFileSync(`${file}.bak`, JSON.stringify(good));
  fs.writeFileSync(file, '{ this is not json');

  const store = new Store(dir);
  store.load();
  assert.equal(store.takeRecovery(), 'backup');
  assert.equal(store.takeRecovery(), null, 'the notice is one-shot');
});

test('load reports a reset when the backup is unusable too', () => {
  const dir = tempDir();
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, '{ this is not json');
  fs.writeFileSync(`${file}.bak`, 'also not json');

  const store = new Store(dir);
  store.load();
  assert.equal(store.takeRecovery(), 'defaults');
});
