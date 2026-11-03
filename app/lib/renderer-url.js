'use strict';

const fs = require('node:fs');
const { fileURLToPath } = require('node:url');
const { isInside, isInsideReal } = require('./paths');

/** True when `url` is a file inside our own renderer directory. */
function isRendererFile(url, rendererDir) {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== 'file:' || parsed.host || parsed.search || parsed.hash) return false;
    const file = fileURLToPath(parsed);
    if (!isInside(rendererDir, file)) return false;
    return !fs.existsSync(file) || isInsideReal(rendererDir, file);
  } catch {
    return false;
  }
}

module.exports = { isRendererFile };
