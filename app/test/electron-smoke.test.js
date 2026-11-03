'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

// Launching Electron from this repository's agent shell aborts with SIGABRT
// because the shell has no Aqua session. Set RUN_ELECTRON_SMOKE=1 from a GUI
// Terminal to run this opt-in end-to-end smoke.
test(
  'the Electron app boots with a temporary config and writes a screenshot',
  { skip: process.env.RUN_ELECTRON_SMOKE === '1' ? false : 'requires a GUI session' },
  async (t) => {
    const config = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-electron-smoke-'));
    const screenshot = path.join(config, 'shot.png');
    const electron = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');
    const child = spawn(electron, [path.join(__dirname, '..')], {
      env: {
        ...process.env,
        ULANZI_NO_DECK: '1',
        ULANZI_CONFIG_DIR: config,
        ULANZI_SHOT: screenshot,
        ULANZI_SHOT_DELAY: '1500',
        ULANZI_SIZE: '1200x800',
      },
      stdio: 'ignore',
    });
    t.after(() => {
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      fs.rmSync(config, { recursive: true, force: true });
    });

    for (let i = 0; i < 40 && !fs.existsSync(screenshot); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    assert.equal(fs.existsSync(screenshot), true, 'the app reached its renderer and captured a frame');
  }
);

test(
  'SIGTERM quits the app without waiting on the quit confirmation',
  { skip: process.env.RUN_ELECTRON_SMOKE === '1' ? false : 'requires a GUI session' },
  async (t) => {
    const config = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-electron-sigterm-'));
    // The binary itself, not the .bin wrapper, so the signal and cleanup reach the app.
    const electron = require('electron');
    const child = spawn(electron, [path.join(__dirname, '..')], {
      env: { ...process.env, ULANZI_NO_DECK: '1', ULANZI_CONFIG_DIR: config },
      stdio: 'ignore',
    });
    const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
    t.after(async () => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      await exited;
      fs.rmSync(config, { recursive: true, force: true });
    });

    // The app writes its config once it is up.
    for (let i = 0; i < 40 && !fs.existsSync(path.join(config, 'config.json')); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(fs.existsSync(path.join(config, 'config.json')), true, 'the app started');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    child.kill('SIGTERM');

    // Quit flush (600 ms) plus plugin shutdown (3 s fallback), with margin.
    const result = await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve(null), 8000))]);
    assert.deepEqual(result, { code: 0, signal: null }, 'the app quit cleanly instead of showing the quit confirmation');
  }
);
