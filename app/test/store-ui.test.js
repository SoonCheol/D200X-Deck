'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../renderer/store-ui.js'), 'utf8');

function fakeNode(extra = {}) {
  const node = {
    innerHTML: '',
    textContent: '',
    src: '',
    disabled: false,
    dataset: {},
    handlers: {},
    classes: new Set(),
    classList: {
      add(...names) {
        names.forEach((name) => this.owner.classes.add(name));
      },
      remove(...names) {
        names.forEach((name) => this.owner.classes.delete(name));
      },
      toggle(name, force) {
        const on = force === undefined ? !this.owner.classes.has(name) : Boolean(force);
        if (on) this.owner.classes.add(name);
        else this.owner.classes.delete(name);
      },
      contains(name) {
        return this.owner.classes.has(name);
      },
    },
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
    querySelectorAll() {
      return [];
    },
  };
  node.classList.owner = node;
  Object.assign(node, extra);
  return node;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeHarness(resource, { plugins = [], check = { ok: true, size: 1572864 } } = {}) {
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) {
      const created = fakeNode();
      created.classList.owner = created;
      nodes.set(selector, created);
    }
    return nodes.get(selector);
  };
  const card = node('.store-card');
  const shots = [fakeNode({ dataset: { shot: resource.screenshots?.[1] } })];
  const detail = node('#store-detail');
  detail.querySelectorAll = (selector) => (selector === '[data-shot]' ? shots : []);
  const document = {
    querySelector: (selector) => (selector === '.store-card' ? card : null),
    createElement: () => fakeNode(),
  };
  const calls = { checks: 0 };
  const context = {
    $: node,
    document,
    window: {},
    state: { plugins },
    DeckVersion: { compareVersions: (a, b) => (String(a) === String(b) ? 0 : String(a) > String(b) ? 1 : -1) },
    esc,
    toast: () => {},
    confirm: () => true,
    api: {
      storeResource: async () => ({ ok: true, resource }),
      storeCheckFile: async () => {
        calls.checks += 1;
        return check;
      },
    },
    setImmediate,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  context.setCategories = (categories) => {
    context.__categories = categories;
    vm.runInContext('storeState.categories = __categories', context);
  };
  return { context, nodes, detail, shots, calls };
}

const resource = {
  id: '7',
  name: 'Weather',
  author: 'Dev',
  version: '2.0.1',
  uuid: 'com.test.weather',
  files: 'https://ugc.ulanzistudio.com/weather.zip',
  icon: 'https://ugc.ulanzistudio.com/cover.png',
  summary: 'Short summary',
  longDescription: 'Long text\n• One\n• Two',
  screenshots: ['https://ugc.ulanzistudio.com/shot-1.png', 'https://ugc.ulanzistudio.com/shot-2.png'],
  categoryId: '1',
  downloads: 1200,
  stars: 12,
};

test('store detail puts Back first, shows screenshots, metadata and the plugin id disclosure', async () => {
  const { context, detail, shots, calls } = makeHarness(resource, {
    plugins: [{ name: 'Weather', uuid: 'com.test.weather', version: '1.0.0' }],
  });
  context.setCategories([{ id: '1', name: 'plugins' }]);

  await context.openStoreDetail('7');

  assert.match(detail.innerHTML, /<div class="store-detail-bar">\s*<button[^>]*>← Back<\/button>/);
  assert.match(detail.innerHTML, /id="store-shot" src="https:\/\/ugc\.ulanzistudio\.com\/shot-1\.png"/);
  assert.match(detail.innerHTML, /Screenshot 2/);
  assert.match(detail.innerHTML, /Update available/);
  assert.match(detail.innerHTML, /Installed v1\.0\.0/);
  assert.match(detail.innerHTML, /Update plugin\s*<\/button>/);
  assert.match(detail.innerHTML, /<details class="store-detail-id"><summary>Plugin ID<\/summary><code>com\.test\.weather<\/code>/);
  assert.match(detail.innerHTML, /Long text\n• One\n• Two/);
  assert.match(detail.innerHTML, /data-fallback="https:\/\/ugc\.ulanzistudio\.com\/shot-1\.png"/);

  shots[0].handlers.click();
  assert.equal(context.$('#store-shot').src, 'https://ugc.ulanzistudio.com/shot-2.png');

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.checks, 1);
  assert.equal(context.$('#store-detail-size').textContent, '1.5 MB');
});

test('an installed up-to-date plugin disables install and skips the file check', async () => {
  const { context, detail, calls } = makeHarness(resource, {
    plugins: [{ name: 'Weather', uuid: 'com.test.weather', version: '2.0.1' }],
  });
  context.setCategories([{ id: '1', name: 'plugins' }]);

  await context.openStoreDetail('7');
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(detail.innerHTML, />Installed</);
  assert.match(detail.innerHTML, /\bInstalled\b<\/span>/);
  assert.match(detail.innerHTML, /id="store-install" disabled/);
  assert.equal(calls.checks, 0);
});

test('a plugin listing without a package says No download, not Not a plugin', async () => {
  const { context, detail } = makeHarness(
    {
      ...resource,
      id: '262',
      version: '1.6.1',
      uuid: 'com.ulanzi.ulanzideck.nanoleaf',
      files: '',
      icon: 'https://www.ulanzistudio.com/static/release/deck/marketplace/plugin/nanoleaf.png',
      screenshots: ['https://ugc.ulanzistudio.com/profile/nanoleaf.png'],
    },
    { plugins: [] }
  );
  context.setCategories([{ id: '1', name: 'plugins' }]);

  await context.openStoreDetail('262');

  assert.match(detail.innerHTML, />No download</);
  assert.doesNotMatch(detail.innerHTML, />Not a plugin</);
  assert.match(detail.innerHTML, /no downloadable package on the Ulanzi store/);
});

test('the Store header offers the same local folder and ZIP install as Installed', () => {
  const html = fs.readFileSync(path.join(__dirname, '../renderer/index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../renderer/app.js'), 'utf8');
  const store = html.slice(html.indexOf('id="store-modal"'));
  assert.match(store, /id="store-install-folder"/);
  assert.match(store, /id="store-install-zip"/);
  assert.match(app, /\['plugin', 'store'\][\s\S]*-install-folder[\s\S]*-install-zip/);
});
