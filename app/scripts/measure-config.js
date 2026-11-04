'use strict';

// Measure the config payload the renderer receives at startup.
//
// The app stores images on disk as `file:<name>` refs but expands them back to
// data URLs before handing the config to the renderer (`config:state`). This
// script reports how big that expanded payload is and how long the conversion
// takes, using either a copy of a real profile or a generated large one.
//
// Usage:
//   node scripts/measure-config.js
//   node scripts/measure-config.js --config "$HOME/Library/Application Support/Ulanzi Deck Open"
//   node scripts/measure-config.js --pages 30 --keys 13 --icon-kb 60 --bg-kb 300

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const { Store, createDefaultConfig } = require('../lib/store');

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}

const pages = Math.max(1, Number(arg('pages', 20)) || 20);
const keysPerPage = Math.max(1, Number(arg('keys', 13)) || 13);
const iconKb = Math.max(1, Number(arg('icon-kb', 12)) || 12);
const photoKb = Math.max(1, Number(arg('photo-kb', 250)) || 250);
const photoShare = Math.min(1, Math.max(0, Number(arg('photo-share', 0.1)) || 0));
const bgKb = Math.max(0, Number(arg('bg-kb', 180)) || 180);
const realDir = arg('config', null);

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// --------------------------------------------------------------- PNG writer

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * A flat icon-like image (a few blocks) plus controlled noise. The noise
 * fraction approximates the requested compressed size, so callers can model
 * icon-pack icons (~10 KB), app icons (~30 KB) or photos (~250 KB).
 */
function makePng(width, height, seed, targetBytes) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const base = [(seed * 37) & 0xff, (seed * 71) & 0xff, (seed * 113) & 0xff];
  const accent = [(base[0] + 90) & 0xff, (base[1] + 60) & 0xff, (base[2] + 30) & 0xff];
  const shade = [(base[0] + 30) & 0xff, (base[1] + 30) & 0xff, (base[2] + 30) & 0xff];
  const target = targetBytes || 0;
  const noiseBytes = Math.max(0, target - 4096);
  const fraction = Math.min(0.95, noiseBytes / (width * height * 3));
  let state = (seed * 2654435761) >>> 0;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = row + 1 + x * 3;
      if (rand() < fraction) {
        raw[i] = (rand() * 255) | 0;
        raw[i + 1] = (rand() * 255) | 0;
        raw[i + 2] = (rand() * 255) | 0;
        continue;
      }
      const centre =
        x > width * 0.2 && x < width * 0.8 && y > height * 0.2 && y < height * 0.8;
      const stripe = (x + y + seed) % 64 < 8;
      const color = centre ? accent : stripe ? shade : base;
      raw[i] = color[0];
      raw[i + 1] = color[1];
      raw[i + 2] = color[2];
    }
  }
  const idat = zlib.deflateSync(raw, { level: 6 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function dataUrl(png, mime = 'image/png') {
  return `data:${mime};base64,${png.toString('base64')}`;
}

// --------------------------------------------------------------- fixtures

function copyReal(dir) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-measure-'));
  fs.copyFileSync(path.join(dir, 'config.json'), path.join(temp, 'config.json'));
  const images = path.join(dir, 'Images');
  if (fs.existsSync(images)) fs.cpSync(images, path.join(temp, 'Images'), { recursive: true });
  return temp;
}

function makeSynthetic(dir) {
  const config = createDefaultConfig();
  const photoEvery = photoShare > 0 ? Math.max(1, Math.round(1 / photoShare)) : 0;
  const background = bgKb ? makePng(980, 588, 2, bgKb * 1024) : null;
  config.pages = [];
  for (let p = 0; p < pages; p += 1) {
    const page = {
      id: `page-${p}`,
      profileId: config.activeProfileId,
      name: `Page ${p + 1}`,
      keys: {},
      parentId: null,
    };
    if (background) page.background = dataUrl(background);
    for (let k = 0; k < keysPerPage; k += 1) {
      const seed = p * keysPerPage + k + 3;
      const photo = photoEvery > 0 && seed % photoEvery === 0;
      page.keys[k] = {
        emoji: '',
        label: `Key ${k + 1}`,
        color: '#1b2130',
        icon: dataUrl(makePng(392, 392, seed, (photo ? photoKb : iconKb) * 1024)),
        action: { type: 'none' },
      };
    }
    config.pages.push(page);
  }
  config.activePageId = config.pages[0].id;
  if (background) {
    config.settings.standbyImage = dataUrl(background);
    config.settings.lockImage = dataUrl(background);
  }
  const store = new Store(dir);
  const t0 = process.hrtime.bigint();
  store.save(config);
  const saveMs = Number(process.hrtime.bigint() - t0) / 1e6;
  return { store, saveMs, iconCount: pages * keysPerPage };
}

function dirSize(dir) {
  if (!fs.existsSync(dir)) return { bytes: 0, files: 0, largest: 0 };
  let bytes = 0;
  let files = 0;
  let largest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const size = fs.statSync(path.join(dir, entry.name)).size;
    bytes += size;
    files += 1;
    largest = Math.max(largest, size);
  }
  return { bytes, files, largest };
}

// --------------------------------------------------------------- measure

function main() {
  const temp = realDir ? copyReal(realDir) : fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-measure-'));
  let saveMs = null;
  if (!realDir) ({ saveMs } = makeSynthetic(temp));

  const store = new Store(temp);
  const t0 = process.hrtime.bigint();
  store.load();
  const loadMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const config = store.config;

  const t1 = process.hrtime.bigint();
  const json = JSON.stringify(config);
  const stringifyMs = Number(process.hrtime.bigint() - t1) / 1e6;
  const t2 = process.hrtime.bigint();
  JSON.parse(json);
  const parseMs = Number(process.hrtime.bigint() - t2) / 1e6;

  const payload = Buffer.byteLength(json);
  const configFile = fs.statSync(store.file).size;
  const images = dirSize(store.imagesDir);
  const dataUrls = (json.match(/"data:image\//g) || []).length;
  const fileRefs = (fs.readFileSync(store.file, 'utf8').match(/"file:/g) || []).length;
  const keyCount = (config.pages || []).reduce(
    (sum, page) => sum + Object.keys(page.keys || {}).length,
    0
  );

  console.log(`source:      ${realDir || 'synthetic'}`);
  console.log(`config file: ${kb(configFile)} (${fileRefs} file: refs)`);
  console.log(`images dir:  ${mb(images.bytes)} (${images.files} files, largest ${kb(images.largest)})`);
  console.log(`pages:       ${(config.pages || []).length}`);
  console.log(`keys:        ${keyCount}`);
  console.log(`data URLs:   ${dataUrls} (what the renderer receives)`);
  console.log('');
  console.log(`internalized payload: ${mb(payload)}`);
  console.log(`  vs on-disk config:  ${(payload / Math.max(1, configFile)).toFixed(1)}x`);
  console.log(`  vs image bytes:     ${(payload / Math.max(1, images.bytes)).toFixed(1)}x`);
  console.log('');
  console.log(`store.load(): ${loadMs.toFixed(1)} ms`);
  console.log(`stringify:    ${stringifyMs.toFixed(1)} ms`);
  console.log(`parse:        ${parseMs.toFixed(1)} ms`);
  if (saveMs !== null) console.log(`store.save(): ${saveMs.toFixed(1)} ms`);

  fs.rmSync(temp, { recursive: true, force: true });
}

if (require.main === module) main();

module.exports = { makePng };
