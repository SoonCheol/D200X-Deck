'use strict';

// Single source for values shared by the HID layer, the page builder and the UI.

const DEFAULT_FONT = {
  Align: 'bottom',
  Color: 0xffffff,
  FontName: 'Source Han Sans SC',
  ShowTitle: true,
  Size: 10,
  Weight: 80,
};

const { COLUMNS, ROWS, KEY_SLOTS, WIDE_INDEX } = require('./geometry');

const KEY_COUNT = KEY_SLOTS; // 15 slots, two merged into the wide key
const WIDE_SLOT = '3_2';

const { MEDIA_OPS } = require('./actions-meta');

module.exports = { DEFAULT_FONT, COLUMNS, ROWS, KEY_COUNT, WIDE_INDEX, WIDE_SLOT, MEDIA_OPS };
