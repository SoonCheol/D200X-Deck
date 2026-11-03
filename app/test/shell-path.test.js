'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { PRINT_PATH, mergePath, readLoginPath, applyLoginPath } = require('../lib/shell-path');

test('mergePath keeps login order and drops duplicate or empty entries', () => {
  assert.equal(
    mergePath('/opt/homebrew/bin:/usr/bin:/bin', '/usr/bin:/bin:/usr/local/bin'),
    '/opt/homebrew/bin:/usr/bin:/bin:/usr/local/bin'
  );
  assert.equal(mergePath('', '/usr/bin::/bin'), '/usr/bin:/bin');
});

test('readLoginPath returns the shell PATH and survives a failing shell', () => {
  const calls = [];
  const path = readLoginPath({
    shell: '/bin/zsh',
    exec: (file, args, options) => {
      calls.push({ file, args, options });
      return '/opt/homebrew/bin:/usr/bin\n';
    },
  });

  assert.equal(path, '/opt/homebrew/bin:/usr/bin');
  assert.equal(calls[0].file, '/bin/zsh');
  assert.deepEqual(calls[0].args, ['-ilc', PRINT_PATH]);
  assert.equal(
    readLoginPath({ exec: () => '__PATH_START__\n/opt/homebrew/bin:/usr/bin\n__PATH_END__\n' }),
    '/opt/homebrew/bin:/usr/bin'
  );
  assert.equal(readLoginPath({ exec: () => 'banner\n/opt/homebrew/bin:/usr/bin\n' }), '/opt/homebrew/bin:/usr/bin');
  assert.equal(readLoginPath({ exec: () => { throw new Error('no shell'); } }), '');
});

test('applyLoginPath merges the login PATH into the supplied environment', () => {
  const env = { SHELL: '/bin/zsh', PATH: '/usr/bin:/bin' };
  const changed = applyLoginPath({
    env,
    exec: () => '/opt/homebrew/bin:/usr/bin:/bin',
  });

  assert.equal(changed, true);
  assert.equal(env.PATH, '/opt/homebrew/bin:/usr/bin:/bin');
  assert.equal(
    applyLoginPath({ env, exec: () => '/opt/homebrew/bin:/usr/bin:/bin' }),
    false,
    'a second application is a no-op'
  );
});
