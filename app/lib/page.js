'use strict';

const JSZip = require('jszip');
const { createHash } = require('node:crypto');

const { DEFAULT_FONT, COLUMNS, ROWS, WIDE_INDEX, WIDE_SLOT } = require('./constants');
// The D200 has 14 buttons: 13 square keys + one 2x1 key at slot "3_2".

/**
 * Build the page package for the deck.
 *
 * @param {Array<{index:number, png:string|Buffer}>} images - 196x196 PNGs.
 *        `png` may be a Buffer or a base64 string (no data: prefix).
 * @returns {Promise<Buffer>} ZIP buffer for protocol 0x01.
 */
async function buildPage(images) {
  const zip = new JSZip();
  zip.file('Images/', '');
  const manifest = {};

  for (const item of images) {
    const index = item.index;
    if (index === WIDE_INDEX) {
      // System panel: let the firmware render its small window (clock/stats).
      manifest[WIDE_SLOT] = {
        State: 0,
        SmallViewMode: 1,
        ViewParam: [{ Font: DEFAULT_FONT, Text: '' }],
      };
      continue;
    }
    const slot = `${index % COLUMNS}_${Math.floor(index / COLUMNS)}`;
    const data = Buffer.isBuffer(item.png) ? item.png : Buffer.from(item.png, 'base64');
    // Content-addressed names: the firmware may cache by path, and deduping
    // identical keys keeps the ZIP small.
    const name = `Images/${createHash('sha1').update(data).digest('hex')}.png`;
    if (!zip.file(name)) zip.file(name, data);
    manifest[slot] = {
      State: 0,
      ViewParam: [{ Font: DEFAULT_FONT, Icon: name, Text: '' }],
    };
  }

  zip.file('manifest.json', JSON.stringify(manifest));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

module.exports = { buildPage, COLUMNS, ROWS, WIDE_INDEX, WIDE_SLOT, DEFAULT_FONT };
