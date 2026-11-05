'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');

const originalLoad = Module._load;
let actions;
try {
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') {
      return { app: { isPackaged: false }, shell: { openExternal: async () => {} } };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  actions = require('../lib/actions');
} finally {
  Module._load = originalLoad;
}

/** Process lines that name a probe, excluding this test runner. */
function processesMatching(re) {
  const ps = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' });
  return ps
    .split('\n')
    .filter((line) => re.test(line))
    .filter((line) => !line.includes('--test'))
    .map((line) => line.trim());
}

function killMatching(re) {
  for (const line of processesMatching(re)) {
    const pid = Number(line.split(/\s+/)[0]);
    if (pid) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
  }
}

test('command output parses plain text with whitespace collapsed', () => {
  const parse = actions.parseCommandOutput;
  assert.deepEqual(parse('  battery 82%\n charging \n'), { ok: true, text: 'battery 82% charging' });
  assert.deepEqual(parse(''), { ok: true, text: '' });
});

test('command output passes through an image data URL and converts SVG', () => {
  const parse = actions.parseCommandOutput;
  const data = 'data:image/png;base64,cG5n';
  assert.deepEqual(parse(data), { ok: true, image: data });

  const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  assert.deepEqual(parse(svg), {
    ok: true,
    image: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
  });
});

test('command output reads an image file path', async (t) => {
  const parse = actions.parseCommandOutput;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-cmdout-'));
  const file = path.join(dir, 'meter.png');
  fs.writeFileSync(file, Buffer.from('png'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.deepEqual(parse(`${file}\n`), {
    ok: true,
    image: `data:image/png;base64,${Buffer.from('png').toString('base64')}`,
  });

  const huge = path.join(dir, 'huge.png');
  fs.writeFileSync(huge, Buffer.alloc(600 * 1024));
  assert.deepEqual(parse(huge), { ok: true, text: huge });

  const link = path.join(dir, 'link.png');
  fs.symlinkSync(file, link);
  assert.deepEqual(parse(link), {
    ok: true,
    image: `data:image/png;base64,${Buffer.from('png').toString('base64')}`,
  });
});

test('command output runs a command and parses stdout', async () => {
  assert.deepEqual(await actions.runCommandOutput("printf 'battery 82%%\\n charging \\n'"), {
    ok: true,
    text: 'battery 82% charging',
  });
});

test('a failing command reports the last stderr line', async () => {
  assert.deepEqual(await actions.runCommandOutput("printf 'first\\nsecond line\\n' >&2; exit 1"), {
    ok: false,
    error: 'second line',
  });
});

test('the output cap kills a runaway command', async (t) => {
  t.after(() => killMatching(/head -c 400000|ulanzi-cap/));
  const res = await actions.runCommandOutput('yes | head -c 400000 # ulanzi-cap', { timeout: 5000 });
  assert.equal(res.ok, false);
  assert.match(res.error, /256 KB/);
});

test('a timed-out command kills its whole process group', async (t) => {
  const probe = `ulenzi-timeout-${process.pid}`;
  const sleep = `sleep 30.${process.pid % 1000}`;
  t.after(() => killMatching(new RegExp(`${sleep}|${probe}`)));

  const started = Date.now();
  const res = await actions.runCommandOutput(`${sleep} | cat; true # ${probe}`, { timeout: 500 });
  assert.equal(res.ok, false);
  assert.match(res.error, /timed out/);
  assert.ok(Date.now() - started < 5000, 'the timeout is not the default 8 s');

  // The shell, sleep and cat all leave together; nothing may be re-parented.
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(processesMatching(new RegExp(sleep)), []);
});
