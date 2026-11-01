'use strict';

// One implementation of "is this version newer", shared by the main process
// (CommonJS) and the renderer (loaded as a plain script before store-ui.js).

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '');
}

// Compares dotted versions numerically, so "1.0" and "1.0.0" are the same and
// "1.10" is newer than "1.9". Pre-release suffixes sort below the release.
function compareVersions(a, b) {
  const parse = (value) => {
    const clean = normalizeVersion(value);
    const [main, pre = ''] = clean.split('-', 2);
    const parts = main.split('.').map((part) => Number.parseInt(part, 10) || 0);
    return { parts, pre };
  };
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.parts.length, right.parts.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left.parts[i] || 0) - (right.parts[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  if (left.pre === right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;
  return left.pre > right.pre ? 1 : -1;
}

function isNewer(latest, current) {
  return compareVersions(latest, current) > 0;
}

if (typeof module === 'object' && module.exports) {
  module.exports = { normalizeVersion, compareVersions, isNewer };
} else {
  self.DeckVersion = { normalizeVersion, compareVersions, isNewer };
}
