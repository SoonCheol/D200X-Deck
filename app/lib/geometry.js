'use strict';

// One definition of the D200 grid, shared by the main process and the renderer.
// KEY_SLOTS is the protocol grid (15 slots); the firmware merges two of them
// into the 2x1 wide key, leaving 14 physical buttons.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DeckGeometry = factory();
})(globalThis, function () {
  const COLUMNS = 5;
  const ROWS = 3;
  const KEY_SLOTS = COLUMNS * ROWS;
  return {
    COLUMNS,
    ROWS,
    KEY_SLOTS,
    KEY_COUNT: KEY_SLOTS - 1,
    WIDE_INDEX: 13,
  };
});
