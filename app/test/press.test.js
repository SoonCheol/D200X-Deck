'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../renderer/press.js'), 'utf8');

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeHarness(t, overrides = {}, fakeTimers = true) {
  const calls = {
    actions: [],
    plugins: [],
    pluginKeys: [],
    toasts: [],
    navigations: [],
    profiles: [],
    exitStandby: 0,
    activity: 0,
    push: 0,
  };
  const page = { id: 'page', profileId: 'profile', keys: {}, parentId: null };
  const key = { action: { type: 'app', value: 'app' } };
  const state = {
    config: {
      activeProfileId: 'profile',
      activePageId: 'page',
      settings: { brightness: 50 },
      pages: [page],
    },
    plugins: [],
    selected: null,
  };
  const api = {
    runAction: async (action) => {
      calls.actions.push(action);
      return { ok: true };
    },
    runPluginAction: async (actionid) => {
      calls.plugins.push(actionid);
      return { ok: true };
    },
    pluginKey: (actionid, pressed) => calls.pluginKeys.push([actionid, pressed]),
    showPop: async () => 1,
    setBrightness: () => {},
    setWideMode: (mode) => calls.wideMode.push(mode),
    requestAccessibility: () => {},
  };
  calls.wideMode = [];
  const context = {
    state,
    WIDE_KEY_INDEX: 13,
    api,
    keyAt: () => key,
    activePage: () => page,
    pinnedFor: () => ({}),
    navigate: (id) => calls.navigations.push(id),
    switchProfile: (id) => calls.profiles.push(id),
    lockActive: () => false,
    standbyActive: () => false,
    exitStandby: () => {
      calls.exitStandby += 1;
    },
    noteActivity: () => {
      calls.activity += 1;
    },
    notePluginKeyPress: () => {},
    drawIndex: () => {},
    renderInspector: () => {},
    refreshWideStats: () => {},
    scheduleSave: () => {},
    commit: () => {},
    pushNow: () => {
      calls.push += 1;
    },
    toast: (...args) => calls.toasts.push(args),
    actionMeta: () => ({ label: 'App' }),
    actionIconSrc: () => '',
    $: () => ({ children: [] }),
    window: { KeyRenderer: { truncateMain: (text) => text } },
    document: { getElementById: () => null },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    ...overrides,
  };
  if (fakeTimers && t) t.mock.timers.enable({ apis: ['setTimeout'] });
  vm.createContext(context);
  new vm.Script(source, { filename: 'press.js' }).runInContext(context);
  return { context, calls, state, page, key };
}

test('a tap runs once on press, not on release', async (t) => {
  const { context, calls } = makeHarness(t);

  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, false);
  await flush();

  assert.deepEqual(calls.actions, [{ type: 'app', value: 'app' }]);
});

test('a locked deck ignores key events', async (t) => {
  const { context, calls } = makeHarness(t, { lockActive: () => true });

  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, false);
  await flush();

  assert.equal(calls.actions.length, 0);
});

test('the first press while standby is up only wakes the deck', async (t) => {
  let standby = true;
  const { context, calls } = makeHarness(t, {
    standbyActive: () => standby,
    exitStandby: () => {
      calls.exitStandby += 1;
      standby = false;
    },
  });

  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, false);
  await flush();

  assert.equal(calls.exitStandby, 1);
  assert.equal(calls.actions.length, 0);
});

test('a hold fires at holdMs and suppresses the tap', async (t) => {
  const { context, calls, key } = makeHarness(undefined, {}, false);
  key.holdAction = { type: 'app', value: 'hold' };
  key.holdMs = 150;

  context.handleKeyEvent(0, true);
  await new Promise((resolve) => setTimeout(resolve, 180));
  context.handleKeyEvent(0, false);
  await flush();

  assert.deepEqual(calls.actions, [{ type: 'app', value: 'hold' }]);
});

test('a double press runs the double action instead of the tap', async (t) => {
  const { context, calls, key } = makeHarness(undefined, {}, false);
  key.doubleAction = { type: 'app', value: 'double' };

  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, false);
  await new Promise((resolve) => setTimeout(resolve, 70));
  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, false);
  await flush();

  assert.deepEqual(calls.actions, [{ type: 'app', value: 'double' }]);
});

