'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../renderer/import-ui.js'), 'utf8');

function fakeNode() {
  const classes = new Set();
  return {
    innerHTML: '',
    textContent: '',
    value: 'new',
    disabled: false,
    classes,
    classList: {
      add: (...n) => n.forEach((c) => classes.add(c)),
      remove: (...n) => n.forEach((c) => classes.delete(c)),
      toggle(name, force) {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
      contains: (n) => classes.has(n),
    },
    querySelectorAll: () => [],
  };
}

function makeHarness({ profiles }) {
  const nodes = new Map();
  const applied = [];
  const $ = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, fakeNode());
    return nodes.get(selector);
  };
  const context = {
    $,
    window: {},
    state: {
      config: { activeProfileId: 'p1', profiles: [{ id: 'p1', name: 'Default Profile' }] },
    },
    esc: (v) => String(v ?? ''),
    confirmAction: async () => true,
    renderAll() {},
    syncPlugins() {},
    toast() {},
    api: {
      importApply: async (payload) => {
        applied.push(payload);
        return { ok: true, importedPages: 1, importedKeys: 0 };
      },
      getState: async () => ({ config: {}, status: {} }),
      importScan: async () => ({ ok: true, profiles }),
      importPreview: async () => ({
        ok: true,
        profiles: [{ pages: [{ id: 'p1', name: 'Page 1', keys: {} }] }],
      }),
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, $, applied };
}

const studio = { name: 'Default Profile', device: 'D200', path: '/studio/a', pages: [{}, {}] };

test('live Studio profiles sit under a heading that names their source', async () => {
  const { context, $ } = makeHarness({ profiles: [studio] });
  await context.openImportModal();
  assert.match($('#import-sources').innerHTML, /Ulanzi Studio on this Mac/);
  assert.doesNotMatch($('#import-sources').innerHTML, /From file/);
});

test('a chosen file is listed under From file with its name', async () => {
  const { context, $ } = makeHarness({ profiles: [studio] });
  await context.openImportModal();
  context.addImportFile({
    file: '/Users/me/Downloads/work.ulanziDeckProfile',
    profiles: [{ name: 'Work', device: 'D200', path: '/Users/me/Downloads/work.ulanziDeckProfile', pages: [{}] }],
  });
  const html = $('#import-sources').innerHTML;
  assert.match(html, /From file/);
  assert.match(html, /work\.ulanziDeckProfile/);
});

test('with no Studio profiles the dialog says so and makes Choose file the main action', async () => {
  const { context, $ } = makeHarness({ profiles: [] });
  await context.openImportModal();
  assert.match($('#import-sources').innerHTML, /not installed or has no profiles yet/);
  assert.ok($('#import-pick').classes.has('primary'));
  assert.ok($('#import-mode-row').classes.has('hidden'));
  assert.equal($('#import-run').disabled, true);
});

test('the Mode row appears once a profile is selected', async () => {
  const { context, $ } = makeHarness({ profiles: [studio] });
  await context.openImportModal();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal($('#import-mode-row').classes.has('hidden'), false);
  assert.ok(!$('#import-pick').classes.has('primary'));
});

test('a new profile can be named, pre-filled with the Studio name', async () => {
  const { context, $, applied } = makeHarness({ profiles: [studio] });
  await context.openImportModal();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal($('#import-name').value, 'Default Profile');
  assert.equal($('#import-name-row').classes.has('hidden'), false);

  $('#import-name').value = 'Studio import';
  await context.runImport();
  assert.equal(applied[0].name, 'Studio import');
  assert.equal(applied[0].mode, 'new');
});

test('the name field hides for merge and replace, and Replace names the profile it wipes', async () => {
  const { context, $ } = makeHarness({ profiles: [studio] });
  await context.openImportModal();
  await new Promise((resolve) => setImmediate(resolve));
  $('#import-mode').value = 'replace';
  context.syncImportChrome();
  assert.equal($('#import-name-row').classes.has('hidden'), true);
  assert.match($('#import-mode-replace').textContent, /pages of “Default Profile”/);
});
