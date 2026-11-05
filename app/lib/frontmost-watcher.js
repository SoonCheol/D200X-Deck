'use strict';

const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

/**
 * Long-lived `lsappinfo listen +becameFrontmost`. The payload format is not a
 * stable interface, so any output means "the front app changed"; the caller
 * resolves the app with its existing lookup. App switches are rare, so this
 * replaces two `lsappinfo` processes every 3 seconds with one long-lived child.
 */
class FrontmostWatcher extends EventEmitter {
  constructor({
    bin = 'lsappinfo',
    args = ['listen', '+becameFrontmost', 'forever'],
    spawn: spawnFn = spawn,
  } = {}) {
    super();
    this.bin = bin;
    this.args = args;
    this.spawn = spawnFn;
    this.child = null;
    this.stopped = false;
  }

  get running() {
    return Boolean(this.child);
  }

  start() {
    if (this.child || this.stopped) return;
    let child;
    try {
      child = this.spawn(this.bin, this.args, { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      this.emit('down');
      return;
    }
    this.child = child;
    child.stdout?.on('data', (data) => {
      if (String(data || '').trim()) this.emit('change');
    });
    const down = () => {
      if (this.child === child) this.child = null;
      this.emit('down');
    };
    child.once('error', down);
    child.once('exit', down);
  }

  stop() {
    this.stopped = true;
    const child = this.child;
    this.child = null;
    if (!child) return;
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

module.exports = { FrontmostWatcher };
