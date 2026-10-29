'use strict';

const JSZip = require('jszip');
const { createHash } = require('node:crypto');

const COLUMNS = 5;
const ROWS = 3;

const DEFAULT_FONT = {
  Align: 'bottom',
  Color: 0xffffff,
  FontName: 'Source Han Sans SC',
  ShowTitle: true,
  Size: 10,
  Weight: 80,
};

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
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const data = Buffer.isBuffer(item.png) ? item.png : Buffer.from(item.png, 'base64');
    // Content-addressed names: the firmware may cache by path, and deduping
    // identical keys keeps the ZIP small.
    const name = `Images/${createHash('sha1').update(data).digest('hex')}.png`;
    if (!zip.file(name)) zip.file(name, data);
    manifest[`${col}_${row}`] = {
      State: 0,
      ViewParam: [{ Font: DEFAULT_FONT, Icon: name, Text: '' }],
    };
  }

  zip.file('manifest.json', JSON.stringify(manifest));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

module.exports = { buildPage, COLUMNS, ROWS, DEFAULT_FONT };
