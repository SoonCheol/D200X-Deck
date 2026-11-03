'use strict';

// Build the throwaway config used by scripts/readme-screenshot.sh. It mirrors
// the curated demo page used in the README: navigation, media, text, hotkey,
// multi-action, command, timer and brightness, with the wide clock panel.
const fs = require('node:fs');
const path = require('node:path');
const { createDefaultConfig } = require('../lib/store');

const destination = process.argv[2];
if (!destination) {
  console.error('usage: node scripts/readme-demo.js <config.json>');
  process.exit(1);
}

const config = createDefaultConfig();
const profile = config.profiles[0];
profile.name = 'Demo';
const page = config.pages[0];
page.name = 'Demo';
page.profileId = profile.id;
page.wideMode = 'clock';
config.activeProfileId = profile.id;
config.activePageId = page.id;
config.settings.autoPush = true;
config.settings.brightness = 64;
config.pages = [page];

const key = (label, action) => ({
  emoji: '',
  label,
  color: '#1b2130',
  icon: null,
  action,
  font: { showLabel: true },
});

page.keys = {
  0: key('Previous page', { type: 'page', op: 'prev' }),
  1: key('Next page', { type: 'page', op: 'next' }),
  2: key('Go to page', { type: 'page', op: 'goto', value: page.id }),
  3: key('Play / pause', { type: 'media', op: 'playpause' }),
  4: key('Mute', { type: 'media', op: 'mute' }),
  5: key('Volume up', { type: 'media', op: 'volumeup' }),
  6: key('Volume down', { type: 'media', op: 'volumedown' }),
  7: key('Type text', { type: 'text', value: 'Hello from Ulanzi Deck Open' }),
  8: key('Hotkey', { type: 'hotkey', value: 'cmd+c' }),
  9: key('Multi action', {
    type: 'multi',
    mode: 'sequence',
    steps: [
      { action: { type: 'media', op: 'volumeup' } },
      { delay: 250 },
      { action: { type: 'hotkey', value: 'cmd+c' } },
    ],
  }),
  10: key('Command', { type: 'command', value: 'date +%H:%M' }),
  11: key('Timer', { type: 'timer', seconds: 300, sound: true }),
  12: key('Brightness', { type: 'brightness', op: 'up', step: 5 }),
};

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify(config, null, 2));
