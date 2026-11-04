'use strict';

// Kill plugin processes left behind by an earlier instance. A plugin child is
// identified by its parent being launchd (ppid 1) and its command line pointing
// into one of our plugin folders. The current instance's own children have a
// real parent pid, so they are never touched.

const { execFileSync } = require('node:child_process');

function findOrphans(psOutput, roots, runtimes = []) {
  const wanted = roots.filter(Boolean).map((root) => String(root).replace(/\/+$/, ''));
  const nodes = runtimes.filter(Boolean).map(String);
  const pids = [];
  for (const line of String(psOutput || '').split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    if (!match) continue;
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    const command = match[3];
    if (!pid || ppid !== 1) continue;
    // Native plugins are executed from inside their folder. Node plugins run
    // under one of our runtimes and name a file inside a root. Merely
    // mentioning a plugin path in an argument must not match: an editor opened
    // on that folder also has parent PID 1.
    const native = wanted.some((root) => command.startsWith(`${root}/`));
    const node =
      nodes.some((runtime) => command.startsWith(`${runtime} `)) &&
      wanted.some((root) => command.includes(` ${root}/`));
    if (!native && !node) continue;
    pids.push(pid);
  }
  return pids;
}

function cleanOrphans({ roots = [], runtimes = [], exec = execFileSync, kill = process.kill, log = console.log } = {}) {
  let output = '';
  try {
    output = exec('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' });
  } catch {
    return [];
  }
  const pids = findOrphans(output, roots, runtimes);
  for (const pid of pids) {
    try {
      kill(pid, 'SIGKILL');
    } catch {
      /* already gone or not ours */
    }
  }
  if (pids.length) log(`[orphans] killed ${pids.length} leftover plugin process(es)`);
  return pids;
}

module.exports = { findOrphans, cleanOrphans };
