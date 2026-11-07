'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const textStyle = require('../lib/text-style');
const source = fs.readFileSync(path.join(__dirname, '../renderer/inspector.js'), 'utf8');

function node() {
  const classes = new Set();
  return {
    innerHTML: '',
    value: '',
    checked: false,
    disabled: false,
    hidden: false,
    textContent: '',
    dataset: {},
    children: [],
    handlers: {},
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      toggle(name, force) {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
      contains(name) { return classes.has(name); },
    },
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    getAttribute(name) {
      return this[name];
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    focus() {},
    appendChild() {},
    click() {},
  };
}

function makeHarness() {
  const inspector = node();
  const nodes = new Map([['#inspector', inspector]]);
  const calls = { drawIndex: 0, commit: 0 };
  const key = {
    face: 'text',
    emoji: 'BC',
    label: 'cap',
    color: '#1b2130',
    icon: null,
    action: { type: 'none' },
    textStyle: { family: 'system', weight: 700, color: '#ffffff' },
    font: {
      size: 17,
      weight: 400,
      align: 'left',
      color: '#ffffff',
      showLabel: true,
      family: 'system',
      background: 'gradient',
    },
  };
  const page = { id: 'page', profileId: 'profile', keys: { 0: key }, parentId: null };
  const config = {
    activeProfileId: 'profile',
    activePageId: 'page',
    profiles: [{ id: 'profile', name: 'Default', pinned: {} }],
    pages: [page],
    settings: { brightness: 50 },
  };
  const state = { selected: 0, config, plugins: [] };
  const context = {
    $: (selector) => {
      if (!nodes.has(selector)) nodes.set(selector, node());
      return nodes.get(selector);
    },
    document: { getElementById: () => null },
    window: {
      innerWidth: 1000,
      DeckActions: { ACTION_GROUPS: [['System', ['none']]], TRIGGER_GROUPS: [['Basic', ['none']]] },
      KeyRenderer: {},
    },
    state,
    DeckTextStyle: textStyle,
    ACTION_LABELS: { none: 'Do nothing' },
    esc: (value) => String(value ?? ''),
    api: {},
    LEGACY_DEFAULT_EMOJI: new Set(),
    WIDE_KEY_INDEX: 13,
    COLS: 5,
    KEY_COUNT: 13,
    pluginImages: new Map(),
    pluginStateImages: new Map(),
    activePage: () => page,
    ensureKey: () => key,
    effectiveKey: () => key,
    pinnedFor: () => ({}),
    isPinnedSlot: () => false,
    backgroundFor: () => null,
    autoIconFor: () => null,
    drawIndex: () => {
      calls.drawIndex += 1;
    },
    commit: () => {
      calls.commit += 1;
    },
    renderAll() {},
    renderGrid() {},
    renderPageList() {},
    scheduleSave() {},
    scheduleAutoExit() {},
    syncPlugins() {},
    openStoreModal() {},
    openIconLibrary() {},
    openAppPicker() {},
    openHotkeyModal() {},
    confirmAction() {},
    toast() {},
    navigate() {},
    addPage() {},
    addSubpage() {},
    addOpenKeyForPage() {},
    refreshWideStats() {},
    setKeyIconFromLibrary() {},
    pickImageData: async () => null,
    capturePageImage: async () => null,
    downscaleBackground: async (value) => value,
    downscaleImage: async (value) => value,
    readFileAsDataUrl: async () => null,
    loadSiteIcon: async () => false,
    uniquePageName: (name) => name,
    keyIndexToSlot: (index) => index,
    uuid: () => 'id',
    prettyHotkey: (value) => value,
    wideOptions: () => ({}),
    drawSystemPanel() {},
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, inspector, nodes, key, page, calls, state };
}

test('the inspector renders the current key and caption style controls', () => {
  const { context, inspector, key } = makeHarness();

  context.renderInspector();

  assert.match(inspector.innerHTML, /id="insp-text-family"/);
  assert.match(inspector.innerHTML, /id="insp-text-weight"/);
  assert.match(inspector.innerHTML, /id="insp-text-color"/);
  assert.doesNotMatch(inspector.innerHTML, /id="insp-text-effect"/);
  assert.doesNotMatch(inspector.innerHTML, /id="insp-text-align"/);
  assert.match(inspector.innerHTML, /id="insp-font-family"/);
  assert.match(inspector.innerHTML, /id="insp-font-weight"/);
  assert.match(inspector.innerHTML, /id="insp-font-size"/);
  assert.match(inspector.innerHTML, /id="insp-font-align"/);
  assert.match(inspector.innerHTML, /id="insp-font-background"/);
  assert.doesNotMatch(inspector.innerHTML, /id="insp-font-effect"/);
  assert.equal(key.textStyle.family, 'system');
});

test('inspector style changes update the key and caption objects', () => {
  const { context, nodes, key, calls } = makeHarness();
  context.renderInspector();

  nodes.get('#insp-text-family').handlers.change({ target: { value: 'georgia' } });
  nodes.get('#insp-text-weight').handlers.change({ target: { value: 'bold' } });
  nodes.get('#insp-text-color').handlers.input({ target: { value: '#ff0000' } });
  nodes.get('#insp-font-family').handlers.change({ target: { value: 'menlo' } });
  nodes.get('#insp-font-weight').handlers.change({ target: { value: 'light' } });
  nodes.get('#insp-font-size').handlers.change({ target: { value: '24' } });
  nodes.get('#insp-font-align').handlers.change({ target: { value: 'center' } });
  nodes.get('#insp-font-background').handlers.change({ target: { value: 'none' } });

  assert.deepEqual({ ...key.textStyle }, {
    family: 'georgia',
    weight: 700,
    color: '#ff0000',
  });
  assert.equal(key.font.family, 'menlo');
  assert.equal(key.font.weight, 300);
  assert.equal(key.font.size, 24);
  assert.equal(key.font.align, 'center');
  assert.equal(key.font.background, 'none');
  assert.ok(calls.drawIndex > 0);
  assert.ok(calls.commit > 0);
});

test('showing and hiding a caption toggles its controls', () => {
  const { context, nodes, key } = makeHarness();
  context.renderInspector();

  nodes.get('#insp-font-show').handlers.change({ target: { checked: false } });

  assert.equal(key.font.showLabel, false);
  assert.equal(nodes.get('#insp-font-family').disabled, true);
  assert.equal(nodes.get('#insp-font-background').disabled, true);
  assert.equal(nodes.get('#insp-font-reset').disabled, true);
});

test('the inspector toggle persists the collapsed state on wide windows', () => {
  const { context, nodes, state } = makeHarness();
  context.window.innerWidth = 1400;
  state.config.settings.inspectorCollapsed = false;

  context.toggleInspector();

  assert.equal(state.config.settings.inspectorCollapsed, true);
  assert.equal(nodes.get('#app').classList.contains('inspector-collapsed'), true);
  assert.equal(nodes.get('#inspector-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal(nodes.get('#inspector-toggle').title, 'Show inspector');

  context.toggleInspector();

  assert.equal(state.config.settings.inspectorCollapsed, false);
  assert.equal(nodes.get('#app').classList.contains('inspector-collapsed'), false);
  assert.equal(nodes.get('#inspector-toggle').getAttribute('aria-pressed'), 'true');
});

test('selecting a key reopens a collapsed inspector', () => {
  const { context, nodes, state } = makeHarness();
  context.window.innerWidth = 1400;
  state.config.settings.inspectorCollapsed = true;

  context.renderInspector();

  assert.equal(state.config.settings.inspectorCollapsed, false);
  assert.equal(nodes.get('#app').classList.contains('inspector-collapsed'), false);
});

test('narrow windows keep the drawer instead of collapsing it', () => {
  const { context, nodes, state } = makeHarness();
  context.window.innerWidth = 900;
  state.config.settings.inspectorCollapsed = true;

  context.renderInspector();

  // The stored desktop preference survives, but the drawer must stay usable.
  assert.equal(state.config.settings.inspectorCollapsed, true);
  assert.equal(nodes.get('#app').classList.contains('inspector-collapsed'), false);
  assert.equal(nodes.get('#inspector').classList.contains('open'), true);
  assert.equal(nodes.get('#drawer-scrim').classList.contains('hidden'), false);
});

test('choosing "Choose a plugin…" clears the plugin chain and keeps the key face', () => {
  const { context, nodes, key, calls, state } = makeHarness();
  state.plugins = [
    { uuid: 'com.mac.controls', name: 'macOS Controls', sdk: 'streamdeck', actions: [{ uuid: 'volume', name: 'Volume' }] },
  ];
  key.action = {
    type: 'plugin',
    sdk: 'streamdeck',
    plugin: 'com.mac.controls',
    action: 'volume',
    actionid: 'old',
    settings: { op: 'down' },
  };
  context.renderInspector();

  nodes.get('#insp-plugin').handlers.change({ target: { value: '' } });

  assert.equal(key.action.type, 'plugin');
  assert.equal(key.action.plugin, '');
  assert.equal(key.action.action, '');
  assert.deepEqual({ ...key.action.settings }, {});
  assert.equal(key.emoji, 'BC');
  assert.ok(calls.commit > 0);
});
