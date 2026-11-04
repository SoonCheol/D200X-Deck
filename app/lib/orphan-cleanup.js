'use strict';

// Kill plugin processes left behind by an earlier instance. A plugin child is
// identified by its parent being launchd (ppid 1) and its command line pointing
// into one of our plugin folders. The current instance's own children have a
// real parent pid, so they are never touched.

const { execFileSync } = require('node:child_process');

function findOrphans(psOutput, roots) {
  const wanted = roots.filter(Boolean).map((root) => String(root).replace(/\/+$/, ''));
  const pids = [];
  for (const line of String(psOutput || '').split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    if (!match) continue;
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    const command = match[3];
    if (!pid || ppid !== 1) continue;
    if (!wanted.some((root) => command.includes(root))) continue;
    pids.push(pid);
  }
  return pids;
}

function cleanOrphans({ roots = [], exec = execFileSync, kill = process.kill, log = console.log } = {}) {
  let output = '';
  try {
    output = exec('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' });
  } catch {
    return [];
  }
  const pids = findOrphans(output, roots);
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
