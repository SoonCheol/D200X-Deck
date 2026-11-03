'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const Module = require('node:module');

function loadSysstats(t, execImpl = (_file, _args, _options, callback) => callback(null, '')) {
  const original = {
    cpus: os.cpus,
    totalmem: os.totalmem,
    freemem: os.freemem,
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'node:child_process') return { execFile: execImpl };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../lib/sysstats')];
    return require('../lib/sysstats');
  } finally {
    Module._load = originalLoad;
    t.after(() => Object.assign(os, original));
  }
}

test('cpuPercent uses the delta between samples and memPercent clamps', (t) => {
  let times = { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 };
  os.cpus = () => [{ times }];
  os.totalmem = () => 100;
  os.freemem = () => 25;
  const stats = loadSysstats(t);

  assert.equal(stats.cpuPercent(), 0, 'the first sample has no delta');
  times = { user: 50, nice: 0, sys: 0, idle: 50, irq: 0 };
  assert.equal(stats.cpuPercent(), 50);
  assert.equal(stats.memPercent(), 75);
});

test('gpuPercent parses utilization and caches for five seconds', async (t) => {
  let runs = 0;
  const stats = loadSysstats(t, (_file, _args, _options, callback) => {
    runs += 1;
    callback(null, '"Device Utilization %"=42');
  });

  const first = await new Promise((resolve) => stats.gpuPercent(resolve));
  const second = await new Promise((resolve) => stats.gpuPercent(resolve));

  assert.equal(first, 42);
  assert.equal(second, 42);
  assert.equal(runs, 1, 'the five-second cache prevents another ioreg call');
  assert.equal(stats.latest().gpu, 42);
});

test('start is idempotent, tick updates samples and stop clears the timer', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  os.cpus = () => [{ times: { user: 10, nice: 0, sys: 0, idle: 10, irq: 0 } }];
  os.totalmem = () => 100;
  os.freemem = () => 50;
  const stats = loadSysstats(t);

  stats.start();
  stats.start();
  assert.equal(stats.latest().mem, 50);
  t.mock.timers.tick(1000);
  stats.stop();
  stats.stop();

  const sampled = [];
  stats.sample((value) => sampled.push(value));
  assert.equal(sampled.length, 1);
  assert.equal(typeof sampled[0].cpu, 'number');
});
