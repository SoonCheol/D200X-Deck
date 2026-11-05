'use strict';

/**
 * Map one hidseize stderr line to the key capture state, or null when the line
 * does not change it. `need` tells the settings UI which help text and button fit.
 */
function seizeLineState(line) {
  if (/^access\s+0\b/.test(line)) return { running: true, message: 'Waiting for the Deck…' };
  if (/^access\s+[12]\b/.test(line) || line.includes('notpermitted') || /^manager\s+0x/i.test(line)) {
    return { running: false, message: 'Input Monitoring permission needed', need: 'permission' };
  }
  if (/^seized\b/.test(line)) return { running: true, message: 'Capturing keys' };
  // 0xe00002c1 is kIOReturnNotPrivileged: macOS refuses the keyboard seize
  // itself, and no permission toggle changes that.
  if (/^seize\s+0xe00002c1\b/i.test(line)) {
    return { running: false, message: 'Not allowed by macOS', need: 'privilege' };
  }
  if (/^seize\s+0x/i.test(line)) return { running: false, message: 'The Deck is in use by another app' };
  return null;
}

module.exports = { seizeLineState };
