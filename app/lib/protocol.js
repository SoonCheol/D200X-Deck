'use strict';

const MAGIC = Buffer.from([0x7c, 0x7c]);
const CHUNK = 1024;
const REPORT_ID = 0x00;

const PROTO = {
  PAGE: 0x01,
  DEVICE_INFO: 0x03,
  CLOCK: 0x06,
  BRIGHTNESS: 0x0a,
  FONT: 0x0b,
  SLEEP: 0x1a,
};

const CMD = {
  KEY_EVENT: 0x01,
  DEVICE_INFO: 0x03,
};

/** Build a frame padded to the next 1024-byte boundary. */
function encodeFrame(cmd, proto, payload = Buffer.alloc(0)) {
  const head = Buffer.alloc(8);
  MAGIC.copy(head, 0);
  head[2] = cmd & 0xff;
  head[3] = proto & 0xff;
  head.writeUInt32LE(payload.length, 4);
  const frame = Buffer.concat([head, payload]);
  const pad = (CHUNK - (frame.length % CHUNK)) % CHUNK;
  return pad ? Buffer.concat([frame, Buffer.alloc(pad)]) : frame;
}

/** Split a padded stream into 1025-byte HID output reports. */
function splitReports(stream) {
  if (stream.length % CHUNK !== 0) throw new Error('stream is not 1024-byte aligned');
  const reports = [];
  for (let i = 0; i < stream.length; i += CHUNK) {
    reports.push(Buffer.concat([Buffer.from([REPORT_ID]), stream.subarray(i, i + CHUNK)]));
  }
  return reports;
}

/** Parse one 1024-byte input report. Returns null for non-frames. */
function decodeReport(data) {
  if (data.length < 8) return null;
  if (data[0] !== 0x7c || data[1] !== 0x7c) return null;
  const len = data.readUInt32LE(4);
  if (len > data.length - 8) return null;
  return {
    cmd: data[2],
    proto: data[3],
    payload: data.subarray(8, 8 + len),
  };
}

function clockPayload(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const hhmmss = `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
  return Buffer.from(`1|${p(date.getMinutes())}|${p(date.getSeconds())}|${hhmmss}|0|24H|`, 'utf8');
}

module.exports = { MAGIC, CHUNK, REPORT_ID, PROTO, CMD, encodeFrame, splitReports, decodeReport, clockPayload };
