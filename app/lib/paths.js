'use strict';

const path = require('node:path');

/**
 * True when `child` resolves inside `parent` (and is not `parent` itself).
 * Uses path.relative so a sibling whose name merely starts with the parent's
 * name (Foo vs Foo2) is not treated as contained.
 */
function isInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

module.exports = { isInside };
