'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '../renderer/app.js'), 'utf8');

/** Slice a top-level function region out of app.js for a narrow vm harness. */
function region(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = appSource.indexOf(endMarker, start);
  assert.ok(end > start, `missing ${endMarker} after ${startMarker}`);
  return appSource.slice(start, end);
}

/** Slice an `api.onX((…) => { … });` registration, including its close. */
function registration(startMarker) {
  const start = appSource.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const close = '\n  });';
  const end = appSource.indexOf(close, start);
  assert.ok(end > start, `missing registration close after ${startMarker}`);
  return appSource.slice(start, end + close.length);
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ------------------------------------------------ command-output visibility

function commandHarness() {
  const calls = [];
  const pages = [
    { id: 'p1', profileId: 'profile', keys: {} },
    { id: 'p2', profileId: 'profile', keys: {} },
  ];
  const visible = { action: { type: 'command', value: 'visible', showOutput: true, outputInterval: 30 } };
  const hidden = { action: { type: 'command', value: 'hidden', showOutput: true, outputInterval: 30 } };
  pages[0].keys = { 0: visible };
  pages[1].keys = { 0: hidden };

  const context = {
    state: {
      config: { pages, profiles: [], activePageId: 'p1' },
      status: { connected: false },
    },
    api: {
      runCommandOutput: async (command) => {
        calls.push(command);
        return { ok: true, text: command };
      },
    },
    commandTimers: new Map(),
    commandOutputs: new Map(),
    document: { hidden: false },
    drawIndex: async () => {},
    scheduleLivePush: () => {},
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    Promise,
    Number,
    String,
    Math,
  };
  vm.createContext(context);
  const code = region(
    'function commandInterval(action) {',
    '/** Re-run a command immediately after its key is pressed. */'
  );
  new vm.Script(code, { filename: 'app.js#command-output' }).runInContext(context);

  const stop = () => {
    for (const entry of context.commandTimers.values()) {
      clearInterval(entry.timer);
      clearTimeout(entry.startTimer);
    }
  };
  return { context, calls, visible, hidden, stop };
}

test('only the visible page runs command-output keys', async (t) => {
  const { context, calls, visible, hidden, stop } = commandHarness();
  t.after(stop);

  context.syncCommandOutputs();
  assert.equal(context.commandTimers.size, 2);

  await context.commandTimers.get(visible).tick();
  await context.commandTimers.get(hidden).tick();

  assert.deepEqual(calls, ['visible'], 'the key on the inactive page must not spawn');
});

test('a hidden editor with no deck does not run output keys', async (t) => {
  const { context, calls, visible, stop } = commandHarness();
  t.after(stop);

  context.syncCommandOutputs();
  const entry = context.commandTimers.get(visible);

  context.document.hidden = true;
  context.state.status.connected = false;
  await entry.tick();
  assert.deepEqual(calls, [], 'nothing needs the output while the editor is hidden');

  context.state.status.connected = true;
  await entry.tick();
  assert.deepEqual(calls, ['visible'], 'a connected deck still updates');
});

test('a page change runs the newly visible output keys once', async (t) => {
  const { context, calls, stop } = commandHarness();
  t.after(stop);

  context.syncCommandOutputs();
  context.state.config.activePageId = 'p2';
  calls.length = 0;

  context.tickVisibleCommandOutputs();
  await flush();

  assert.deepEqual(calls, ['hidden'], 'the newly visible key catches up');
});

// ------------------------------------------------------- plugin titles

function pluginHarness(snippet) {
  const saves = [];
  const draws = [];
  const live = [];
  const key = { label: 'User label', action: { settings: {} } };
  const loc = { key, index: 3 };
  const pluginStateTitles = new Map();
  let handler = null;

  const context = {
    api: {
      onPluginTitle: (fn) => {
        handler = fn;
      },
      onPluginSettings: (fn) => {
        handler = fn;
      },
    },
    findPluginAction: (actionid) => (actionid === 'known' ? loc : null),
    pluginStateTitles,
    pluginLocVisible: () => true,
    drawIndex: async (index) => draws.push(index),
    scheduleLivePush: (index) => live.push(index),
    scheduleSave: () => saves.push(1),
    Promise,
    Number,
    String,
    Math,
  };
  vm.createContext(context);
  new vm.Script(snippet, { filename: 'app.js#plugin-events' }).runInContext(context);

  return { handler, saves, draws, live, key, pluginStateTitles };
}

function titleHarness() {
  return pluginHarness(registration('api.onPluginTitle(({ actionid, text, state }) => {'));
}

test('plugin titles update the key without writing the config', async () => {
  const h = titleHarness();

  for (let i = 0; i < 10; i += 1) h.handler({ actionid: 'known', text: `t${i}` });
  await flush();

  assert.equal(h.saves.length, 0, 'title ticks must not save the config');
  assert.equal(h.key.label, 't9', 'the label still updates in memory for the renderer');
  assert.ok(h.draws.length >= 1, 'the visible key is redrawn');
});

test('a stateful plugin title stays in the runtime map', async () => {
  const h = titleHarness();

  h.handler({ actionid: 'known', text: 'paused', state: 1 });
  await flush();

  assert.equal(h.pluginStateTitles.get('known:1'), 'paused');
  assert.equal(h.saves.length, 0);
});

test('plugin settings still persist', () => {
  const h = pluginHarness(registration('api.onPluginSettings(({ actionid, settings }) => {'));

  h.handler({ actionid: 'known', settings: { volume: 3 } });

  assert.equal(h.saves.length, 1);
  assert.deepEqual(h.key.action.settings, { volume: 3 });
});

// ------------------------------------------------ lock screen has no clock

test('the lock screen frame has no clock and no refresh timer', async () => {
  const slice = region('const lock = {', 'async function exitLockScreen');
  const rendered = [];
  const timers = [];
  const context = {
    state: { config: { settings: { lockScreen: true } }, status: { connected: true } },
    api: { pushPage: async () => ({ ok: true }) },
    standby: { active: false },
    clearStandbyTimers() {},
    renderStandbySlices: async (settings) => {
      rendered.push(settings);
      return [];
    },
    setInterval: (...args) => timers.push(args),
    clearInterval() {},
  };
  vm.createContext(context);
  vm.runInContext(`${slice}\nthis.enterLockScreen = enterLockScreen;`, context);

  await context.enterLockScreen();

  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].standbyClock, false, 'the firmware wide key already shows the time');
  assert.equal(timers.length, 0, 'a static frame needs no refresh');
});
