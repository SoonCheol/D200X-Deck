'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Minimal DOM harness: verifies the actual catalogue script inserts
// its generated category rows into the visible document, not just creates them.
class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.classList = { toggle() {} };
    this.listeners = {};
    this.style = {};
    this.value = '';
    this.hidden = false;
  }
  set className(value) { this._className = value; }
  get className() { return this._className || ''; }
  set innerHTML(markup) { this._innerHTML = markup; }
  get innerHTML() { return this._innerHTML || ''; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  querySelector(selector) {
    if (selector === '.sd-action-name') {
      if (!this._name) this._name = new FakeElement('span');
      return this._name;
    }
    return null;
  }
}

test('Stream Deck 7.6.1 Key tab renders all 5 categories and 24 actions', () => {
  const list = new FakeElement('div');
  const search = new FakeElement('input');
  const document = {
    querySelector(selector) {
      return selector === '#action-library-list' ? list :
        selector === '#action-library-search' ? search : null;
    },
    createElement: (tag) => new FakeElement(tag),
  };
  const window = { D200XElgatoIcons: {} };
  const code = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'action-catalog.js'), 'utf8');
  vm.runInNewContext(code, { document, window, console });
  const groups = window.D200XActionCatalog.groups;
  assert.equal(groups.length, 5);
  assert.equal(groups.reduce((n, [, items]) => n + items.length, 0), 24);
  assert.equal(list.children.length, 5, 'category nodes must be appended to document');
  const buttons = list.children.flatMap((section) => section.children[1].children);
  assert.equal(buttons.length, 24, 'every action should be visible in expanded categories');
  assert.equal(buttons.filter((button) => button.className === 'action-library-item').length, 24);
  assert.equal(list.children.some((element) => element.className === 'action-library-empty'), false);
  search.value = '타이머';
  search.listeners.input();
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].children[1].children.length, 1);
  assert.equal(list.children[0].children[1].children[0]._name.textContent, '타이머');
  search.value = '';
  search.listeners.input();
  assert.equal(list.children.length, 5, 'clearing search must restore all categories');
});
