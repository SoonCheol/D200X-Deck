'use strict';

const path = require('node:path');

/**
 * Resolve a directory that must be a direct child of `root`.
 * Returns null for anything that could escape it ("..", separators, NUL).
 */
function childDir(root, name) {
  const value = String(name ?? '');
  if (!value || value === '.' || value === '..' || /[\\/\0]/.test(value)) return null;
  const dir = path.join(root, value);
  return path.dirname(dir) === root ? dir : null;
}

/** Split an icon-pack id ("app:<dir>" / "ulanzi:<dir>") without trusting it. */
function parsePackId(id) {
  const raw = String(id ?? '');
  const sep = raw.indexOf(':');
  const scope = sep === -1 ? 'app' : raw.slice(0, sep);
  const name = sep === -1 ? raw : raw.slice(sep + 1);
  if (scope !== 'app' && scope !== 'ulanzi') return null;
  return { scope, name };
}

module.exports = { childDir, parsePackId };
