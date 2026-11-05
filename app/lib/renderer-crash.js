'use strict';

/**
 * Count renderer crashes inside a rolling window. Reloading on every crash turns
 * a repeatable load failure (a very large profile, for example) into an endless
 * crash loop, so the caller stops reloading after `limit` and reports it.
 */
function createCrashGuard({ limit = 3, windowMs = 60_000, now = Date.now } = {}) {
  const times = [];
  return {
    /** Record one crash; true means the renderer may be reloaded. */
    record() {
      const at = now();
      while (times.length && at - times[0] > windowMs) times.shift();
      times.push(at);
      return times.length <= limit;
    },
    count() {
      return times.length;
    },
    reset() {
      times.length = 0;
    },
  };
}

module.exports = { createCrashGuard };
