'use strict';

// Deliberately small: the renderer shares globals across plain <script> tags,
// so no-undef is off. These rules catch the mistakes that actually happened
// (duplicate object keys, dead branches, unused locals) without a config
// project the app does not need.

const rules = {
  'no-dupe-args': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-self-assign': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', vars: 'local' }],
};

module.exports = [
  {
    ignores: ['dist/**', 'build/**', 'node_modules/**', 'bin/**', 'native/**', 'renderer/assets/**'],
  },
  {
    files: ['main.js', 'preload.js', 'pop-preload.js', 'lib/**/*.js', 'test/**/*.js', 'scripts/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs' },
    rules,
  },
  {
    // The renderer files are plain <script> tags sharing one global scope.
    files: ['renderer/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script' },
    rules,
  },
];
