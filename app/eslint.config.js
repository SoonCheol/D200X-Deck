'use strict';

// Deliberately small: the renderer shares globals across plain <script> tags,
// so no-undef is off. These rules catch the mistakes that actually happened
// (duplicate object keys, dead branches, unused locals) without a config
// project the app does not need.

const nodeGlobals = {
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  __dirname: 'readonly',
  __filename: 'readonly',
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  global: 'readonly',
  globalThis: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  clearImmediate: 'readonly',
  queueMicrotask: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  Headers: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  structuredClone: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
};

const rules = {
  'no-dupe-args': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-self-assign': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', vars: 'local' }],
};

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  localStorage: 'readonly',
  CustomEvent: 'readonly',
  Image: 'readonly',
  FileReader: 'readonly',
  Blob: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  console: 'readonly',
  performance: 'readonly',
  matchMedia: 'readonly',
  getComputedStyle: 'readonly',
  Event: 'readonly',
  Element: 'readonly',
  MutationObserver: 'readonly',
  crypto: 'readonly',
  confirm: 'readonly',
  DeckVersion: 'readonly',
  DeckTextStyle: 'readonly',
};

module.exports = [
  {
    ignores: ['dist/**', 'build/**', 'node_modules/**', 'bin/**', 'native/**', 'renderer/assets/**'],
  },
  {
    files: ['main.js', 'ipc.js', 'plugin-hosts.js', 'preload.js', 'pop-preload.js', 'lib/**/*.js', 'test/**/*.js', 'scripts/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: nodeGlobals },
    rules: { ...rules, 'no-undef': 'error' },
  },
  {
    // The renderer files are plain <script> tags sharing one global scope.
    files: ['renderer/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: browserGlobals },
    rules: { ...rules, 'no-undef': 'error' },
  },
];
