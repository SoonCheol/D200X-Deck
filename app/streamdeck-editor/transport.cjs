'use strict';
// D200X device-only transport. One owner for page and keep-alive HID writes.
// Do not reuse the legacy editor, action handlers or plugin infrastructure.
const { EventEmitter } = require('node:events');
const { Deck } = require('../lib/deck');
const { buildPage } = require('../lib/page');
const { PROTO } = require('../lib/protocol');

const KEEPALIVE_MS = 5000;
const RECONNECT_MS = 4000;
const TICK_MS = 1000;
const IMAGE_MODE_PAYLOAD = Buffer.from('2|||||24H|', 'utf8');

class D200XTransport extends EventEmitter {
  constructor(options = {}) {
    super();
    this.deck = options.deck || new Deck();
    this.buildPage = options.buildPage || buildPage;
    this.now = options.now || (() => Date.now());
    this.timer = null;
    this.connecting = null;
    this.inFlight = false;
    this.pending = null;
    this.currentImages = null;
    this.closed = false;
    this.wasConnected = false;
    this.lastWriteAt = 0;
    this.lastConnectAttempt = 0;
    this.brightness = null; // Never invent/override the user's brightness.
    this.session = 0;
    this.deck.on('status', status => {
      const connected = Boolean(status.connected);
      this.emit('status', status);
      if (!connected) {
        if (this.wasConnected) this.log('disconnect', status.message || 'Disconnected');
        this.wasConnected = false;
        // A failed large page transfer must not discard the saved page.
        if (this.currentImages) this.pending = this.currentImages;
        return;
      }
      if (!this.wasConnected) {
        this.wasConnected = true;
        this.session++;
        this.lastWriteAt = this.now();
        this.log('connected', 'HID connection opened; restoring saved page');
        if (this.currentImages) this.schedule(this.currentImages);
      }
      // Device info may cause repeated connected status events. Do not resend
      // the entire page for each such event.
    });
    this.deck.on('key', event => this.emit('key', event));
    this.deck.on('brightness', value => {
      if (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100)
        this.brightness = Math.round(Number(value));
    });
    this.deck.on('error', message => this.emit('error-message', String(message)));
  }

  log(type, detail) {
    const info = { type, detail, at: new Date(this.now()).toISOString() };
    this.emit('diagnostic', info);
  }

  async connect() {
    if (this.closed || this.deck.connected || this.connecting) return this.connecting;
    this.lastConnectAttempt = this.now();
    this.connecting = Promise.resolve().then(() => this.deck.connectAsync());
    try { return await this.connecting; }
    catch (error) {
      this.emit('error-message', String(error?.message || error));
      return false;
    } finally {
      this.connecting = null;
    }
  }

  async start() {
    if (this.closed) return;
    await this.connect();
    if (this.closed || this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.emit('status', this.deck.status());
  }

  tick() {
    if (this.closed) return;
    if (!this.deck.connected) {
      if (!this.connecting && this.now() - this.lastConnectAttempt >= RECONNECT_MS)
        this.connect().catch(error => this.emit('error-message', String(error?.message || error)));
      return;
    }
    if (this.inFlight || this.pending || this.now() - this.lastWriteAt < KEEPALIVE_MS) return;
    try {
      // Re-state known brightness (as OpenDeck does) without redrawing keys.
      // When no brightness has ever been observed, use the existing image-mode
      // time packet used by D200X controllers; don't change brightness blindly.
      if (this.brightness !== null) {
        this.deck.setBrightness(this.brightness);
      } else {
        this.deck.sendFrame(0, PROTO.CLOCK, IMAGE_MODE_PAYLOAD);
      }
      this.lastWriteAt = this.now();
      this.log('keepalive', this.brightness === null ? 'image-mode packet' : 'existing brightness');
    } catch (error) {
      this.log('write-failure', 'Keep-alive failed');
      this.emit('error-message', String(error?.message || error));
      // Deck.sendFrame already drops an invalid handle.
    }
  }

  adjustBrightness(direction,count=1) {
    if(this.closed||!this.deck.connected)throw new Error('D200X가 연결되지 않았습니다.');
    if(this.brightness===null)throw new Error('기기 밝기 값을 아직 확인하지 못했습니다.');
    if(![-1,1].includes(direction)||![1,2,5,10].includes(count))throw new Error('잘못된 밝기 조절 요청입니다.');
    const next=Math.max(0,Math.min(100,this.brightness+direction*count));
    if(next!==this.brightness){
      this.deck.setBrightness(next);this.brightness=next;
      this.lastWriteAt=this.now();this.log('brightness-change',String(next));
    }
    return next;
  }

  schedule(images) {
    if (this.closed) return;
    this.currentImages = images;
    this.pending = images;
    this.flush().catch(error => this.emit('error-message', String(error?.message || error)));
  }

  async flush() {
    if (this.inFlight || !this.deck.connected || !this.pending || this.closed) return;
    this.inFlight = true;
    let failed = false;
    try {
      while (this.pending && this.deck.connected && !this.closed) {
        const images = this.pending;
        this.pending = null;
        const generation = this.session;
        let zip;
        try {
          zip = await this.buildPage(images, 'blank');
          if (this.pending || this.closed || !this.deck.connected || generation !== this.session) continue;
          // Synchronous multi-report write: the keep-alive timer cannot
          // interleave its HID reports inside a page transfer.
          this.deck.setWideMode('blank');
          this.deck.pushPage(zip);
          this.lastWriteAt = this.now();
          this.log('page-sent', String(images.length) + ' slots');
          this.emit('synced', { slots: images.length });
        } catch (error) {
          failed = true;
          // Keep the page in currentImages for the next reconnect or edit.
          // If still connected, leave the queue idle rather than retrying
          // an invalid ZIP forever or blocking keep-alives.
          this.pending = this.deck.connected ? null : this.currentImages;
          this.log('write-failure', 'Page transfer failed');
          this.emit('error-message', String(error?.message || error));
          // Avoid immediate retry loops for errors unrelated to unplugging.
          break;
        }
      }
    } finally {
      this.inFlight = false;
      if (!failed && this.pending && this.deck.connected && !this.closed)
        queueMicrotask(() => this.flush().catch(error =>
          this.emit('error-message', String(error?.message || error))));
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

module.exports = { D200XTransport, KEEPALIVE_MS, RECONNECT_MS };
