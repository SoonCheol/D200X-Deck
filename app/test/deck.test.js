'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');

const P = require('../lib/protocol');
const sysstats = require('../lib/sysstats');

class FakeHID extends EventEmitter {
  constructor(path) {
    super();
    this.path = path;
    this.writes = [];
    this.closed = false;
  }

  write(buffer) {
    this.writes.push(Buffer.from(buffer));
    return buffer.length;
  }

  close() {
    this.closed = true;
  }
}

const devices = [
  { vendorId: 0x2207, productId: 0x0019, interface: 1, path: 'other' },
  { vendorId: 0x2207, productId: 0x0019, interface: 0, path: 'control', serialNumber: 'serial' },
];

const originalLoad = Module._load;
let Deck;
try {
  Module._load = function load(request, parent, isMain) {
    if (request === 'node-hid') return { devices: () => devices, HID: FakeHID };
    return originalLoad.call(this, request, parent, isMain);
  };
  ({ Deck } = require('../lib/deck'));
} finally {
  Module._load = originalLoad;
}

function restoreStats(t) {
  const original = {
    start: sysstats.start,
    stop: sysstats.stop,
    latest: sysstats.latest,
  };
  sysstats.start = () => {};
  sysstats.stop = () => {};
  sysstats.latest = () => ({ cpu: 10, mem: 20, gpu: 30 });
  t.after(() => Object.assign(sysstats, original));
}

function connectedDeck(t) {
  restoreStats(t);
  const deck = new Deck();
  assert.equal(deck.connect(), true);
  t.after(() => deck.disconnect('test'));
  return deck;
}

test('find selects the control interface and connect tracks status', (t) => {
  restoreStats(t);
  const deck = new Deck();

  assert.equal(Deck.find().path, 'control');
  assert.equal(deck.connect(), true);
  assert.equal(deck.connected, true);
  assert.equal(deck.path, 'control');
  assert.equal(deck.status().connected, true);
  assert.equal(deck.device.writes.length > 0, true, 'font and device info are requested');
  t.after(() => deck.disconnect('test'));
});

test('connect explains a busy device without throwing', (t) => {
  restoreStats(t);
  class BusyHID extends FakeHID {
    constructor() {
      super();
      throw new Error('could not open device: busy');
    }
  }
  const original = Module._load;
  let BusyDeck;
  try {
    Module._load = function load(request, parent, isMain) {
      if (request === 'node-hid') return { devices: () => devices, HID: BusyHID };
      return original.call(this, request, parent, isMain);
    };
    delete require.cache[require.resolve('../lib/deck')];
    ({ Deck: BusyDeck } = require('../lib/deck'));
  } finally {
    Module._load = original;
  }
  const deck = new BusyDeck();

  assert.equal(deck.connect(), false);
  assert.equal(deck.connected, false);
  assert.equal(deck.status().message, 'Device busy — quit Ulanzi Studio');
});

test('brightness and sleep clamp and encode their payloads', (t) => {
  const deck = connectedDeck(t);
  deck.device.writes.length = 0;

  deck.setBrightness(150);
  deck.setSleepTime(30);

  const brightness = P.decodeReport(deck.device.writes[0].subarray(1));
  const sleep = P.decodeReport(deck.device.writes[1].subarray(1));
  assert.equal(brightness.payload.toString(), '100');
  assert.equal(sleep.payload.toString(), '30');
  assert.equal(deck._sleepSeconds, 30);
});

test('pushKey sends a protocol 0x0d single-key package', (t) => {
  const deck = connectedDeck(t);
  deck.device.writes.length = 0;

  deck.pushKey(Buffer.from('one-key-zip'));

  const frame = P.decodeReport(deck.device.writes[0].subarray(1));
  assert.equal(frame.proto, P.PROTO.KEY);
  assert.equal(frame.payload.toString(), 'one-key-zip');
});

test('wide mode selects the clock interval', (t) => {
  const deck = connectedDeck(t);

  deck.setWideMode('stats');
  assert.equal(deck._wideMode, 'stats');
  assert.equal(deck._clockMs, 1000);

  deck.setWideMode('blank');
  assert.equal(deck._clockMs, 0);

  deck.setWideMode('clock');
  assert.equal(deck._clockMs, 5000);

  deck.setSleepTime(60);
  assert.equal(deck._clockMs, 60_000);
});

test('key and device-info reports are emitted and merged', (t) => {
  const deck = connectedDeck(t);
  const keys = [];
  deck.on('key', (event) => keys.push(event));

  const keyFrame = P.encodeFrame(P.CMD.KEY_EVENT, 0x01, Buffer.from([1, 7, 0, 1]));
  deck.device.emit('data', Buffer.concat([Buffer.from([0]), keyFrame]));
  const infoFrame = P.encodeFrame(
    P.CMD.DEVICE_INFO,
    P.PROTO.DEVICE_INFO,
    Buffer.from(JSON.stringify({ firmware: '1.2.3' }))
  );
  deck.device.emit('data', infoFrame);

  assert.deepEqual(keys, [{ kind: 1, index: 7, flags: 0, state: 1, pressed: true }]);
  assert.equal(deck.info.firmware, '1.2.3');
  assert.equal(deck.status().connected, true);
});

test('disconnect closes the device and clears status', (t) => {
  const deck = connectedDeck(t);

  deck.disconnect('Unplugged');

  assert.equal(deck.connected, false);
  assert.equal(deck.device, null);
  assert.equal(deck.status().connected, false);
  assert.equal(deck.status().message, 'Unplugged');
});
