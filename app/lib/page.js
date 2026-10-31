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
const WIDE_MODES = { stats: 0, clock: 1, blank: 2 };

async function buildPage(images, wideMode = 'clock') {
  const zip = new JSZip();
  zip.file('Images/', '');
  const manifest = {};

  for (const item of images) {
    const index = item.index;
    if (index === WIDE_INDEX) {
      // System panel: the firmware draws clock/stats itself. In background
      // mode it shows the page image, which we send as the wide key image.
      const entry = {
        State: 0,
        SmallViewMode: WIDE_MODES[wideMode] ?? WIDE_MODES.clock,
        ViewParam: [{ Font: DEFAULT_FONT, Text: '' }],
      };
      if (wideMode === 'blank') {
        const data = Buffer.isBuffer(item.png) ? item.png : Buffer.from(item.png, 'base64');
        const name = `Images/${createHash('sha1').update(data).digest('hex')}.png`;
        if (!zip.file(name)) zip.file(name, data);
        entry.ViewParam[0].Icon = name;
      }
      manifest[WIDE_SLOT] = entry;
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

module.exports = { buildPage, WIDE_MODES, COLUMNS, ROWS, WIDE_INDEX, WIDE_SLOT, DEFAULT_FONT };
