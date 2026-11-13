'use strict';
// Only hardware transport; no legacy Ulanzi renderer, store, inspector or action engine.
const { EventEmitter } = require('node:events');
const { Deck } = require('../lib/deck');
const { buildPage } = require('../lib/page');

class D200XTransport extends EventEmitter {
  constructor() {
    super();
    this.deck = new Deck();
    this.timer = null;
    this.inFlight = false;
    this.pending = null;
    this.currentImages = null;
    this.closed = false;
    this.deck.on('status', status => {
      this.emit('status', status);
      if (status.connected && this.currentImages) this.schedule(this.currentImages);
    });
    this.deck.on('key', event => this.emit('key', event));
    this.deck.on('error', message => this.emit('error-message', String(message)));
  }

  async start() {
    if (this.closed) return;
    try {
      if (!this.deck.connected) await this.deck.connectAsync();
    } catch (error) {
      this.emit('error-message', String(error?.message || error));
    }
    if (!this.timer) this.timer = setInterval(async () => {
      if (!this.closed && !this.deck.connected) {
        try { await this.deck.connectAsync(); }
        catch (error) { this.emit('error-message', String(error?.message || error)); }
      }
    }, 4000);
    this.emit('status', this.deck.status());
  }

  schedule(images) {
    if (this.closed) return;
    // Coalesce edits, and keep the freshest whole page when writes are busy.
    this.currentImages = images;
    this.pending = images;
    this.flush().catch(error => this.emit('error-message', String(error?.message || error)));
  }

  async flush() {
    if (this.inFlight || !this.deck.connected || !this.pending) return;
    this.inFlight = true;
    try {
      while (this.pending && this.deck.connected && !this.closed) {
        const images = this.pending;
        this.pending = null;
        const zip = await buildPage(images, 'blank');
        if (this.pending || this.closed || !this.deck.connected) continue;
        this.deck.setWideMode('blank');
        this.deck.pushPage(zip);
        this.emit('synced', { slots: images.length });
      }
    } finally {
      this.inFlight = false;
      // Do not let a fast edit made while a ZIP was building go missing.
      if (this.pending && this.deck.connected && !this.closed) {
        queueMicrotask(() => this.flush().catch(error =>
          this.emit('error-message', String(error?.message || error))));
      }
    }
  }

  stop() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.pending = null;
    this.deck.disconnect('Editor closed');
  }
}

module.exports = { D200XTransport };
