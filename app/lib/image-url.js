(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DeckImageUrl = factory();
})(globalThis, function () {
  'use strict';

  // Config images are stored as `file:<name>` next to config.json. The renderer
  // cannot read that path, so `ulanzi-image://images/<name>` serves the same
  // file through a private, CORS-enabled scheme.
  const SCHEME = 'ulanzi-image';
  const NAME = /^[A-Za-z0-9._-]+$/;

  /** The stored file name for a `file:` value, or null. Never a path. */
  function fileName(value) {
    if (typeof value !== 'string' || !value.startsWith('file:')) return null;
    const name = value.slice(5);
    return NAME.test(name) && name !== '.' && name !== '..' ? name : null;
  }

  /** Turn a config value into something the renderer can load. */
  function imageUrl(value) {
    const name = fileName(value);
    return name ? `${SCHEME}://images/${name}` : value;
  }

  /** The file name for an `ulanzi-image://images/<name>` URL, or null. */
  function urlToFileName(value) {
    if (typeof value !== 'string' || !value.startsWith(`${SCHEME}://`)) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== `${SCHEME}:` || url.hostname !== 'images') return null;
      const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
      return NAME.test(name) && name !== '.' && name !== '..' ? name : null;
    } catch {
      return null;
    }
  }

  return { SCHEME, fileName, imageUrl, urlToFileName };
});
