'use strict';

// Starts a real StreamDeckPlugins host and one Node plugin, then stays alive so
// the test can SIGKILL this process and observe what happens to the plugin.
// Used by test/plugin-lifetime.test.js.

const fs = require('node:fs');
const path = require('node:path');

const { StreamDeckPlugins } = require('../../lib/streamdeck-plugins');

const dir = process.argv[2];
const out = process.argv[3];

fs.writeFileSync(path.join(dir, 'plugin.js'), 'setInterval(() => {}, 1000);\n');

const host = new StreamDeckPlugins({ appPluginsDir: dir, port: 0 });
const meta = {
  uuid: 'test.lifetime',
  name: 'Lifetime test',
  version: '1.0.0',
  dir,
  code: { path: 'plugin.js', kind: 'node' },
};
const proc = host._spawn(meta, path.join(dir, 'plugin.js'), 0);

setTimeout(() => {
  fs.writeFileSync(out, JSON.stringify({ host: process.pid, plugin: proc.pid }));
}, 50);

setInterval(() => {}, 60_000);
