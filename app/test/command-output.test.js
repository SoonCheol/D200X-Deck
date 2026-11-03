'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

let nextResult = { err: null, stdout: '' };
const originalLoad = Module._load;
let actions;
try {
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return { app: { isPackaged: false }, shell: { openExternal: async () => {} } };
    if (request === 'node:child_process') {
      return {
        spawn: () => {
          throw new Error('not used');
        },
        execFile: (_file, _args, _options, callback) => {
          const { err, stdout } = nextResult;
          callback(err, stdout, err?.stderr || '');
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  actions = require('../lib/actions');
} finally {
  Module._load = originalLoad;
}

function run(stdout, err = null) {
  nextResult = { err, stdout };
  return actions.runCommandOutput('status');
}

test('command output returns plain text with whitespace collapsed', async () => {
  assert.deepEqual(await run('  battery 82%\n charging \n'), { ok: true, text: 'battery 82% charging' });
  assert.deepEqual(await run(''), { ok: true, text: '' });
});

test('command output passes through an image data URL and converts SVG', async () => {
  const data = 'data:image/png;base64,cG5n';
  assert.deepEqual(await run(data), { ok: true, image: data });

  const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  assert.deepEqual(await run(svg), {
    ok: true,
    image: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
  });
});

test('command output reads an image file path', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-cmdout-'));
  const file = path.join(dir, 'meter.png');
  fs.writeFileSync(file, Buffer.from('png'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.deepEqual(await run(`${file}\n`), {
    ok: true,
    image: `data:image/png;base64,${Buffer.from('png').toString('base64')}`,
  });

  const huge = path.join(dir, 'huge.png');
  fs.writeFileSync(huge, Buffer.alloc(600 * 1024));
  assert.deepEqual(await run(huge), { ok: true, text: huge });

  const link = path.join(dir, 'link.png');
  fs.symlinkSync(file, link);
  assert.deepEqual(await run(link), {
    ok: true,
    image: `data:image/png;base64,${Buffer.from('png').toString('base64')}`,
  });
});

test('a failing command reports the last stderr line', async () => {
  const err = Object.assign(new Error('exit 1'), { stderr: 'first\nsecond line' });
  assert.deepEqual(await run('', err), { ok: false, error: 'second line' });
});
