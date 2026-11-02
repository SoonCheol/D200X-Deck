'use strict';

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// ZIP archives are inspected through their central directory before anything is
// expanded, then unpacked by an asynchronous `unzip` child so the main process
// stays responsive. The extracted tree is measured again as a second check.
const MAX_ENTRIES = 10_000;
const MAX_EXPANDED_BYTES = 256 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_DIRECTORY_BYTES = 16 * 1024 * 1024;
const EXTRACT_TIMEOUT_MS = 60_000;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

function megabytes(bytes) {
  return Math.round(bytes / (1024 * 1024));
}

function readAt(fd, buffer, position) {
  let read = 0;
  while (read < buffer.length) {
    const count = fs.readSync(fd, buffer, read, buffer.length - read, position + read);
    if (count <= 0) throw new Error('This archive is truncated');
    read += count;
  }
}

function isSafeEntry(name) {
  if (!name) return false;
  const normalized = name.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return false;
  return !normalized.split('/').some((part) => part === '..');
}

/**
 * Read the central directory and enforce archive limits without extracting.
 * @returns {{ entries: number, expandedBytes: number, names: string[] }}
 */
function inspectZip(file, options = {}) {
  const {
    maxEntries = MAX_ENTRIES,
    maxExpandedBytes = MAX_EXPANDED_BYTES,
    maxArchiveBytes = MAX_ARCHIVE_BYTES,
  } = options;

  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error('This path is not a file');
  if (stat.size > maxArchiveBytes) {
    throw new Error(`This archive is too large (max ${megabytes(maxArchiveBytes)} MB)`);
  }
  if (stat.size < 22) throw new Error('This file is not a ZIP archive');

  const fd = fs.openSync(file, 'r');
  try {
    const tailSize = Math.min(stat.size, 22 + 0xffff);
    const tail = Buffer.alloc(tailSize);
    readAt(fd, tail, stat.size - tailSize);
    let eocd = -1;
    for (let index = tail.length - 22; index >= 0; index -= 1) {
      if (tail.readUInt32LE(index) === EOCD_SIGNATURE) {
        eocd = index;
        break;
      }
    }
    if (eocd < 0) throw new Error('This file is not a ZIP archive');

    const entries = tail.readUInt16LE(eocd + 10);
    const directoryBytes = tail.readUInt32LE(eocd + 12);
    const directoryOffset = tail.readUInt32LE(eocd + 16);
    if (entries === 0xffff || directoryBytes === 0xffffffff || directoryOffset === 0xffffffff) {
      throw new Error('ZIP64 archives are not supported');
    }
    if (entries > maxEntries) {
      throw new Error(`This archive has too many files (${entries}, max ${maxEntries})`);
    }
    if (directoryOffset + directoryBytes > stat.size || directoryBytes > MAX_DIRECTORY_BYTES) {
      throw new Error('This archive has an invalid directory');
    }

    const directory = Buffer.alloc(directoryBytes);
    readAt(fd, directory, directoryOffset);
    const names = [];
    let expandedBytes = 0;
    let offset = 0;
    for (let index = 0; index < entries; index += 1) {
      if (offset + 46 > directory.length || directory.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
        throw new Error('This archive has an invalid directory');
      }
      const uncompressedBytes = directory.readUInt32LE(offset + 24);
      if (uncompressedBytes === 0xffffffff) throw new Error('ZIP64 archives are not supported');
      const nameBytes = directory.readUInt16LE(offset + 28);
      const extraBytes = directory.readUInt16LE(offset + 30);
      const commentBytes = directory.readUInt16LE(offset + 32);
      const name = directory.toString('utf8', offset + 46, offset + 46 + nameBytes);
      if (!isSafeEntry(name)) throw new Error('This archive contains an unsafe path');
      names.push(name);
      expandedBytes += uncompressedBytes;
      if (expandedBytes > maxExpandedBytes) {
        throw new Error(`This archive expands to more than ${megabytes(maxExpandedBytes)} MB`);
      }
      offset += 46 + nameBytes + extraBytes + commentBytes;
    }
    return { entries, expandedBytes, names };
  } finally {
    fs.closeSync(fd);
  }
}

function runUnzip(args, { timeoutMs = EXTRACT_TIMEOUT_MS, maxBuffer = 4 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    execFile('unzip', args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || err.message || '').trim().split('\n').filter(Boolean).pop();
        reject(new Error(detail || 'Could not unpack the archive'));
        return;
      }
      resolve(stdout);
    });
  });
}

async function dirSize(dir) {
  let total = 0;
  const pending = [dir];
  while (pending.length > 0) {
    const current = pending.pop();
    let entries;
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    const files = [];
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.isFile()) files.push(full);
    }
    const sizes = await Promise.all(
      files.map(async (file) => {
        try {
          return (await fs.promises.stat(file)).size;
        } catch {
          return 0;
        }
      })
    );
    total += sizes.reduce((sum, size) => sum + size, 0);
  }
  return total;
}

/** Unpack a ZIP after checking entry count, expanded size and entry paths. */
async function extractZip(source, destination, options = {}) {
  const info = inspectZip(source, options);
  fs.mkdirSync(destination, { recursive: true });
  await runUnzip(['-oq', source, '-d', destination], options);
  const extractedBytes = await dirSize(destination);
  const maxExpandedBytes = options.maxExpandedBytes ?? MAX_EXPANDED_BYTES;
  if (extractedBytes > maxExpandedBytes) {
    throw new Error(`This archive expands to more than ${megabytes(maxExpandedBytes)} MB`);
  }
  return { ...info, extractedBytes };
}

/** Read one ZIP entry without unpacking the rest of the archive. */
async function readZipEntry(source, name, maxBytes = 1024 * 1024) {
  const { names } = inspectZip(source);
  if (!names.includes(name)) return null;
  return runUnzip(['-p', source, name], { maxBuffer: maxBytes });
}

module.exports = {
  inspectZip,
  extractZip,
  readZipEntry,
  isSafeEntry,
  MAX_ENTRIES,
  MAX_EXPANDED_BYTES,
  MAX_ARCHIVE_BYTES,
};
