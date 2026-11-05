'use strict';

const fs = require('node:fs');

const MAX_BYTES = 1_000_000;

/**
 * Append-only diagnostics log with an in-memory size.
 *
 * Plugin hosts log every Stream Deck message, about four per second, so
 * exists/stat/append per line put three synchronous calls on the main thread.
 * The size is probed once, then updated from the bytes written; rotation renames
 * the file before the next line.
 */
class LogSink {
  constructor(file, { maxBytes = MAX_BYTES, fs: fsm = fs } = {}) {
    this.file = file;
    this.maxBytes = maxBytes;
    this.fs = fsm;
    this.size = -1; // -1 until probed
    this.broken = false;
  }

  _probe() {
    if (this.size >= 0) return;
    try {
      this.size = this.fs.existsSync(this.file) ? this.fs.statSync(this.file).size : 0;
    } catch {
      this.broken = true;
      this.size = 0;
    }
  }

  write(line) {
    if (this.broken) return;
    this._probe();
    const text = `${new Date().toISOString()} ${line}\n`;
    const bytes = Buffer.byteLength(text);
    try {
      if (this.size + bytes > this.maxBytes) {
        this.fs.renameSync(this.file, `${this.file}.1`);
        this.size = 0;
      }
      this.fs.appendFileSync(this.file, text);
      this.size += bytes;
    } catch {
      this.broken = true;
    }
  }

  /** Kept for hosts that close their log on shutdown; appends are synchronous. */
  close() {
    return Promise.resolve();
  }
}

module.exports = { LogSink, MAX_BYTES };
