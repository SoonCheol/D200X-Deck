'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { viewTarget } = require('../lib/plugin-view');

const base = path.join('/tmp', 'agentdeck.ulanziPlugin');

test('openView parameters stay out of the filename', () => {
  const view = viewTarget(base, './property-inspector/tutorial.html', { language: 'pt_PT' });

  assert.equal(view.file, path.join(base, 'property-inspector', 'tutorial.html'));
  assert.deepEqual(view.query, { language: 'pt_PT' });
});

test('openView merges a query already present in the URL', () => {
  const view = viewTarget(base, './view.html?one=1', { two: '2' });

  assert.equal(view.file, path.join(base, 'view.html'));
  assert.deepEqual(view.query, { one: '1', two: '2' });
});

test('openView refuses paths outside the plugin root', () => {
  assert.equal(viewTarget(base, '../../etc/passwd', {}), null);
  assert.equal(viewTarget(base, './property-inspector/tutorial.html', {}).file, path.join(base, 'property-inspector', 'tutorial.html'));
});
