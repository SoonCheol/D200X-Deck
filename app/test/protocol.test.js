'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { encodeFrame, splitReports, decodeReport, MAGIC, CHUNK, CMD, PROTO } = require('../lib/protocol');

test('encodeFrame builds the documented header', () => {
  const payload = Buffer.from([1, 2, 3, 4]);
  const frame = encodeFrame(CMD.KEY_EVENT, PROTO.PAGE, payload);
  assert.equal(frame.subarray(0, 2).toString('hex'), MAGIC.toString('hex'));
  assert.equal(frame[2], CMD.KEY_EVENT);
  assert.equal(frame[3], PROTO.PAGE);
  assert.equal(frame.readUInt32LE(4), payload.length);
  assert.deepEqual(frame.subarray(8, 12), payload);
});

test('encodeFrame pads to a 1024-byte boundary and keeps the length field', () => {
  const frame = encodeFrame(CMD.KEY_EVENT, PROTO.PAGE, Buffer.alloc(10, 7));
  assert.equal(frame.length % CHUNK, 0);
  assert.equal(frame.readUInt32LE(4), 10);
});

test('splitReports returns 1025-byte reports (report id + chunk)', () => {
  const stream = encodeFrame(CMD.KEY_EVENT, PROTO.PAGE, Buffer.alloc(CHUNK * 2, 1));
  const reports = splitReports(stream);
  assert.equal(reports.length, stream.length / CHUNK);
  for (const report of reports) assert.equal(report.length, CHUNK + 1);
});

test('decodeReport parses a valid frame', () => {
  const payload = Buffer.from('hello');
  const frame = encodeFrame(CMD.DEVICE_INFO, PROTO.DEVICE_INFO, payload);
  const decoded = decodeReport(frame);
  assert.ok(decoded);
  assert.equal(decoded.cmd, CMD.DEVICE_INFO);
  assert.equal(decoded.proto, PROTO.DEVICE_INFO);
  assert.deepEqual(decoded.payload, payload);
});

test('decodeReport ignores garbage', () => {
  assert.equal(decodeReport(Buffer.alloc(1024)), null);
  assert.equal(decodeReport(Buffer.from([0x00, 0x11])), null);
  const badLength = Buffer.concat([MAGIC, Buffer.from([1, 1, 0xff, 0, 0, 0]), Buffer.alloc(16)]);
  assert.equal(decodeReport(badLength), null);
});
