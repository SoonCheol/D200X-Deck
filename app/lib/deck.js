'use strict';

const { EventEmitter } = require('node:events');
const HID = require('node-hid');
const P = require('./protocol');

const VENDOR_ID = 0x2207;
const PRODUCT_ID = 0x0019;
const CONTROL_INTERFACE = 0;

const DEFAULT_FONT = {
  Align: 'bottom',
  Color: 0xffffff,
  FontName: 'Source Han Sans SC',
  ShowTitle: true,
  Size: 10,
  Weight: 80,
};

class Deck extends EventEmitter {
  constructor() {
    super();
    this.device = null;
    this.path = null;
    this.info = null;
    this._readTimer = null;
    this._clockTimer = null;
    this._buffer = Buffer.alloc(0);
    this._lastStatus = null;
  }

  static find() {
    const devices = HID.devices().filter(
      (d) => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID
    );
    return devices.find((d) => d.interface === CONTROL_INTERFACE) || devices[0] || null;
  }

  get connected() {
    return Boolean(this.device);
  }

  connect() {
    if (this.device) return true;
    const found = (() => {
      try {
        return Deck.find();
      } catch (err) {
        this.status = { connected: false, message: err.message || 'device scan failed', info: null };
        return null;
      }
    })();
    if (!found) {
      this._status(false, 'Not connected');
      return false;
    }
    try {
      this.device = new HID.HID(found.path);
      this.path = found.path;
      this.info = {
        path: found.path,
        serial: found.serialNumber || null,
        interface: found.interface,
        manufacturer: found.manufacturer || null,
      };
      this.device.on('error', (err) => {
        this.emit('error', err.message || String(err));
        this.disconnect('Device error');
      });
      this.device.on('data', (data) => this._onReport(Buffer.from(data)));
      this._startClock();
      this._status(true, 'Connected');
      this.refreshDeviceInfo();
      return true;
    } catch (err) {
      this.device = null;
      this._status(false, this._explainOpenError(err));
      return false;
    }
  }

  _explainOpenError(err) {
    const msg = err && err.message ? err.message : String(err);
    if (/could not open|open failed|busy|exclusive/i.test(msg)) {
      return 'Device busy — quit Ulanzi Studio';
    }
    return msg;
  }

  disconnect(reason = 'Disconnected') {
    this._stopReading();
    this._stopClock();
    if (this.device) {
      try {
        this.device.close();
      } catch {
        /* already gone */
      }
      this.device = null;
    }
    this._status(false, reason);
  }

  _status(connected, message) {
    const state = { connected, message, info: connected ? this.info : null };
    this._lastStatus = state;
    this.emit('status', state);
  }

  status() {
    return this._lastStatus || { connected: false, message: 'Not connected', info: null };
  }

  sendFrame(cmd, proto, payload = Buffer.alloc(0)) {
    if (!this.device) throw new Error('device not connected');
    const reports = P.splitReports(P.encodeFrame(cmd, proto, payload));
    for (const report of reports) this.device.write(report);
  }

  pushPage(zipBuffer) {
    this.sendFrame(0, P.PROTO.PAGE, zipBuffer);
  }

  setBrightness(percent) {
    // Ulanzi sends QString::number(value, 10): plain ASCII decimal 0..100.
    // The device parses the digits as BCD in its acknowledgement.
    const n = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    this.sendFrame(0, P.PROTO.BRIGHTNESS, Buffer.from(String(n), 'utf8'));
  }

  setSleepTime(seconds) {
    const n = Math.max(0, Math.round(seconds));
    this.sendFrame(0, P.PROTO.SLEEP, Buffer.from(String(n), 'utf8'));
  }

  sendFont(font = DEFAULT_FONT) {
    this.sendFrame(0, P.PROTO.FONT, Buffer.from(JSON.stringify(font), 'utf8'));
  }

  requestDeviceInfo() {
    this.sendFrame(0, P.PROTO.DEVICE_INFO);
  }

  refreshDeviceInfo() {
    if (!this.device) return;
    try {
      this.sendFont();
      this.requestDeviceInfo();
    } catch (err) {
      this.emit('error', err.message || String(err));
    }
  }

  _startReading() {
    /* node-hid's 'data' event drives the read loop (see connect). */
  }

  _stopReading() {
    if (this._readTimer) clearInterval(this._readTimer);
    this._readTimer = null;
  }

  _startClock() {
    const tick = () => {
      if (!this.device) return;
      try {
        this.sendFrame(0, P.PROTO.CLOCK, P.clockPayload());
      } catch {
        /* disconnected */
      }
    };
    tick();
    this._clockTimer = setInterval(tick, 5000);
  }

  _stopClock() {
    if (this._clockTimer) clearInterval(this._clockTimer);
    this._clockTimer = null;
  }

  _onReport(data) {
    // The consumer interface may prepend a report id on some platforms.
    const frame = P.decodeReport(data[0] === 0 ? data.subarray(1) : data) || P.decodeReport(data);
    if (!frame) return;

    if (frame.cmd === P.CMD.KEY_EVENT && frame.proto === 0x01) {
      this._onKeyEvent(frame.payload);
      return;
    }
    if (frame.cmd === P.CMD.DEVICE_INFO && frame.proto === P.PROTO.DEVICE_INFO) {
      this._onDeviceInfo(frame.payload);
      return;
    }
    if (frame.cmd === 0x03 && frame.proto === P.PROTO.BRIGHTNESS) {
      this.emit('brightness', frame.payload[0]);
      return;
    }
    this.emit('frame', frame);
  }

  _onDeviceInfo(payload) {
    const text = payload.toString('utf8').replace(/\0+$/, '');
    try {
      const info = JSON.parse(text);
      this.info = { ...this.info, ...info };
      this._status(true, 'Connected');
    } catch {
      /* not json */
    }
  }

  /**
   * Key event payload: [kind, index, flags, state]
   * kind 1 = key, state 1 = press / 0 = release
   */
  _onKeyEvent(payload) {
    if (payload.length < 4) return;
    const kind = payload[0];
    const index = payload[1];
    const flags = payload[2];
    const state = payload[3];
    this.emit('key', { kind, index, flags, state, pressed: state === 1 });
  }
}

module.exports = { Deck, DEFAULT_FONT, VENDOR_ID, PRODUCT_ID };
