'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RUNNER = path.join(__dirname, 'fixtures', 'plugin-host-runner.js');

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function kill(pid) {
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
}

async function waitFor(condition, timeoutMs, stepMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return condition();
}

test('a Node plugin exits when its host is SIGKILLed', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-lifetime-'));
  const out = path.join(dir, 'pids.json');
  let pluginPid = null;

  const host = spawn(process.execPath, [RUNNER, dir, out], { stdio: 'ignore' });
  t.after(() => {
    kill(host.pid);
    if (pluginPid) kill(pluginPid);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  assert.ok(
    await waitFor(() => fs.existsSync(out), 10_000),
    'the host should write the plugin pid'
  );
  const pids = JSON.parse(fs.readFileSync(out, 'utf8'));
  pluginPid = pids.plugin;
  assert.ok(Number.isInteger(pluginPid) && pluginPid > 0, 'plugin pid is valid');
  assert.ok(alive(pluginPid), 'the plugin starts');

  // Simulate a crash / kill -9 of the app: no will-quit, no shutdown().
  process.kill(pids.host, 'SIGKILL');

  const exited = await waitFor(() => !alive(pluginPid), 4_000);
  assert.equal(
    exited,
    true,
    `plugin ${pluginPid} is still running after its host was SIGKILLed`
  );
});
