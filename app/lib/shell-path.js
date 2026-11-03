'use strict';

const { execFileSync } = require('node:child_process');

// LaunchServices starts GUI apps with a minimal PATH. A login shell knows the
// user's real PATH (Homebrew, version managers, ~/bin), so resolve it once and
// merge it into process.env for every child process the app starts.
const PRINT_PATH = 'printenv PATH';

function readLoginPath({ shell = process.env.SHELL || '/bin/zsh', exec = execFileSync, timeout = 3000 } = {}) {
  try {
    const output = exec(shell, ['-lc', PRINT_PATH], {
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(output || '').trim();
  } catch {
    return '';
  }
}

/** Merge two PATH strings in order, dropping empty and duplicate entries. */
function mergePath(loginPath, currentPath = '') {
  const parts = [];
  for (const entry of `${loginPath || ''}:${currentPath || ''}`.split(':')) {
    if (entry && !parts.includes(entry)) parts.push(entry);
  }
  return parts.join(':');
}

/**
 * Apply the login-shell PATH to `process.env` (or a supplied env object).
 * Returns false when the shell could not be read or PATH is unchanged.
 */
function applyLoginPath({ env = process.env, exec = execFileSync, shell = '', timeout = 3000 } = {}) {
  if (process.platform === 'win32') return false;
  const loginPath = readLoginPath({ shell: shell || env.SHELL, exec, timeout });
  if (!loginPath) return false;
  const next = mergePath(loginPath, env.PATH || '');
  if (next === env.PATH) return false;
  env.PATH = next;
  return true;
}

module.exports = { readLoginPath, mergePath, applyLoginPath };
