'use strict';

const os = require('node:os');
const { execFile } = require('node:child_process');

// CPU usage is the delta between two samples, exactly like Activity Monitor.
let previous = null;

function cpuSnapshot() {
  return os.cpus().map((cpu) => {
    const t = cpu.times;
    return { idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq };
  });
}

function cpuPercent() {
  const current = cpuSnapshot();
  if (!previous || previous.length !== current.length) {
    previous = current;
    return 0;
  }
  let idle = 0;
  let total = 0;
  for (let i = 0; i < current.length; i++) {
    idle += current[i].idle - previous[i].idle;
    total += current[i].total - previous[i].total;
  }
  previous = current;
  if (total <= 0) return latest.cpu;
  return Math.min(100, Math.max(0, Math.round((1 - idle / total) * 100)));
}

function memPercent() {
  const total = os.totalmem();
  if (!total) return 0;
  return Math.min(100, Math.max(0, Math.round((1 - os.freemem() / total) * 100)));
}

// GPU utilisation on Apple Silicon lives in the IOAccelerator registry entry.
// Sampling it spawns ioreg, so refresh it at most every five seconds.
let gpu = 0;
let gpuBusy = false;
let gpuAt = 0;

function gpuPercent(callback) {
  const now = Date.now();
  if (gpuBusy || now - gpuAt < 5000) {
    if (callback) callback(gpu);
    return;
  }
  gpuAt = now;
  gpuBusy = true;
  execFile('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator'], { timeout: 3000 }, (err, stdout) => {
    gpuBusy = false;
    if (err || !stdout) {
      if (callback) callback(gpu);
      return;
    }
    const match = stdout.match(/"Device Utilization %"=(\d+)/);
    if (match) gpu = Math.min(100, Math.max(0, Number(match[1]) || 0));
    latest.gpu = gpu;
    if (callback) callback(gpu);
  });
}

const latest = { cpu: 0, mem: 0, gpu: 0 };
let timer = null;

function tick() {
  latest.cpu = cpuPercent();
  latest.mem = memPercent();
  gpuPercent();
}

function start() {
  if (timer) return;
  tick();
  timer = setInterval(tick, 1000);
}

function stop() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

/** One sample for the renderer preview (GPU may resolve later). */
function sample(callback) {
  tick();
  callback({ ...latest });
}

module.exports = { sample, start, stop, latest: () => ({ ...latest }), cpuPercent, memPercent, gpuPercent };
