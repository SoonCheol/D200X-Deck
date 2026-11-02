'use strict';

// One registry for action types, labels, editor groups and media keys. Shared
// by the main process (CommonJS) and the renderer (plain script), so adding a
// type is a single edit instead of five.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DeckActions = factory();
})(globalThis, function () {
  const ACTION_TYPES = [
    'none',
    'app',
    'url',
    'command',
    'hotkey',
    'text',
    'media',
    'close',
    'page',
    'plugin',
    'multi',
    'toggle',
    'indicator',
    'sound',
    'timer',
    'brightness',
    'pop',
  ];

  const ACTION_LABELS = {
    none: 'Do nothing',
    app: 'Open app',
    url: 'Open URL',
    command: 'Run shell command',
    hotkey: 'Send hotkey',
    text: 'Type text',
    media: 'Media key',
    close: 'Close app',
    page: 'Switch to page',
    plugin: 'Plugin action',
    multi: 'Multi action',
    toggle: 'Toggle two actions',
    indicator: 'Page indicator',
    sound: 'Play audio',
    timer: 'Timer',
    brightness: 'Deck brightness',
    pop: 'POP menu',
  };

  const ACTION_GROUPS = [
    ['Basic', ['none']],
    ['Device & pages', ['page', 'indicator', 'pop', 'multi', 'toggle', 'timer', 'brightness']],
    ['Apps & links', ['app', 'url', 'close']],
    ['System', ['hotkey', 'text', 'media', 'sound', 'command']],
    ['Plugins', ['plugin']],
  ];

  // The compact trigger editor only supports value-based actions.
  const TRIGGER_GROUPS = [
    ['Basic', ['none']],
    ['Device & pages', ['page']],
    ['Apps & links', ['app', 'url', 'close']],
    ['System', ['hotkey', 'text', 'media', 'command']],
  ];

  const MULTI_STEP_TYPES = [
    ['hotkey', 'Hotkey'],
    ['media', 'Media key'],
    ['text', 'Type text'],
    ['app', 'Open app'],
    ['url', 'Open URL'],
    ['close', 'Close app'],
    ['command', 'Command'],
    ['sound', 'Play audio'],
    ['timer', 'Timer'],
    ['brightness', 'Deck brightness'],
    ['plugin', 'Plugin action'],
    ['page', 'Switch page'],
  ];

  const MEDIA = [
    { op: 'playpause', label: 'Play / pause', emoji: '⏯️' },
    { op: 'next', label: 'Next track', emoji: '⏭️' },
    { op: 'prev', label: 'Previous track', emoji: '⏮️' },
    { op: 'volumeup', label: 'Volume up', emoji: '🔊' },
    { op: 'volumedown', label: 'Volume down', emoji: '🔉' },
    { op: 'mute', label: 'Mute', emoji: '🔇' },
  ];

  const MEDIA_OPS = MEDIA.map((entry) => entry.op);
  const MEDIA_LABELS = Object.fromEntries(MEDIA.map((entry) => [entry.op, entry.label]));
  const MEDIA_EMOJI = Object.fromEntries(MEDIA.map((entry) => [entry.op, entry.emoji]));

  return {
    ACTION_TYPES,
    ACTION_LABELS,
    ACTION_GROUPS,
    TRIGGER_GROUPS,
    MULTI_STEP_TYPES,
    MEDIA,
    MEDIA_OPS,
    MEDIA_LABELS,
    MEDIA_EMOJI,
  };
});
