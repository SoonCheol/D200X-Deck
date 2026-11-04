'use strict';

// Preloaded into every Node plugin with `node -r`. If the host dies without
// running shutdown() (a crash, `kill -9`, a force quit), the plugin is
// re-parented to launchd and would otherwise poll forever. Exit instead.
const parent = process.ppid;

setInterval(() => {
  if (process.ppid !== parent) process.exit(0);
}, 1000).unref();
