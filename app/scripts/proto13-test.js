'use strict';

// Device probe for the D200 incremental single-key protocol (0x0d).
//
// Quit Ulanzi Deck Open first: this opens the HID device directly.
// Usage: node scripts/proto13-test.js
// The first key (slot 0_0) should show the Ulanzi app icon for ~6 seconds,
// while every other key stays untouched. Reopen the app / push to restore.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const HID = require('node-hid');

const P = require('../lib/protocol');
const { buildKeyUpdate } = require('../lib/page');

const VENDOR_ID = 0x2207;
const PRODUCT_ID = 0x0019;

function findDeck() {
  const devices = HID.devices().filter(
    (device) => device.vendorId === VENDOR_ID && device.productId === PRODUCT_ID
  );
  return devices.find((device) => device.interface === 0) || devices[0] || null;
}

function testImage() {
  const source = path.join(__dirname, '..', 'build', 'icon.png');
  const destination = path.join(os.tmpdir(), 'ulanzi-proto13-test.png');
  execFileSync('/usr/bin/sips', ['-z', '196', '196', source, '--out', destination], {
    stdio: 'ignore',
  });
  const data = fs.readFileSync(destination);
  fs.rmSync(destination, { force: true });
  return data;
}

(async () => {
  const found = findDeck();
  if (!found) {
    console.error('No D200 found. Is it connected?');
    process.exit(1);
  }

  let device;
  try {
    device = new HID.HID(found.path);
  } catch (err) {
    console.error(`Could not open the deck: ${err.message}`);
    console.error('Quit Ulanzi Deck Open and try again.');
    process.exit(1);
  }

  try {
    const zip = await buildKeyUpdate('0_0', testImage());
    const reports = P.splitReports(P.encodeFrame(0, P.PROTO.KEY, zip));
    for (const report of reports) device.write(report);
    console.log(`Sent protocol 0x0d one-key update (${zip.length} bytes, ${reports.length} reports).`);
    console.log('Look at the first key (top-left): it should show the app icon.');
    console.log('Every other key must stay exactly as it was.');
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } finally {
    try {
      device.close();
    } catch {
      /* already closed */
    }
  }
  console.log('Done. Reopen Ulanzi Deck Open or press Push to restore the page.');
})();