test('a bounce inside 60 ms is ignored', async (t) => {
  const { context, calls } = makeHarness(t);

  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, true);
  await flush();

  assert.equal(calls.actions.length, 1);
});

test('Stream Deck plugin keys forward press and release without a tap', async (t) => {
  const { context, calls, key } = makeHarness(t);
  key.action = { type: 'plugin', sdk: 'streamdeck', actionid: 'plugin-action' };

  context.handleKeyEvent(0, true);
  context.handleKeyEvent(0, false);
  await flush();

  assert.deepEqual(calls.pluginKeys, [
    ['plugin-action', true],
    ['plugin-action', false],
  ]);
  assert.equal(calls.actions.length, 0);
});

test('the wide key cycles the panel without running an action', async (t) => {
  const { context, calls, page } = makeHarness(undefined, {}, false);

  context.handleKeyEvent(13, true);
  await new Promise((resolve) => setTimeout(resolve, 70));
  context.handleKeyEvent(13, true);
  await new Promise((resolve) => setTimeout(resolve, 70));
  context.handleKeyEvent(13, true);

  assert.deepEqual(calls.wideMode, ['stats', 'blank', 'clock']);
  assert.equal(page.wideMode, undefined);
  assert.equal(calls.actions.length, 0);
});

test('multi runs sequential steps and delays in order', async (t) => {
  const { context, calls } = makeHarness(undefined, {}, false);

  const result = await context.runMulti({
    type: 'multi',
    mode: 'sequence',
    steps: [
      { action: { type: 'app', value: 'first' } },
      { delay: 1 },
      { action: { type: 'app', value: 'second' } },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls.actions.map((action) => action.value), ['first', 'second']);
});

test('toggle alternates between its two actions', async (t) => {
  const { context, calls } = makeHarness(t);
  const action = {
    type: 'toggle',
    steps: [
      { action: { type: 'app', value: 'one' } },
      { action: { type: 'app', value: 'two' } },
    ],
  };

  await context.runToggle(action);
  await context.runToggle(action);
  await context.runToggle(action);

  assert.deepEqual(calls.actions.map((item) => item.value), ['one', 'two', 'one']);
});

test('a POP selection runs the chosen item', async (t) => {
  const { context, calls } = makeHarness(t);

  await context.openPop({
    type: 'pop',
    steps: [
      { action: { type: 'app', value: 'zero' } },
      { action: { type: 'app', value: 'one' } },
    ],
  });
  await flush();

  assert.deepEqual(calls.actions, [{ type: 'app', value: 'one' }]);
});

test('formatTimer renders hours, minutes and seconds', () => {
  const { context } = makeHarness();

  assert.equal(context.formatTimer(0), '0:00');
  assert.equal(context.formatTimer(65), '1:05');
  assert.equal(context.formatTimer(3661), '1:01:01');
});

test('a timer counts down, beeps on finish and clears its face', async () => {
  const { context, calls, key, page } = makeHarness(undefined, {}, false);
  const timer = { type: 'timer', seconds: 1, sound: true };
  key.action = timer;
  page.keys[0] = key;

  context.toggleTimer(timer);
  assert.match(context.timerTextFor(timer), /^0:0[01]$/);
  assert.equal(calls.toasts.some(([message]) => /Timer started/.test(message)), true);

  const deadline = Date.now() + 3000;
  while (context.timerTextFor(timer) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  assert.equal(context.timerTextFor(timer), '');
  assert.equal(calls.toasts.some(([message]) => message === 'Timer finished'), true);
  assert.equal(
    calls.actions.some((action) => action.type === 'command' && /afplay/.test(action.value)),
    true
  );
  assert.ok(calls.push > 0);
});

test('a second timer press cancels it without a beep', () => {
  const { context, calls, key, page } = makeHarness();
  const timer = { type: 'timer', seconds: 1, sound: true };
  key.action = timer;
  page.keys[0] = key;

  context.toggleTimer(timer);
  context.toggleTimer(timer);

  assert.equal(context.timerTextFor(timer), '');
  assert.equal(calls.toasts.some(([message]) => message === 'Timer cancelled'), true);
  assert.equal(calls.actions.some((action) => /afplay/.test(action.value)), false);
});
