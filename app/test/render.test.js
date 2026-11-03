'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const textStyle = require('../lib/text-style');

const source = fs.readFileSync(path.join(__dirname, '../renderer/render.js'), 'utf8');

class FakeContext {
  constructor() {
    this.stack = [];
    this.calls = [];
    this.font = '10px sans-serif';
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.shadowColor = 'transparent';
    this.shadowBlur = 0;
    this.shadowOffsetY = 0;
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.globalAlpha = 1;
    this.lineJoin = 'miter';
  }

  save() {
    this.stack.push({
      font: this.font,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      shadowColor: this.shadowColor,
      shadowBlur: this.shadowBlur,
      shadowOffsetY: this.shadowOffsetY,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      globalAlpha: this.globalAlpha,
      lineJoin: this.lineJoin,
    });
  }

  restore() {
    const state = this.stack.pop();
    if (state) Object.assign(this, state);
  }

  measureText(text) {
    const match = /(\d+(?:\.\d+)?)px/.exec(this.font);
    const size = match ? Number(match[1]) : 10;
    return { width: [...String(text)].length * size * 0.55 };
  }

  fillText(text, x, y) {
    this.calls.push({
      op: 'fillText',
      text,
      x,
      y,
      font: this.font,
      fill: this.fillStyle,
      shadowBlur: this.shadowBlur,
    });
  }

  strokeText(text, x, y) {
    this.calls.push({ op: 'strokeText', text, x, y, font: this.font, stroke: this.strokeStyle });
  }

  fillRect(x, y, w, h) {
    this.calls.push({ op: 'fillRect', x, y, w, h, fill: this.fillStyle });
  }

  createLinearGradient() {
    return { addColorStop() {} };
  }

  createRadialGradient() {
    return { addColorStop() {} };
  }

  clearRect() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  arcTo() {}
  closePath() {}
  clip() {}
  drawImage() {}
  arc() {}
  fill() {}
  stroke() {}
}

function makeCanvas(width = 196, height = 196) {
  const context = new FakeContext();
  return {
    width,
    height,
    getContext: () => context,
    context,
    toDataURL: () => 'data:image/png;base64,AAAA',
  };
}

function loadRenderer() {
  const document = {
    createElement: (tag) => (tag === 'canvas' ? makeCanvas() : {}),
  };
  const window = { DeckGeometry: { WIDE_INDEX: 13 } };
  const context = {
    window,
    document,
    DeckTextStyle: textStyle,
    Image: class {},
    setTimeout,
    clearTimeout,
    console,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  window.KeyRenderer.renderStandbySlices = vm.runInContext('renderStandbySlices', context);
  return window.KeyRenderer;
}

function key(overrides = {}) {
  return {
    emoji: 'BC',
    label: 'cap',
    color: '#1b2130',
    icon: null,
    action: { type: 'none' },
    ...overrides,
  };
}

function textCalls(canvas) {
  return canvas.context.calls.filter((call) => call.op === 'fillText');
}

test('key text uses the selected font, weight and colour', async () => {
  const renderer = loadRenderer();
  const canvas = makeCanvas();

  await renderer.drawKey(canvas, key({
    textStyle: { family: 'georgia', weight: 400, color: '#ff0000' },
  }));

  const main = textCalls(canvas).find((call) => call.text === 'BC');
  assert.ok(main);
  assert.match(main.font, /400 118px/);
  assert.match(main.font, /Georgia/);
  assert.equal(main.fill, '#ff0000');
});

test('a tile face draws the accent bar, glyph, title and subtitle', async () => {
  const renderer = loadRenderer();
  const canvas = makeCanvas();

  await renderer.drawKey(canvas, key({
    face: 'tile',
    label: 'fallback',
    emoji: 'x',
    tile: { accent: '#ff0000', glyph: '🐙', title: 'GitHub', subtitle: 'Open repo' },
  }));

  const texts = textCalls(canvas).map((call) => call.text);
  assert.deepEqual(texts, ['🐙', 'GitHub', 'Open repo']);
  const accent = canvas.context.calls.find((call) => call.op === 'fillRect' && call.fill === '#ff0000');
  assert.ok(accent, 'the accent bar uses the tile colour');
});

test('caption uses its font, size, alignment, colour and solid background', async () => {
  const renderer = loadRenderer();
  const canvas = makeCanvas();

  await renderer.drawKey(canvas, key({
    emoji: '',
    font: {
      size: 20,
      weight: 700,
      align: 'center',
      color: '#00ff00',
      showLabel: true,
      family: 'menlo',
      background: 'solid',
    },
  }));

  const caption = textCalls(canvas).find((call) => call.text === 'cap');
  assert.ok(caption);
  assert.match(caption.font, /700 20px/);
  assert.match(caption.font, /Menlo/);
  assert.equal(caption.x, 98);
  assert.equal(caption.fill, '#00ff00');
  assert.equal(
    canvas.context.calls.some(
      (call) => call.op === 'fillRect' && call.fill === 'rgba(0,0,0,0.55)'
    ),
    true
  );
});

test('a live plugin image suppresses the caption unless explicitly enabled', async () => {
  const renderer = loadRenderer();
  const hidden = makeCanvas();
  await renderer.drawKey(hidden, key({
    liveImage: true,
    font: { showLabel: true, size: 17, weight: 400, align: 'left', color: '#ffffff' },
  }));
  assert.equal(textCalls(hidden).some((call) => call.text === 'cap'), false);

  const shown = makeCanvas();
  await renderer.drawKey(shown, key({
    liveImage: true,
    font: { showLabel: true, captionExplicit: true, size: 17, weight: 400, align: 'left', color: '#ffffff' },
  }));
  assert.equal(textCalls(shown).some((call) => call.text === 'cap'), true);
});

test('the system panel renders clock and stats text', async () => {
  const renderer = loadRenderer();
  const clock = makeCanvas(402, 196);
  await renderer.drawSystemPanel(clock, { mode: 'clock' });
  assert.equal(textCalls(clock).length > 0, true);

  const stats = makeCanvas(402, 196);
  await renderer.drawSystemPanel(stats, { mode: 'stats', stats: { cpu: 10, mem: 20, gpu: 30 } });
  assert.deepEqual(
    textCalls(stats).map((call) => call.text),
    ['10%', 'CPU', '20%', 'RAM', '30%', 'GPU']
  );
});

test('standby renders one image per key and a placeholder wide key', async () => {
  const renderer = loadRenderer();
  const images = await renderer.renderStandbySlices({ standbyClock: false });

  assert.equal(images.length, 14);
  assert.deepEqual(Array.from(images, (image) => image.index), [...Array(14).keys()]);
  assert.equal(typeof images[13].png, 'string');
});
