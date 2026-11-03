'use strict';

const { execFileSync } = require('node:child_process');

// LaunchServices starts GUI apps with a minimal PATH. A login shell knows the
// user's real PATH (Homebrew, version managers, ~/bin), so resolve it once and
// merge it into process.env for every child process the app starts.
const PRINT_PATH = 'printenv PATH';

function readLoginPath({ shell = process.env.SHELL || '/bin/zsh', exec = execFileSync, timeout = 1500 } = {}) {
  try {
    const output = exec(shell, ['-ilc', PRINT_PATH], {
      encoding: 'utf8',
      timeout,
      killSignal: 'SIGKILL',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    // rc files sometimes print a banner before printenv's output; PATH itself
    // has no newlines, so the last non-empty line is the one we want.
    return String(output || '')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .pop() || '';
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
