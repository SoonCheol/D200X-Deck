'use strict';

const path = require('node:path');
const { isInside } = require('./paths');

/**
 * Split an openView URL into a local file path and its query parameters.
 * The SDK passes parameters separately, but a URL may still carry its own
 * query; both are merged and handed to `loadFile` instead of becoming part of
 * the filename.
 * @returns {{ file: string, query: Record<string, string> } | null}
 */
function viewTarget(baseDir, url, param) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const withoutHash = raw.split('#', 1)[0];
  const queryIndex = withoutHash.indexOf('?');
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = Object.fromEntries(
    new URLSearchParams(queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '')
  );
  if (param && typeof param === 'object' && !Array.isArray(param)) {
    for (const [key, value] of new URLSearchParams(param)) query[key] = value;
  }
  const file = path.resolve(baseDir, pathname.replace(/^\.?\//, ''));
  if (!isInside(baseDir, file) || file === path.resolve(baseDir)) return null;
  return { file, query };
}

module.exports = { viewTarget };
