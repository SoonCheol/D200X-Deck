'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { findOrphans, cleanOrphans } = require('../lib/orphan-cleanup');

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
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

test('findOrphans only matches parent-PID-1 processes under a plugin root', () => {
  const roots = ['/Users/me/Library/Application Support/Ulanzi Deck Open/StreamDeckPlugins'];
  const ps = [
    '  101     1 /usr/bin/helper /Users/me/Library/Application Support/Ulanzi Deck Open/StreamDeckPlugins/a.sdPlugin/plugin.js',
    '  102   101 /usr/bin/helper /Users/me/Library/Application Support/Ulanzi Deck Open/StreamDeckPlugins/a.sdPlugin/plugin.js',
    '  103     1 /usr/bin/helper /Users/me/Library/Application Support/Ulanzi Deck Open/Plugins/b.ulanziPlugin/app.js',
    '  104     1 /usr/bin/other /tmp/not-ours.js',
  ].join('\n');

  assert.deepEqual(findOrphans(ps, roots), [101]);
});

test('findOrphans accepts several roots and ignores missing input', () => {
  const ps = '  201     1 node /x/Plugins/a.js\n  202     1 node /x/StreamDeckPlugins/b.js\n';
  assert.deepEqual(findOrphans(ps, ['/x/Plugins/', '/x/StreamDeckPlugins']), [201, 202]);
  assert.deepEqual(findOrphans('', ['/x']), []);
});

test('cleanOrphans kills only the matched pids', () => {
  const killed = [];
  const pids = cleanOrphans({
    roots: ['/x/Plugins'],
    exec: () => '  301     1 node /x/Plugins/a.js\n  302     2 node /x/Plugins/b.js\n',
    kill: (pid) => killed.push(pid),
    log: () => {},
  });
  assert.deepEqual(pids, [301]);
  assert.deepEqual(killed, [301]);
});

test('a real orphaned plugin process is killed at startup', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-orphans-'));
  const pluginDir = path.join(root, 'test.sdPlugin');
  fs.mkdirSync(pluginDir);
  const pluginFile = path.join(pluginDir, 'plugin.js');
  fs.writeFileSync(pluginFile, 'setInterval(() => {}, 1000);\n');

  // A short-lived parent spawns the plugin detached and exits, so the plugin is
  // re-parented to launchd exactly like a pre-0.16.0 orphan.
  const parent = spawn(
    process.execPath,
    [
      '-e',
      "const { spawn } = require('node:child_process'); const p = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', process.argv[1]], { detached: true, stdio: 'ignore' }); p.unref(); console.log(p.pid);",
      pluginFile,
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  );
  let out = '';
  parent.stdout.on('data', (chunk) => { out += chunk; });
  await new Promise((resolve) => parent.on('exit', resolve));
  const pid = Number(out.trim());
  assert.ok(Number.isInteger(pid) && pid > 0, 'plugin pid parsed');
  t.after(() => { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } });

  assert.ok(await waitFor(() => {
    const ppid = Number(
      require('node:child_process')
        .execFileSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf8' })
        .trim()
    );
    return ppid === 1;
  }, 5_000), 'plugin is re-parented to launchd');

  const killed = cleanOrphans({ roots: [root], log: () => {} });
  assert.ok(killed.includes(pid), 'cleanup found the orphan');
  assert.ok(await waitFor(() => !alive(pid), 2_000), 'orphan exited');

  fs.rmSync(root, { recursive: true, force: true });
});
