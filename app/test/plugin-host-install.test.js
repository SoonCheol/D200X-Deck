'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');

const { PluginManager } = require('../lib/plugins');

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ulanzi-plugin-install-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plugins = path.join(root, 'plugins');
  fs.mkdirSync(plugins, { recursive: true });
  return { root, plugins };
}

function writePlugin(dir, uuid = 'com.example.demo', body = '// app\n') {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ UUID: uuid, Name: 'Demo', CodePath: 'app.js', Actions: [] })
  );
  fs.writeFileSync(path.join(dir, 'app.js'), body);
}

test('installs a plugin from a ZIP package', async (t) => {
  const { root, plugins } = workspace(t);
  const zip = new JSZip();
  zip.file(
    'demo.ulanziPlugin/manifest.json',
    JSON.stringify({ UUID: 'com.example.demo', Name: 'Demo', CodePath: 'app.js', Actions: [] })
  );
  zip.file('demo.ulanziPlugin/app.js', '// zipped\n');
  const archive = path.join(root, 'demo.zip');
  fs.writeFileSync(archive, await zip.generateAsync({ type: 'nodebuffer' }));
  const manager = new PluginManager({ dirs: [plugins], appPluginsDir: plugins });

  const result = await manager.install(archive);

  assert.equal(result.uuid, 'com.example.demo');
  assert.equal(
    fs.readFileSync(path.join(plugins, 'com.example.demo.ulanziPlugin', 'app.js'), 'utf8'),
    '// zipped\n'
  );
});

test('a failed copy leaves the previous installation intact', async (t) => {
  const { root, plugins } = workspace(t);
  const destination = path.join(plugins, 'com.example.demo.ulanziPlugin');
  writePlugin(destination, 'com.example.demo', '// old\n');
  const source = path.join(root, 'source', 'com.example.demo.ulanziPlugin');
  writePlugin(source, 'com.example.demo', '// new\n');
  const manager = new PluginManager({ dirs: [plugins], appPluginsDir: plugins });
  const originalCopy = fs.cpSync;
  fs.cpSync = () => {
    throw new Error('disk full');
  };
  t.after(() => {
    fs.cpSync = originalCopy;
  });

  await assert.rejects(manager.install(source), /disk full/i);

  assert.equal(fs.readFileSync(path.join(destination, 'app.js'), 'utf8'), '// old\n');
});

test('import copies a read-only plugin and remove refuses it', (t) => {
  const { root, plugins } = workspace(t);
  const vendor = path.join(root, 'vendor');
  const source = path.join(vendor, 'com.example.vendor.ulanziPlugin');
  writePlugin(source, 'com.example.vendor');
  const manager = new PluginManager({ dirs: [plugins, vendor], appPluginsDir: plugins });
  const meta = manager.readPlugin(source, vendor);
  manager.plugins.set(meta.uuid, { ...meta, writable: false });
  manager.scan = () => [];
  manager.list = () => [];

  assert.throws(() => manager.remove(meta.uuid), /read-only/i);

  const result = manager.import(meta.uuid);

  assert.equal(result.uuid, meta.uuid);
  assert.ok(fs.existsSync(path.join(plugins, path.basename(source), 'app.js')));
});
