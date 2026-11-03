'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { isInside, isInsideReal } = require('./paths');
const { byExtension } = require('./mime');

/**
 * Build the request handler for a plugin property-inspector scheme.
 *
 * `getPluginDir(folder)` maps the first path segment to a plugin directory
 * (or null). `transformHtml(html, url, dir)` may inject the inspector bridge.
 * Files are only served from inside that directory.
 */
function createPluginProtocol({ getPluginDir, transformHtml = (html, _url, _dir) => html }) {
  return async (request) => {
    try {
      const url = new URL(request.url);
      const parts = url.pathname.split('/').filter(Boolean);
      const folder = decodeURIComponent(parts[0] || '');
      const rel = parts.slice(1).map(decodeURIComponent).join('/');
      const dir = getPluginDir(folder);
      if (!dir) return new Response('not found', { status: 404 });
      const file = path.join(dir, rel);
      if (!isInside(dir, file) || !isInsideReal(dir, file)) {
        return new Response('forbidden', { status: 403 });
      }
      const ext = path.extname(file).toLowerCase();
      let body = fs.readFileSync(file);
      if (ext === '.html' || ext === '.htm') {
        body = Buffer.from(transformHtml(body.toString('utf8'), url, dir), 'utf8');
      }
      return new Response(body, { headers: { 'content-type': byExtension(ext) } });
    } catch (err) {
      return new Response(String(err.message || err), { status: 500 });
    }
  };
}

module.exports = { createPluginProtocol };
