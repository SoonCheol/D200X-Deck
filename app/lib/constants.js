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

const COLUMNS = 5;
const ROWS = 3;
const KEY_COUNT = COLUMNS * ROWS; // 15 slots, two merged into the wide key
const WIDE_INDEX = 13;
const WIDE_SLOT = '3_2';

const MEDIA_OPS = ['playpause', 'next', 'prev', 'volumeup', 'volumedown', 'mute'];

module.exports = { DEFAULT_FONT, COLUMNS, ROWS, KEY_COUNT, WIDE_INDEX, WIDE_SLOT, MEDIA_OPS };
