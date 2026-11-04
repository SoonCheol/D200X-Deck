'use strict';

// One place for the folders that can contain plugins. The hosts and the
// startup orphan sweep must agree, or a plugin folder is silently missed.

const path = require('node:path');
const os = require('node:os');

/** Ulanzi Studio's plugin folder plus the legacy `~/.ulanzi/Plugins`. */
function pluginRootDirs() {
  const dirs = [path.join(os.homedir(), 'Library/Application Support/Ulanzi/UlanziDeck/Plugins')];
  if (process.platform !== 'darwin') {
    dirs.length = 0;
  }
  dirs.push(path.join(os.homedir(), '.ulanzi', 'Plugins'));
  return dirs;
}

/** This app's Stream Deck folder plus the vendor installs it can read. */
function streamDeckPluginDirs(appDir) {
  const home = os.homedir();
  const dirs = [appDir];
  if (process.platform === 'darwin') {
    dirs.push(
      path.join(home, 'Library/Application Support/opendeck/plugins'),
      path.join(home, 'Library/Application Support/com.elgato.StreamDeck/Plugins')
    );
  }
  return dirs;
}

/** Every folder the startup sweep must cover for a given user-data dir. */
function sweepRoots(baseDir) {
  return [
    ...new Set(
      [
        path.join(baseDir, 'Plugins'),
        ...pluginRootDirs(),
        ...streamDeckPluginDirs(path.join(baseDir, 'StreamDeckPlugins')),
      ].map((root) => path.resolve(root))
    ),
  ];
}

module.exports = { pluginRootDirs, streamDeckPluginDirs, sweepRoots };
