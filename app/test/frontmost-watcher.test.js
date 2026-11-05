'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { FrontmostWatcher } = require('../lib/frontmost-watcher');

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  return child;
}

test('one long-lived listener replaces the polling loop', () => {
  const child = fakeChild();
  const calls = [];
  const watcher = new FrontmostWatcher({
    spawn: (...args) => {
      calls.push(args);
      return child;
    },
  });
  let changes = 0;
  watcher.on('change', () => {
    changes += 1;
  });

  watcher.start();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'lsappinfo');
  assert.deepEqual(calls[0][1], ['listen', '+becameFrontmost', 'forever']);
  assert.deepEqual(calls[0][2].stdio, ['ignore', 'pipe', 'ignore']);
  assert.equal(watcher.running, true);

  child.stdout.emit('data', Buffer.from('anything about the new front app\n'));
  assert.equal(changes, 1, 'any output is a change trigger');

  watcher.start();
  assert.equal(calls.length, 1, 'a second start is a no-op');
});

test('stop kills the listener and it is not restarted', () => {
  const child = fakeChild();
  let spawned = 0;
  const watcher = new FrontmostWatcher({
    spawn: () => {
      spawned += 1;
      return child;
    },
  });
  watcher.start();
  watcher.stop();

  assert.equal(child.killed, true);
  assert.equal(watcher.running, false);
  child.emit('exit', 0, null);
  watcher.start();
  assert.equal(spawned, 1);
});

test('an exit marks the watcher down', () => {
  const child = fakeChild();
  const watcher = new FrontmostWatcher({ spawn: () => child });
  let down = 0;
  watcher.on('down', () => {
    down += 1;
  });
  watcher.start();
  child.emit('exit', 1, null);
  assert.equal(watcher.running, false);
  assert.equal(down, 1);
});
