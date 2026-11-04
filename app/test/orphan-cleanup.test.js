'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { findOrphans, cleanOrphans } = require('../lib/orphan-cleanup');
const { pluginRootDirs, streamDeckPluginDirs, sweepRoots } = require('../lib/plugin-dirs');

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

const APP = '/Users/me/Library/Application Support/Ulanzi Deck Open';
const RUNTIME = `${APP}-install/Contents/Frameworks/Ulanzi Deck Open Helper.app/Contents/MacOS/Ulanzi Deck Open Helper`;

test('an external app that merely mentions a plugin path is not an orphan', () => {
  const roots = [`${APP}/StreamDeckPlugins`];
  const ps = [
    `  301     1 /Applications/Visual Studio Code.app/Contents/MacOS/Electron ${APP}/StreamDeckPlugins/a.sdPlugin`,
    `  302     1 /usr/bin/open ${APP}/StreamDeckPlugins/a.sdPlugin/manifest.json`,
  ].join('\n');

  assert.deepEqual(findOrphans(ps, roots, [RUNTIME]), []);
});

test('a Node plugin is matched by its runtime and a plugin-root argument', () => {
  const roots = [`${APP}/StreamDeckPlugins`];
  const ps = [
    `  303     1 ${RUNTIME} -r ${APP}-install/Contents/Resources/app.asar/lib/plugin-watchdog.js ${APP}/StreamDeckPlugins/a.sdPlugin/plugin.js 127.0.0.1 57116 en 0.16.1`,
    `  304     2 ${RUNTIME} ${APP}/StreamDeckPlugins/a.sdPlugin/plugin.js`,
  ].join('\n');

  assert.deepEqual(findOrphans(ps, roots, [RUNTIME]), [303]);
});

test('a native plugin is matched when its executable is inside a root', () => {
  const roots = [`${APP}/StreamDeckPlugins`];
  const ps = [
    `  305     1 ${APP}/StreamDeckPlugins/x.sdPlugin/sdmicmute -port 57116`,
    `  306     1 /usr/local/bin/sdmicmute -port 57116`,
  ].join('\n');

  assert.deepEqual(findOrphans(ps, roots, [RUNTIME]), [305]);
});

test('findOrphans accepts several roots and ignores missing input', () => {
  const ps = '  201     1 /usr/bin/node /x/Plugins/a.js\n  202     1 /usr/bin/node /x/StreamDeckPlugins/b.js\n';
  assert.deepEqual(findOrphans(ps, ['/x/Plugins/', '/x/StreamDeckPlugins'], ['/usr/bin/node']), [201, 202]);
  assert.deepEqual(findOrphans('', ['/x'], ['/usr/bin/node']), []);
});

test('cleanOrphans kills only the matched pids', () => {
  const killed = [];
  const pids = cleanOrphans({
    roots: ['/x/Plugins'],
    runtimes: ['/usr/bin/node'],
    exec: () => '  301     1 /usr/bin/node /x/Plugins/a.js\n  302     2 /usr/bin/node /x/Plugins/b.js\n',
    kill: (pid) => killed.push(pid),
    log: () => {},
  });
  assert.deepEqual(pids, [301]);
  assert.deepEqual(killed, [301]);
});

test('the sweep roots cover every host plugin folder', () => {
  const base = '/tmp/ulanzi-sweep';
  const roots = sweepRoots(base).map((root) => path.resolve(root));
  const expected = [
    path.join(base, 'Plugins'),
    ...pluginRootDirs(),
    ...streamDeckPluginDirs(path.join(base, 'StreamDeckPlugins')),
  ].map((root) => path.resolve(root));

  for (const root of expected) assert.ok(roots.includes(root), `missing ${root}`);
  assert.ok(
    roots.includes(path.resolve(path.join(os.homedir(), '.ulanzi', 'Plugins'))),
    'the legacy ~/.ulanzi/Plugins folder is included'
  );
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

  const killed = cleanOrphans({ roots: [root], runtimes: [process.execPath], log: () => {} });
  assert.ok(killed.includes(pid), 'cleanup found the orphan');
  assert.ok(await waitFor(() => !alive(pid), 2_000), 'orphan exited');

  fs.rmSync(root, { recursive: true, force: true });
});
