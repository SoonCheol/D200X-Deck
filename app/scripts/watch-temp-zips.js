'use strict';

// Dev-only: preserve the ZIPs Ulanzi Studio stages before sending them to the
// deck. The app deletes them immediately after the HID transfer, so this
// watcher hard-links each new .zip and copies each staging directory.
//
// Usage:
//   ULANZI_TEMP="$HOME/Library/Application Support/Ulanzi/UlanziDeck/TempData/<serial>" \
//   ULANZI_CAPTURE_DIR=/tmp/ulanzi-captures node app/scripts/watch-temp-zips.js
//
// Run it before launching Ulanzi Studio, then trigger the feature you want to
// capture (page switch, Uclock mode, ...).

const fs = require('node:fs');
const path = require('node:path');

const root = process.env.ULANZI_TEMP;
const out = process.env.ULANZI_CAPTURE_DIR || '/tmp/ulanzi-captures';
if (!root || !fs.existsSync(root)) {
  console.error('Set ULANZI_TEMP to UlanziDeck/TempData/<device-serial>');
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
const seen = new Set();

function linkZip(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const dest = path.join(out, `${Date.now()}-${path.basename(file)}`);
  try {
    fs.linkSync(file, dest);
    console.log('[capture] hardlink', file, '->', dest);
  } catch (err) {
    try {
      fs.copyFileSync(file, dest);
      console.log('[capture] copy', file, '->', dest);
    } catch (copyErr) {
      console.log('[capture] zip failed', file, err.message, copyErr.message);
      seen.delete(file);
    }
  }
}

function copyDir(dir) {
  if (seen.has(dir)) return;
  seen.add(dir);
  const dest = path.join(out, `${Date.now()}-${path.basename(dir)}`);
  try {
    fs.cpSync(dir, dest, { recursive: true });
    console.log('[capture] dir', dir, '->', dest);
  } catch (err) {
    console.log('[capture] dir failed', dir, err.message);
  }
}

function scan() {
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isFile() && entry.name.endsWith('.zip')) linkZip(full);
    if (entry.isDirectory()) {
      let hasFiles = false;
      try {
        hasFiles = fs.readdirSync(full).length > 0;
      } catch {
        /* removed while scanning */
      }
      if (hasFiles) copyDir(full);
    }
  }
}

console.log('[capture] watching', root);
fs.watch(root, { persistent: true }, () => scan());
setInterval(scan, 5);
scan();
