'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { EventEmitter } = require('node:events');

const execCalls = [];
const spawnCalls = [];
const opened = [];

function fakeExecFile(file, args, _options, callback) {
  execCalls.push({ file, args });
  callback(null, '', '');
}

function fakeSpawn(file, args, _options) {
  const child = new EventEmitter();
  child.kill = () => {};
  child.unref = () => {};
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  spawnCalls.push({ file, args, child });
  return child;
}

const electron = {
  app: { isPackaged: false },
  shell: {
    openExternal: async (url) => {
      opened.push(url);
    },
  },
};

const originalLoad = Module._load;
let actions;
try {
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return electron;
    if (request === 'node:child_process') return { execFile: fakeExecFile, spawn: fakeSpawn };
    return originalLoad.call(this, request, parent, isMain);
  };
  actions = require('../lib/actions');
} finally {
  Module._load = originalLoad;
}

test('openUrl accepts web, mail and app links and blocks local/script schemes', async () => {
  assert.deepEqual(await actions.openUrl(''), { ok: false, error: 'empty URL' });
  assert.deepEqual(await actions.openUrl('javascript:alert(1)'), {
    ok: false,
    error: 'unsupported URL scheme',
  });
  assert.deepEqual(await actions.openUrl('file:///etc/passwd'), {
    ok: false,
    error: 'unsupported URL scheme',
  });
  assert.deepEqual(await actions.openUrl('FILE:///etc/passwd'), {
    ok: false,
    error: 'unsupported URL scheme',
  });
  assert.deepEqual(await actions.openUrl('java\tscript:alert(1)'), {
    ok: false,
    error: 'unsupported URL scheme',
  });
  assert.deepEqual(await actions.openUrl('data:text/html,hello'), {
    ok: false,
    error: 'unsupported URL scheme',
  });

  assert.deepEqual(await actions.openUrl('example.com'), { ok: true });
  assert.deepEqual(await actions.openUrl('mailto:test@example.com'), { ok: true });
  assert.deepEqual(await actions.openUrl('slack://channel?team=T1&id=C1'), { ok: true });
  assert.deepEqual(await actions.openUrl('zoommtg://zoom.us/join?confno=1'), { ok: true });
  assert.deepEqual(opened, [
    'https://example.com',
    'mailto:test@example.com',
    'slack://channel?team=T1&id=C1',
    'zoommtg://zoom.us/join?confno=1',
  ]);

  const prompts = [];
  const confirmScheme = async (scheme, url) => {
    prompts.push({ scheme, url });
    return scheme !== 'deniedapp';
  };
  assert.deepEqual(await actions.openUrl('customapp://open/1', { confirmScheme }), { ok: true });
  assert.equal(opened.at(-1), 'customapp://open/1');
  assert.deepEqual(prompts[0], { scheme: 'customapp', url: 'customapp://open/1' });
  assert.deepEqual(await actions.openUrl('deniedapp://open/1', { confirmScheme }), {
    ok: false,
    error: 'URL scheme not approved',
  });
});

test('a failing command reports stderr with the key metadata', async () => {
  const errors = [];
  actions.setShellErrorHandler((message, meta) => errors.push({ message, meta }));
  spawnCalls.length = 0;
  const pending = actions.execute(
    { type: 'command', value: 'gh --version' },
    { pageId: 'page-1', index: 4, field: 'action' }
  );
  await Promise.resolve();
  const child = spawnCalls[0].child;
  child.emit('spawn');
  assert.deepEqual(await pending, { ok: true });
  child.stderr.emit('data', Buffer.from('gh: command not found\n'));
  child.emit('exit', 127, null);
  assert.deepEqual(errors, [
    { message: 'gh: command not found', meta: { pageId: 'page-1', index: 4, field: 'action' } },
  ]);
  actions.setShellErrorHandler(null);
});

test('runHotkey builds the expected command for the platform', async (t) => {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    t.skip('hotkeys are only implemented on macOS/Linux');
    return;
  }
  execCalls.length = 0;
  const result = await actions.runHotkey('cmd+plus');

  assert.deepEqual(result, { ok: true });
  if (process.platform === 'darwin') {
    assert.equal(execCalls[0].file, '/usr/bin/osascript');
    assert.match(execCalls[0].args[1], /keystroke "\+"/);
    assert.match(execCalls[0].args[1], /using \{command down\}/);
  } else {
    assert.equal(execCalls[0].file, '/usr/bin/xdotool');
    assert.deepEqual(execCalls[0].args, ['key', 'cmd+plus']);
  }
});

test('close and text actions use System Events', async () => {
  execCalls.length = 0;
  assert.deepEqual(await actions.execute({ type: 'close', value: 'Finder' }), { ok: true });
  assert.match(execCalls[0].args[1], /tell application "Finder" to quit/);

  assert.deepEqual(await actions.execute({ type: 'text', value: 'Hello', enter: true }), { ok: true });
  assert.match(execCalls[1].args[1], /keystroke "Hello"/);
  assert.match(execCalls[1].args[1], /key code 36/);
});

test('unknown media keys and actions fail without spawning', async () => {
  spawnCalls.length = 0;
  assert.deepEqual(await actions.execute({ type: 'media', op: 'bogus' }), {
    ok: false,
    error: 'unknown media key: bogus',
  });
  assert.deepEqual(await actions.execute({ type: 'unknown' }), {
    ok: false,
    error: 'unknown action type: unknown',
  });
  assert.equal(spawnCalls.length, 0);
});

test('playSound clamps volume, rejects missing files and stops cleanly', async (t) => {
  spawnCalls.length = 0;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-actions-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'tone.aiff');
  fs.writeFileSync(file, 'not really audio');

  assert.deepEqual(await actions.execute({ type: 'sound', value: file, volume: 0 }), { ok: true });
  assert.deepEqual(spawnCalls[0].args, ['-v', '0', file]);
  assert.deepEqual(await actions.execute({ type: 'sound', value: path.join(dir, 'missing.aiff') }), {
    ok: false,
    error: 'audio file not found',
  });
  assert.deepEqual(await actions.execute({ type: 'sound', op: 'stop', value: 'sound-id' }), { ok: true });
});
