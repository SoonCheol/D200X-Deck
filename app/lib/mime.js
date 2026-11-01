'use strict';

// One MIME table for plugin assets, property inspectors and picked images.
// Keys are lower-case extensions including the dot.
const TYPES = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
};

const IMAGE_TYPES = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
};

function normalizeExtension(ext) {
  const value = String(ext || '').toLowerCase();
  if (!value) return '';
  return value.startsWith('.') ? value : `.${value}`;
}

/** MIME type for a path or extension; octet-stream when unknown. */
function byExtension(ext) {
  return TYPES[normalizeExtension(ext)] || 'application/octet-stream';
}

/** MIME type for an image extension; null when it is not an image. */
function imageByExtension(ext) {
  return IMAGE_TYPES[normalizeExtension(ext)] || null;
}

module.exports = { TYPES, byExtension, imageByExtension };
