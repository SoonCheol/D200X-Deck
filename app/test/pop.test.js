'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../renderer/pop.js'), 'utf8');

function makeHarness() {
  const chosen = [];
  const document = { activeElement: null, handlers: {} };
  const grid = {
    buttons: [],
    _html: '',
    querySelectorAll(selector) {
      return selector === '.item' ? this.buttons : [];
    },
    querySelector(selector) {
      return selector === '.item' ? this.buttons[0] || null : null;
    },
  };
  Object.defineProperty(grid, 'innerHTML', {
    get() {
      return this._html;
    },
    set(value) {
      this._html = value;
      const count = (String(value).match(/class="item"/g) || []).length;
      this.buttons = Array.from({ length: count }, (_, index) => ({
        dataset: { index: String(index) },
        classList: { contains: (name) => name === 'item' },
        handlers: {},
        addEventListener(type, handler) {
          this.handlers[type] = handler;
        },
        click() {
          this.handlers.click?.();
        },
        focus() {
          document.activeElement = this;
        },
      }));
    },
  });
  const close = {
    handlers: {},
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
    click() {
      this.handlers.click?.();
    },
  };
  document.getElementById = (id) => (id === 'grid' ? grid : id === 'close' ? close : null);
  document.addEventListener = (type, handler) => {
    document.handlers[type] = handler;
  };
  const window = {
    popAPI: {
      onItems(callback) {
        this.callback = callback;
      },
      choose(index) {
        chosen.push(index);
      },
    },
    addEventListener(type, handler) {
      this.handlers = this.handlers || {};
      this.handlers[type] = handler;
    },
  };
  const context = {
    document,
    window,
    requestAnimationFrame: (callback) => callback(),
    String,
    Number,
    Math,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { window, document, grid, close, chosen };
}

function keyEvent(key) {
  return { key, prevented: 0, preventDefault() { this.prevented += 1; } };
}

test('POP items render, focus the first item and choose on click', () => {
  const { window, document, grid, chosen } = makeHarness();
  window.popAPI.callback([{ label: 'One' }, { label: 'Two' }, { label: 'Three' }]);

  assert.equal(grid.buttons.length, 3);
  assert.equal(document.activeElement, grid.buttons[0]);

  grid.buttons[1].click();
  assert.deepEqual(chosen, [1]);
});

test('POP arrow, Home and End keys move focus and wrap at the edges', () => {
  const { window, document, grid } = makeHarness();
  window.popAPI.callback([{ label: 'One' }, { label: 'Two' }, { label: 'Three' }, { label: 'Four' }]);
  const press = (key) => document.handlers.keydown(keyEvent(key));
  const active = () => grid.buttons.indexOf(document.activeElement);

  assert.equal(active(), 0);
  press('ArrowRight');
  assert.equal(active(), 1);
  press('ArrowDown');
  assert.equal(active(), 3);
  press('ArrowRight');
  assert.equal(active(), 3, 'the last item clamps');
  press('ArrowLeft');
  assert.equal(active(), 2);
  press('Home');
  assert.equal(active(), 0);
  press('End');
  assert.equal(active(), 3);
  press('ArrowLeft');
  assert.equal(active(), 2);
  press('ArrowUp');
  assert.equal(active(), 0, 'moving up clamps at the first row');
});

test('POP Escape, Enter and the close button report the right choice', () => {
  const { window, document, grid, close, chosen } = makeHarness();
  window.popAPI.callback([{ label: 'One' }, { label: 'Two' }]);

  const escape = keyEvent('Escape');
  document.handlers.keydown(escape);
  assert.equal(escape.prevented, 1);
  assert.deepEqual(chosen, [-1]);

  document.activeElement = null;
  document.handlers.keydown(keyEvent('Enter'));
  assert.deepEqual(chosen, [-1, 0]);

  document.activeElement = grid.buttons[1];
  document.handlers.keydown(keyEvent(' '));
  assert.equal(chosen.length, 2, 'Space only selects when no item is focused');

  close.click();
  assert.deepEqual(chosen, [-1, 0, -1]);
});

test('POP focus restores the first item after the window activates', () => {
  const { window, document, grid } = makeHarness();
  window.popAPI.callback([{ label: 'One' }, { label: 'Two' }]);
  document.activeElement = null;

  window.handlers.focus();

  assert.equal(document.activeElement, grid.buttons[0]);
});
