'use strict';

// Serve the store's Images folder through `ulanzi-image://images/<name>`.
// Names are content-addressed (`<sha1>.<ext>`) and validated, so the handler
// never joins a caller-supplied path. CORS is enabled because the renderer
// draws these images into canvases and calls toDataURL() on them; without an
// allow-origin header the canvas would be tainted and pushes would fail.

const fs = require('node:fs/promises');
const path = require('node:path');

const { imageByExtension } = require('./mime');
const { urlToFileName } = require('./image-url');

function createImageProtocol({ imagesDir }) {
  return async function handleImage(request) {
    const name = urlToFileName(request.url);
    if (!name) return new Response('Not found', { status: 404 });
    const type = imageByExtension(path.extname(name));
    if (!type) return new Response('Not found', { status: 404 });
    try {
      const data = await fs.readFile(path.join(imagesDir, name));
      return new Response(data, {
        status: 200,
        headers: {
          'content-type': type,
          'access-control-allow-origin': '*',
          // Content-addressed names never change contents.
          'cache-control': 'public, max-age=31536000, immutable',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  };
}

module.exports = { createImageProtocol };
