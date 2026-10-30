'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { convertHotkey, parseProfile, mapAction } = require('../lib/import-ulanzi');

test('hotkey glyphs convert to our syntax', () => {
  assert.equal(convertHotkey('⌃ ⌘ Q'), 'ctrl+cmd+q');
  assert.equal(convertHotkey('⇧ ⌘ 5'), 'cmd+shift+5');
  assert.equal(convertHotkey('⌥ ⇧  W'), 'alt+shift+w');
  assert.equal(convertHotkey('⌘ V'), 'cmd+v');
  assert.equal(convertHotkey('F5'), 'f5');
  assert.equal(convertHotkey(''), null);
});

test('system actions map to our action types', () => {
  const media = mapAction({ Action: 'com.ulanzi.ulanzideck.system.multimedia', ActionParam: { Hotkey: 'Volumn_Mute' } }, new Set());
  assert.deepEqual(media.action, { type: 'media', op: 'mute' });

  const site = mapAction({ Action: 'com.ulanzi.ulanzideck.system.website', ActionParam: { Url: 'https://example.com' } }, new Set());
  assert.deepEqual(site.action, { type: 'url', value: 'https://example.com' });

  const page = mapAction({ Action: 'com.ulanzi.ulanzideck.page.next' }, new Set());
  assert.deepEqual(page.action, { type: 'page', op: 'next' });

  const plugin = mapAction(
    { Action: 'com.example.plugin.run', Plugin: { UUID: 'com.example.plugin' }, ActionParam: { a: 1 } },
    new Set()
  );
  assert.equal(plugin.action.type, 'plugin');
  assert.equal(plugin.action.settings.a, 1);
});

test('POP keys become pop menus with their child actions', () => {
  const mapped = mapAction(
    {
      Action: 'com.ulanzi.deck.popkey.pop',
      ActionParam: {
        Actions: [
          { Action: 'com.ulanzi.ulanzideck.system.text', ActionParam: { Text: '👍' } },
          { Action: 'com.ulanzi.ulanzideck.system.text', ActionParam: { Text: '👎' } },
        ],
      },
    },
    new Set()
  );
  assert.equal(mapped.action.type, 'pop');
  assert.equal(mapped.action.steps.length, 2);
  assert.deepEqual(mapped.action.steps[0].action, { type: 'text', value: '👍', enter: false });

  const many = mapAction(
    {
      Action: 'com.ulanzi.deck.popkey.pop',
      ActionParam: {
        Actions: Array.from({ length: 12 }, () => ({
          Action: 'com.ulanzi.ulanzideck.system.text',
          ActionParam: { Text: '👍' },
        })),
      },
    },
    new Set()
  );
  assert.equal(many.action.steps.length, 9);
});

test('parseProfile maps slots, skips the wide key and keeps plugin settings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-import-test-'));
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ Name: 'Test', Device: { Model: 'D200' }, Pages: { Current: 'p1', Pages: ['p1'] } })
  );
  const pageDir = path.join(dir, 'Profiles', 'p1');
  fs.mkdirSync(pageDir, { recursive: true });
  fs.writeFileSync(
    path.join(pageDir, 'manifest.json'),
    JSON.stringify({
      Name: '',
      Controllers: [
        {
          Type: 'Keypad',
          Actions: {
            '0_0': { Action: 'com.ulanzi.ulanzideck.system.hotkey', ActionParam: { Hotkey: '⌘ V' } },
            '2_1': {
              Action: 'com.example.plugin.run',
              Plugin: { UUID: 'com.example.plugin' },
              ActionParam: { city: 'Example City' },
              ViewParam: [{ Text: 'Weather' }],
            },
            '3_2': { Action: 'com.ulanzi.smallwindow.window', ActionParam: { SmallViewMode: 1 } },
          },
        },
      ],
    })
  );

  const parsed = parseProfile(dir);
  assert.equal(parsed.name, 'Test');
  assert.equal(parsed.pages.length, 1);
  const keys = parsed.pages[0].keys;
  assert.equal(keys[0].action.type, 'hotkey');
  assert.equal(keys[7].action.type, 'plugin');
  assert.equal(keys[7].action.settings.city, 'Example City');
  assert.equal(keys[7].label, 'Weather');
  assert.equal(keys[13], undefined);
  assert.ok(parsed.report.skipped.some((s) => s.slot === '3_2'));
});
