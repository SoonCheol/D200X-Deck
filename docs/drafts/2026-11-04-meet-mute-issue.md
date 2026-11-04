# Message for Marcelo (marcelopazzo/meet-mute)

**Status:** draft, ready to send. Written 2026-11-04 from the crash analysis in
[`../CRASH-REPORT-ANALYSIS-20261104.md`](../CRASH-REPORT-ANALYSIS-20261104.md).
No changes were made to the installed plugin.

**Subject:** Meet Mute polling spawns a new `osascript` every 2 s; WindowServer hit a
Mach-port limit and reset my session

---

Hi Marcelo,

I have been debugging two WindowServer crashes on my Mac and traced them to short-lived
`osascript` processes. Meet Mute is one of the two plugins producing them, so I wanted
to show you the measurements before opening an issue.

**Setup:** macOS 27.2 (26B123), Mac Studio (M4 Max, 64 GB), Meet Mute 1.0.3 running in
Ulanzi Deck Open 0.16.0 (the D200 host runs plugins as Node children).

**What I see:** `plugin.js` uses `execFile('osascript', ['-e', script], …)` on a timer.
With the defaults (`POLL = { callPoll: [2, 1, 60], idlePoll: [15, 2, 300] }`) that is a
new `osascript` every 2 s during a call and every 15 s when idle. Each process registers
with WindowServer as a short-lived app.

**What I measured** (WindowServer port count from `top -pid <pid> -stats pid,ports`):

- Meet Mute + Amphetamine running: **~28 `osascript` per minute**, WindowServer ports
  **+24 to +29 per minute**.
- Both plugins paused (`SIGSTOP`): 0 `osascript`, ports **~4 per minute**.
- Host app quit: no `osascript`, ports **flat**.

After 31.9 hours of awake time WindowServer exited with `namespace: 30` (`PORT_SPACE`),
and macOS ended the GUI session. I think the port leak itself is a macOS bug, but the
polling is what reaches the limit — roughly 1,700 processes per hour.

**Suggestion:** keep one long-lived JXA process and send requests on stdin, instead of
starting a new `osascript` per poll. Even one `osascript -l JavaScript` per plugin would
turn 1,700 WindowServer connections per hour into one. A native helper would be even
lighter if you prefer.

I have not touched your plugin files. Happy to test a branch, share the log commands,
or send the full measurement table if it helps. Thanks for Meet Mute — the mute toggle
itself works well.

(Epilogue for the repo only: Amphetamine 0.1.0 has the same pattern and no repository in
its manifest, so that one needs a separate replace/fork decision.)
