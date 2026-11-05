# Crash report analysis: WindowServer session resets, 2 and 4 Nov 2026

- Machine: HawkMacStudio, Mac Studio (Mac16,9, Apple M4 Max, 64 GB), macOS 27.2 (build 26B123)
- Revision 2, 2026-11-04 ~14:50 -03, from a diagnosis session outside this repo. Revision 1 (14:12) blamed orphaned plugins. Tests later that day ruled that out as the main cause (section 9).
- Revision 3, 2026-11-04 17:30 -03, by the Ulanzi Deck Open session: section 7 steps 1-5 and the code refs were verified, the plugin-lifetime fixes landed (`97dda2c`, `ead59cd`), the A/B completed (section 11), and 5.1 has a recommendation plus a draft upstream issue. See sections 10 and 11.
- Review of Revision 3, 2026-11-04 19:03 -03, by the diagnosis session: the startup orphan sweep (`ead59cd`) needs a narrower matcher and the full root list. See section 12.
- Status, 2026-11-04 (v0.16.5): the plugin-lifetime fixes and the audit follow-ups are shipped, and the current machine is quiet (section 13). Open: key capture/Input Monitoring on macOS 27, the Meet Mute reply, and the leaked WindowServer ports.
- Audience: the session that works on Ulanzi Deck Open. Every claim has a command in section 7 or Appendix B so you can check it.

Confidence tags: **[Certain]** = seen in logs, process tables or code. **[Likely]** = strong inference. **[Guessing]** = not proven.

## Summary

1. **[Certain]** Twice, WindowServer died and macOS ended the GUI session, so all apps closed and the login screen came back. The Mac did not reboot (uptime 7 days 21 hours).
2. **[Likely]** The kernel killed WindowServer because it ran out of Mach port space (exit reason namespace 30 = `PORT_SPACE`).
3. **[Certain] (correlation)** The main driver is **process churn** from 2 Stream Deck plugins running in Ulanzi Deck Open. Each one starts a new `osascript` process on a timer; the port growth tracks it at about 1.1 ports per process (A/B in section 11). The exact one-port-per-process leak stays [Likely].
   - `com.hmarr.amphetamine` (Harry Marr): every 2 s, about 30 per minute.
   - `com.marcelopazzo.meetmute` (Marcelo Almeida): every 2 s during a call, every 15 s when idle.
4. **[Certain]** Measured WindowServer port growth on 4 Nov:
   - about 24 to 29 ports per minute with the plugins running
   - about 4 per minute (noisy) with the 2 plugins paused
   - flat or close to flat after the app was quit
5. **[Certain]** A second, separate bug: plugin processes outlive the app when the main process dies without `will-quit`. 38 such orphans had piled up since 1 Nov (versions 0.8.0 to 0.13.4). Killing them did **not** change the port growth, because they were idle. They were a real lifetime bug in 0.16.0; fixed on `main` in `97dda2c` (not released at the time of this revision).

## 1. Timeline

| When (-03) | Event | Source |
|---|---|---|
| 27 Oct 16:49 | Last real boot | `last` |
| 1 Nov 18:42 to 3 Nov 17:53 | 38 plugin processes become orphans, one set per dev run or install | `ps -o lstart` |
| 2 Nov ~17:21 | **Session reset #1.** Console session ends; new login 17:30 | `last` |
| 3 Nov 18:22 | Commit `7b1a66b` "Quit on SIGTERM without the quit confirmation" (0.13.5). No orphans after this | `git log`, `ps` |
| 4 Nov 13:45:30.205 | **Session reset #2.** launchd: WindowServer exited, `namespace: 30`, "crashed 2 times in a row" | unified log |
| 4 Nov 13:45:30 | New WindowServer (pid 83333) starts | `ps` |
| 4 Nov 14:16 to 14:18 | Test 1 baseline: plugins running | `top` |
| 4 Nov ~14:18:50 | Test 2: all 38 orphans killed | `kill` |
| 4 Nov 14:25:59 | Test 3: Amphetamine (pid 87398) and Meet Mute (pid 87450) paused with SIGSTOP | `kill -STOP` |
| 4 Nov ~14:39 | Test 4: the user quit Ulanzi Deck Open; no Ulanzi processes left | `pgrep` |

## 2. Evidence

### 2.1 WindowServer exit [Certain]

Log lines from launchd at the moment of reset #2:

```
2026-11-04 13:45:30.205 launchd[1] [system/com.apple.WindowServer [2850]:] exited with exit reason (namespace: 30 code: 0xc40000000004aaaa) - (unknown reason), ran for 114805733ms
2026-11-04 13:45:30.205 launchd[1] [system/com.apple.WindowServer [2850]:] service has crashed 2 times in a row (last was not dirty)
```

- "ran for 114805733 ms" is 31.9 hours of awake time (sleep is not counted).
- "crashed 2 times in a row" means reset #1 on 2 Nov was also a WindowServer crash. I could not find the 2 Nov exit line itself.
- loginwindow then logged `LogoutState: LogoutComplete` and exited. That is the jump back to the login screen.
- ReportCrash ran but wrote no `.ips` file for WindowServer ("No post reporting operations data found"). That is why Console shows no WindowServer crash report.

### 2.2 Namespace 30 is PORT_SPACE [Likely]

There is no `sys/reason.h` in the installed SDKs. I used the namespace names inside `/System/Library/CoreServices/ReportCrash`, which appear in enum order: `JETSAM`(1), `SIGNAL`(2) … `PAC_EXCEPTION`(28), `BLUETOOTH_CHIP`(29), `PORT_SPACE`(30). This matches the XNU order I know. I did not decode the code value `0xc40000000004aaaa`.

`PORT_SPACE` means the kernel ended the process because its Mach port table hit the limit. A Mach port is the handle macOS uses for messages between processes. Each client connection to WindowServer uses ports.

### 2.3 Ruled out [Certain]

- Kernel panic or reboot: uptime 7d 21h, no panic file.
- Memory pressure: 89% free, swap used 0.25 MB.
- Jetsam (the memory killer): WindowServer is the largest process in the Jetsam events of 2 and 3 Nov (1.0 to 1.6 GB), but it was never the process killed.
- The `core` crash at 13:45:32 (`/usr/local/bin/warsaw/core`, a banking security module) and the BlockBlock crash at 13:49 happened after the reset.
- The 38 orphaned plugins as the main churn source: killing them did not change the slope (section 2.5, test 2).

### 2.4 The churn comes from 2 live plugins [Certain]

I caught short-lived `osascript` processes with a tight `ps` loop. All of them had one of 2 parents, both children of the live app (pid 86029, version 0.16.0):

| Parent pid | Plugin | What `osascript` runs | Interval (from plugin code) |
|---|---|---|---|
| 87398 | `com.hmarr.amphetamine.sdPlugin` 0.1.0 | `if application "Amphetamine" is running then tell application "Amphetamine" to return session is active` | `setInterval(…, 2e3)`: every 2 s |
| 87450 | `com.marcelopazzo.meetmute.sdPlugin` 1.0.3 | `tell application "Google Chrome"` … loops over tabs whose URL starts with `https://mee…` | `POLL = { callPoll: [2, 1, 60], idlePoll: [15, 2, 300] }`: 2 s in a call, 15 s idle (default, min, max in seconds) |

- WindowServer logged 28 `Process creation … (osascript)` events in one minute with both plugins running. loginwindow logs 2 `Got App URL` lines per process. Revision 1 counted those lines and reported "62 per minute", which was double.
- With both plugins paused, there were 0 `osascript` creations and only about 16 new WindowServer connections in 4 minutes, mostly from Chrome and WindowManager.
- Plugin paths: `~/Library/Application Support/Ulanzi Deck Open/StreamDeckPlugins/<uuid>.sdPlugin/`.
- Meet Mute's repository is `https://github.com/marcelopazzo/meet-mute`. Its author also wrote commit `7b1a66b` in this repo.

### 2.5 Tests on 4 Nov [Certain]

WindowServer pid 83333 (started 13:45:30). Ports from `top -pid <pid> -stats pid,ports`.

| Test | Window | Ports | Net rate |
|---|---|---|---|
| 1. Baseline, plugins running, orphans alive | 14:16 to 14:18, every 30 s | 4206, 4221, 4221, 4240, 4253 | ~24 per minute |
| 2. After killing the 38 orphans | 14:19 to 14:23, every 30 s | 4307, 4304, 4321, 4339, 4351, 4360, 4378, 4415, 4424 | ~29 per minute |
| 3a. Amphetamine and Meet Mute paused (SIGSTOP) | 14:26 to 14:30, every 30 s | 4514, 4524, 4517, 4513, 4532, 4553, 4553, 4551, 4553 | ~10 per minute |
| 3b. Still paused | 14:30 to 14:34, every 30 s | 4550, 4551, 4557, 4574, 4553, 4545, 4558, 4612, 4610 | ~15 per minute, large swings |
| 3c. Still paused, single reading | 14:39:39 | 4571 | 4514 → 4571 over 13.5 min: ~4 per minute |
| 4. App quit, no Ulanzi processes | 14:40 to 14:42, every 20 s | 4574, 4602, 4592, 4585, 4585, 4583, 4584 | flat (+10 in 2 min, swings of ±30) |
| 4b. App quit, 5-minute sample | 14:42:34 to 14:47:37, every 20 s | 4593, 4591, 4595, 4587, 4595, 4602, 4599, 4606, 4595, 4596, 4613, 4586, 4587, 4595, 4618, 4589 | flat (4593 → 4589, range 4586 to 4618); 1 process creation in 5 min (Microsoft Update Assistant) |

Reading:
- **[Certain]** Short samples swing by ±30 ports, so a 2-minute window can look like it is "climbing" when the net trend is flat. Judge the trend over 10 minutes or more.
- **[Likely]** With `osascript` running about 28 times per minute, the net growth was about 24 to 29 per minute. Without it, the net growth was about 4 per minute or flat. That matches about 1 leaked port per `osascript` process.
- **[Guessing]** The remaining few ports per minute may be normal growth after a WindowServer restart, or a smaller leak from other apps. Only a multi-hour log can tell (section 7, step 2).

## 3. Cause chain

1. **[Certain]** The Amphetamine and Meet Mute plugins start a new `osascript` process every 2 to 15 s, for as long as their keys are on the deck.
2. **[Certain]** Each `osascript` process registers with WindowServer as a short-lived app (`CreateApplication`, then `Process death`).
3. **[Likely]** WindowServer keeps about 1 Mach port per such client and never releases it. This is probably a macOS bug, but the plugins trigger it about 1,700 times per hour.
4. **[Guessing]** At that rate WindowServer reaches its port limit after roughly a day or two of awake time. Reset #2 came after 31.9 hours awake. I do not know the exact limit.
5. **[Likely]** The kernel kills WindowServer with `PORT_SPACE`, and macOS ends the GUI session.

## 4. Separate bug: plugin processes outlive the app

This bug did not cause the port growth on 4 Nov, but it is real and still present in 0.16.0.

### 4.1 What was found [Certain]

38 processes with parent PID 1 were running Ulanzi plugins (full list in Appendix A). They were killed at about 14:18:50 on 4 Nov.

| Group | Count | Binary |
|---|---|---|
| Packaged app (0.10.6 to 0.13.4) | 23 | `~/Applications/Ulanzi Deck Open.app/.../Ulanzi Deck Open Helper` with `ELECTRON_RUN_AS_NODE` |
| Dev runs (0.8.0, 0.10.4) | 15 | `app/node_modules/electron/dist/Electron.app/.../Electron Helper` |

By plugin: `com.edufalcao.currency` 18, `com.ulanzi.codexLimits` 12, `com.hmarr.amphetamine` 8. Each install left one full set with the same start second. They survived both session resets.

There are no Meet Mute orphans. Its code has `ws.onclose = () => process.exit(0)`, so it exits when the host's socket closes. The other 3 plugins keep running after the socket closes.

### 4.2 How they were created [Likely]

- `PluginHost.shutdown()` (`app/lib/plugin-host.js:630`) is correct: SIGTERM, then SIGKILL after 1.5 s. It runs from `will-quit` (`app/main.js:781`).
- Before `7b1a66b` (0.13.5), Electron replaced the app's SIGTERM handler at startup. SIGTERM from `install.sh:24` went through `before-quit` and showed the quit dialog, so the app did not quit.
- `install.sh:30` then ran `pkill -9 -f "$DEST/Contents/MacOS"`. SIGKILL ends the main process without `will-quit`. The plugins are re-parented to launchd and keep running.
- Evidence: one orphan set per install from 0.10.6 to 0.13.4, and none from 0.13.5 onward.
- **[Guessing]** The 15 dev orphans came from dev Electron runs that were stopped with SIGKILL.

### 4.3 Gaps in 0.16.0 and their status [Certain]

1. **Plugin lifetime is not tied to host lifetime.** If the main process dies without `will-quit` (crash, `kill -9`, the `install.sh` fallback, a force quit), every Node plugin that ignores socket close becomes an orphan. **Fixed** in `97dda2c` (watchdog preload).
2. **No cleanup on startup.** A new instance does not look for orphans from an earlier one. **Fixed** in `ead59cd` (startup sweep).
3. **The `install.sh` fallback kills only the main binary.** Plugin helpers live under `Contents/Frameworks/`, so the pattern at line 30 misses them. **Fixed** in `97dda2c` (line 32).

## 5. Recommended fixes, in order

### 5.1 Stop the `osascript` churn (main issue) [Likely]

Both plugins are third-party code installed under Application Support. The host app cannot change their timers. Options, from fastest to most complete:

1. **Settings, no code.** Raise Meet Mute's poll intervals in its property inspector (`callPoll` up to 60 s, `idlePoll` up to 300 s). Amphetamine has no setting, so remove its key from the deck until it is fixed.
2. **Upstream fix in each plugin.** Keep one long-lived process for the checks, for example a single `osascript -l JavaScript` loop that reads requests on stdin, instead of a new process per check. One long-lived client means one WindowServer connection instead of 1,700 per hour. For Meet Mute, open an issue or PR at `marcelopazzo/meet-mute`. For Amphetamine (version 0.1.0, no URL in its manifest), fork it or replace it.
3. **Built-in action in this app.** Add an "Amphetamine session" action that uses the same long-lived approach inside the host. Only worth it if 2 is not possible.
4. **Report to Apple** with Feedback Assistant: WindowServer gains about 1 Mach port per short-lived `osascript` process on macOS 27.2 (26B123) and is killed with `PORT_SPACE`. Attach the test tables from sections 2.5 and 11.

**Revision 3 recommendation.** Do option 1 now (no code, no rebuild): raise Meet Mute's
`callPoll` and `idlePoll` through its property inspector to 60 s / 300 s, and take the
Amphetamine key off the deck until that plugin changes. File option 2 in parallel: the
draft issue for `marcelopazzo/meet-mute` is at
[`drafts/2026-11-04-meet-mute-issue.md`](drafts/2026-11-04-meet-mute-issue.md).
Amphetamine 0.1.0 has no repository in its manifest, so replacing it or forking it is a
separate decision. Do **not** build option 3 yet; it needs the owner's approval and is
only worth it if the upstream plugins cannot change. Option 4 stays useful evidence for
Apple. The installed plugin files were not modified.

### 5.2 Tie plugin lifetime to the host (section 4.3 gap 1)

Both hosts build the Node command in one place: `app/lib/plugins.js:102` and `app/lib/streamdeck-plugins.js:268` (Node branch at line 281). Add a preload in front of the plugin entry:

```js
// app/lib/plugin-watchdog.js
'use strict';
// Preloaded into every Node plugin. If the host dies, the plugin is
// re-parented to launchd and its ppid changes: exit instead of polling forever.
const parent = process.ppid;
setInterval(() => {
  if (process.ppid !== parent) process.exit(0);
}, 2000).unref();
```

```js
// in both spawnCommand() Node branches
args: ['-r', WATCHDOG, executable, ...rest],
```

**Implemented in `97dda2c`** in both hosts. The test in section 10 is red before the
change and green after.

Points verified in Revision 3:
- **[Certain]** `-r` works with `ELECTRON_RUN_AS_NODE=1` in the dev Electron and in the
  packaged 0.16.0 build.
- **[Certain, refuted]** Node mode **does** load a preload from inside `app.asar` on
  this build (`app.asar/lib/plugin-watchdog.js` loaded successfully), so no `asar.unpack`
  is needed.
- `process.ppid` is read live in Node, so the check sees the change.
- Native plugins (`sdmicmute`, `MacControls`) are not covered. None of them were orphans.

### 5.3 `install.sh` fallback also stops helpers (gap 3)

After line 30, add `pkill -9 -f "$DEST/Contents/Frameworks/" 2>/dev/null || true`.

**Implemented in `97dda2c`** as line 32.

## 6. Machine state at the end of this session

- The 38 orphans are gone (killed about 14:18:50).
- The user quit Ulanzi Deck Open at about 14:39, so the 2 paused plugin processes ended with it. Starting the app again starts both plugins again, and the churn comes back.
- WindowServer pid 83333 is still running, at about 4,600 ports.

## 7. Verification plan

1. **Check for orphans.**
   ```sh
   ps -axo pid=,ppid=,lstart=,command= | awk '$2==1' | grep -E "Ulanzi Deck Open Helper|ulanzi-deck-open/app/node_modules/electron" | cut -c1-220
   ```
   Expected now: no lines.

   **Result (Revision 3): confirmed** — the command produced no output.

2. **Long A/B test of the churn link.** Start a logger. It reads `top` once per minute for 4 hours and has no side effects:
   ```sh
   top -l 240 -s 60 -pid "$(pgrep -x WindowServer)" -stats pid,ports \
     | grep --line-buffered -E "^[0-9]{4}/|^$(pgrep -x WindowServer) " > ~/Library/Logs/windowserver-ports.log &
   ```
   - First 2 hours: Ulanzi Deck Open quit, or running with the Amphetamine and Meet Mute keys removed. Expected if section 3 is right: the port count levels off.
   - Next 2 hours: app running with both keys on the deck. Expected: a steady rise of about 25 per minute (about 1,500 per hour).
   - Count `osascript` per minute from the log at any point:
     ```sh
     /usr/bin/log show --last 60s --style compact --predicate 'process == "WindowServer" AND eventMessage CONTAINS "Process creation"' | grep -c "(osascript)"
     ```
   - If the port count still climbs steadily with no `osascript` churn, section 3 is wrong at step 3. Find the next churn source with the "new connections by PID" command in Appendix B.

   **Result (Revision 3): confirmed.** Baseline 15:03:45–17:10:06 (app quit, 126.3 min): 4,836 → 4,843 = **+0.06/min**, 0 `osascript`. Both plugins on 17:12:06–17:22:08 (10.0 min): 5,047 → 5,754 = **+70.5/min**, ~62 `osascript`/min (Amphetamine 30, Meet Mute 32). The on-window was stopped after 10 minutes because the trend was already decisive; the logger then recorded the post-quit return (17:25–17:28: +4.6/min, 0 `osascript`). See section 11.

3. **Reproduce the lifetime gap on 0.16.0.** Start the app with Amphetamine on a key. Note its plugin PID (a child of the main PID). Run `kill -9 <main pid>`. Expected today: the Amphetamine plugin survives with parent PID 1. Clean up with the command in Appendix B.

   **Result (Revision 3): reproduced before the fix** by `test/plugin-lifetime.test.js`: a real `StreamDeckPlugins` host is started in a child, a Node plugin is spawned, the host is SIGKILLed, and the plugin stays alive (test red, section 10). A packaged-app GUI repetition of the unfixed build was not possible from the non-GUI session; step 5 covers the fixed build on the packaged app.

4. **Graceful quit still works.** `pkill -TERM -f "$HOME/Applications/Ulanzi Deck Open.app/Contents/MacOS"`. Expected: main and all plugins gone within about 3 s.

   **Result (Revision 3): confirmed** — on the packaged fixed build, `kill -TERM` on the main PID left 0 main and 0 of 6 plugin children after 3.5 s.

5. **After 5.2:** repeat step 3. Expected: the plugin exits within about 2 s.

   **Result (Revision 3): confirmed** — on the packaged fixed build, `kill -9` on the main PID left 0 of 6 plugin children at the 2 s sample; no parent-PID-1 plugin processes remained.

6. **After 5.1:** with the fix in place, repeat the second half of step 2. Expected: no steady rise.

## 8. Not proven

- The exact WindowServer port limit, so the time to failure at a given rate is a rough estimate.
- That the leak is in WindowServer and not in a related service. The test only shows that WindowServer's own port count tracks `osascript` churn.
- Whether a long-lived `osascript` process avoids the leak. It should, because it is one client, but test it with step 2.
- The 927 `com.edufalcao.ulanzideckopen.helper` deaths in the 16 minutes before reset #1 on 2 Nov. Possibly orphans reconnecting to the new host and fighting for the same plugin UUID. Not studied.
- The 2 Nov WindowServer exit line. I inferred it from "crashed 2 times in a row".

## 9. Corrections to revision 1

- Revision 1 named the orphans as the main cause of the churn. Wrong: killing all 38 did not change the slope (test 2). They were idle.
- Revision 1 reported "about 60 `osascript` per minute". Wrong: loginwindow logs 2 lines per process. The real rate was about 28 per minute.
- Revision 1 counted 37 orphans. The correct count is 38 (18 `currency`, not 17).

## 11. Revision 3 A/B result

| Phase | Window | Ports | Rate | `osascript` |
|---|---|---|---|---|
| Baseline, app quit | 15:03:45–17:10:06 (126.3 min) | 4,836 → 4,843 | **+0.06/min** | 0 |
| Both plugins on | 17:12:06–17:22:08 (10.0 min) | 5,047 → 5,754 | **+70.5/min** | ~62/min |
| Post-quit | 17:25:08–17:28:09 (3.0 min) | 5,848 → 5,862 | **+4.6/min** | 0 |

- Both keys were on Page 1 for the on-window. The owner added Meet Mute to slot 10 for
  the test; it was removed afterwards, and Page 3 slot 9 is untouched.
- `ps` loop, 30 s sample: Amphetamine **30 starts/min**, Meet Mute **32/min**. The ratio
  is 70.5 / 62 ≈ **1.14 ports per process**, close to section 3's "about 1".
- The on-window was stopped after 10 minutes because the trend was already unambiguous;
  section 2.5's own rule is to judge over 10 minutes or more. The first 3 minutes after
  quit showed +4.6/min with 0 `osascript`, within the ±30-port swing noted in section 2.5;
  a longer off-leg was not needed once the on-window was decisive.
- Appendix B's `log show` count returned **0** on macOS 27.2 while the `ps` loop caught
  62/min. The unified-log "Process creation" event is no longer usable for this; use the
  `ps` loop for `osascript` counts on this build.
- With Meet Mute in call mode (2 s), the churn is ~62/min ≈ 3,700/hour, not the ~28/min
  in Revision 2, and the port rate scales with it. The settings workaround in 5.1
  (60 s / 300 s) would cut that plugin's share to ~4/min; Amphetamine has no setting.
- The churn → port-growth correlation is now **[Certain]**. The leak mechanism
  (WindowServer holding the port) stays **[Likely]**, and the time-to-limit stays
  **[Guessing]**.

## Appendix A: orphan list (killed 2026-11-04 ~14:18:50)

`PKG` = packaged app helper, `DEV` = dev Electron helper. The version is the app version passed to the plugin.

| PID | Started | Type | Plugin | Version |
|---|---|---|---|---|
| 43079 | Nov 1 18:42:08 | DEV | currency | 0.8.0 |
| 43606 | Nov 1 18:43:01 | DEV | currency | 0.8.0 |
| 44891 | Nov 1 18:44:07 | DEV | currency | 0.8.0 |
| 45124 | Nov 1 18:44:31 | DEV | currency | 0.8.0 |
| 56468 | Nov 1 18:52:46 | DEV | currency | 0.8.0 |
| 57600 | Nov 1 18:53:41 | DEV | currency | 0.8.0 |
| 57619 / 57621 / 57622 | Nov 2 15:18:03 | DEV | currency / codexLimits / amphetamine | 0.10.4 |
| 14837 / 14839 / 14840 | Nov 2 15:39:17 | DEV | currency / codexLimits / amphetamine | 0.10.4 |
| 7460 / 7462 / 7463 | Nov 2 15:50:20 | DEV | currency / codexLimits / amphetamine | 0.10.4 |
| 41789 / 41792 / 41793 | Nov 2 18:45:05 | PKG | currency / codexLimits / amphetamine | 0.10.6 |
| 78666 / 78668 | Nov 2 20:25:42 | PKG | currency / codexLimits | 0.11.0 |
| 89457 / 89459 / 89462 | Nov 3 07:22:05 | PKG | currency / codexLimits / amphetamine | 0.11.3 |
| 39654 / 39656 | Nov 3 08:20:06 | PKG | currency / codexLimits | 0.11.5 |
| 73402 / 73404 / 73407 | Nov 3 08:27:40 | PKG | currency / codexLimits / amphetamine | 0.11.6 |
| 32556 / 32558 / 32561 | Nov 3 11:34:28 | PKG | currency / codexLimits / amphetamine | 0.12.0 |
| 46775 / 46777 | Nov 3 15:05:36 | PKG | currency / codexLimits | 0.13.1 |
| 6914 / 6916 | Nov 3 17:34:50 | PKG | currency / codexLimits | 0.13.3 |
| 8993 / 8996 / 8999 | Nov 3 17:53:03 | PKG | currency / codexLimits / amphetamine | 0.13.4 |

## Appendix B: commands

Use `/usr/bin/log`, not `log`. zsh has a `log` builtin that fails with "too many arguments". In zsh, pass PID lists through `xargs`, because `kill $pids` does not split on newlines.

```sh
# Session history (console logins, reboots)
last | grep -E "console|reboot|shutdown" | head

# WindowServer exit lines (for 2 Nov use 2026-11-02 17:10 to 17:31)
/usr/bin/log show --start "2026-11-04 13:44:00" --end "2026-11-04 13:45:35" --style compact \
  | grep -E "system/com.apple.WindowServer \[" | grep -iE "exit|crash"

# Namespace names in enum order
strings /System/Library/CoreServices/ReportCrash | grep -E "^(JETSAM|SIGNAL|PAC_EXCEPTION|BLUETOOTH_CHIP|PORT_SPACE|WEBKIT)$"

# Short-lived processes registered with WindowServer, last minute, by name
# On macOS 27.2 (26B123) this returned 0 while `ps` caught 62 osascript/min; use the
# ps loop below for the count.
/usr/bin/log show --last 60s --style compact \
  --predicate 'process == "WindowServer" AND eventMessage CONTAINS "Process creation"' \
  | grep -oE "Process creation: [^ ]+ \([^)]*\)" | sed -E 's/Process creation: [^ ]+ //' | sort | uniq -c | sort -rn

# New WindowServer connections, last 4 minutes, by PID
/usr/bin/log show --last 4m --style compact \
  --predicate 'process == "WindowServer" AND eventMessage CONTAINS "New conn"' \
  | grep -oE "PID [0-9]+" | sort | uniq -c | sort -rn | head

# Who starts osascript (run while the app is up)
for i in $(seq 1 400); do ps -axo pid=,ppid=,command= | awk '$3 ~ /osascript/'; done | sort -u -k1,1 | awk '{print $2}' | sort | uniq -c

# WindowServer ports
top -l 1 -pid "$(pgrep -x WindowServer)" -stats pid,ports

# Kill orphaned plugin processes (parent PID 1 only; the running app is not touched)
ps -axo pid=,ppid=,command= \
  | awk '$2==1 && (/Ulanzi Deck Open Helper\.app\/Contents\/MacOS\/Ulanzi Deck Open Helper/ || /ulanzi-deck-open\/app\/node_modules\/electron\/dist\/Electron\.app\/Contents\/Frameworks\/Electron Helper/) {print $1}' \
  | xargs kill
```

## 10. Revision 3 — verification and changes

### Verification results

| Claim | Result | Evidence |
|---|---|---|
| 7.1: no orphaned plugin processes remain | **Confirmed** | The `ps`/`awk` command produced no output. |
| 4.3 gap 1: plugin lifetime is not tied to the host | **Confirmed by reproduction** | `test/plugin-lifetime.test.js`: the plugin was still alive 4 s after the host's `SIGKILL` (test red before `97dda2c`). |
| 4.3 gap 3: `install.sh` kills only the main binary | **Confirmed** | `install.sh:30` matched `Contents/MacOS` only; Node plugin children run the Helper under `Contents/Frameworks/`. |
| 4.2: `shutdown()` is SIGTERM then SIGKILL (1.5 s), called from `will-quit` | **Confirmed** | `app/lib/plugin-host.js:630-660`, `app/main.js:781-807`. |
| 5.2: both hosts build the Node command in one place | **Confirmed** | `app/lib/plugins.js:102`, `app/lib/streamdeck-plugins.js:268`; Node branches at `:107` and `:284` after the fix. |
| 5.2: `-r` works with `ELECTRON_RUN_AS_NODE=1` | **Confirmed** | Dev Electron and the packaged 0.16.0 binary both loaded a preload with `-r`. |
| 5.2: Node may not load a preload from inside `app.asar` | **Refuted** | `-r "$APP/Contents/Resources/app.asar/lib/version.js"` and the watchdog path both loaded in the packaged build. |
| 2.2: namespace 30 is `PORT_SPACE` | **Confirmed (string order)** | `strings ReportCrash` prints `JETSAM … PAC_EXCEPTION, BLUETOOTH_CHIP, PORT_SPACE, WEBKIT`; the numeric enum mapping remains inferred. |
| 2.4: Amphetamine polls every 2 s, Meet Mute 2 s in a call / 15 s idle | **Confirmed** | `setInterval(..., 2e3)` in Amphetamine's bundle; `POLL = { callPoll: [2,1,60], idlePoll: [15,2,300] }` in `plugin.js:22`. |
| 4.1: Meet Mute exits on socket close, the others do not | **Confirmed** | `plugin.js:186` `ws.onclose = () => process.exit(0)`; Amphetamine's bundle has no equivalent exit. |
| 7.4: graceful quit stops the plugins | **Confirmed** | Packaged fixed build: `kill -TERM` left 0 main and 0 of 6 plugin children after 3.5 s. |
| 7.5: the watchdog stops plugins after `kill -9` | **Confirmed** | Packaged fixed build: all 6 plugin children were gone at the 2 s sample, with no parent-PID-1 leftovers. |
| 4.3 gap 2: cleanup on startup | **Confirmed by test** | `test/orphan-cleanup.test.js` creates a real re-parented process under a plugin root and asserts the sweep kills it. |

### Changes

| Commit | Change | Effect |
|---|---|---|
| `97dda2c` | `app/lib/plugin-watchdog.js`, wired into both Node spawn paths | Node plugins exit about 1 s after the host dies without `will-quit`. |
| `97dda2c` | `scripts/install.sh:32` also kills helpers under `Contents/Frameworks/` | the last-resort kill stops plugin children too. |
| `97dda2c` | `test/plugin-lifetime.test.js` + `test/fixtures/plugin-host-runner.js` | red before the fix, green after (1.2 s). |
| `97dda2c` | tests | 291 total, 289 pass, 2 skipped; lint/typecheck clean. |
| `ead59cd` | `lib/orphan-cleanup.js` + startup call in `main.js` | leftovers from an earlier instance (parent PID 1 under a plugin folder) are killed before this instance spawns any plugin. |
| `ead59cd` | `test/orphan-cleanup.test.js` | parser, injected kill path and a real re-parented process; 4 tests. |

Gap 2 (cleanup on startup) is fixed in `ead59cd`: a new instance kills leftovers from an
earlier one before it starts its own plugins.

### 5.1 write-up

The recommendation is in section 5.1. The draft upstream issue is
[`drafts/2026-11-04-meet-mute-issue.md`](drafts/2026-11-04-meet-mute-issue.md). The
installed plugin files were not modified; Amphetamine 0.1.0 has no repository in its
manifest, so it needs a replace/fork decision.

### Tag changes

- 5.2's asar bullet: **[Guessing] → refuted**; no `asar.unpack` is needed.
- 5.2's `-r` bullet: **[Likely] → [Certain]**.
- 4.3 gaps 1 and 3: **open → fixed in `97dda2c`**; gap 2: **open → fixed in `ead59cd`**.
- Summary item 5: **still broken → fixed on `main`** (unreleased).
- 2.2: the namespace **string** order is confirmed; the numeric 30 mapping stays [Likely].

### Pending, needs the owner

- **Section 7 step 2** (4-hour A/B, about 2 hours with the app quit or the two keys off
  the deck): not started. Needs approval and the owner's hands on the machine.
- **5.1 option 3** (built-in Amphetamine action): deliberately not started; needs
  approval, and only if the upstream fix is not possible.
- **Packaging note:** `npm run install-app` could not fetch Electron's remote
  `SHASUMS256.txt` in the no-DNS session. The same package and install steps were run
  with the cached Electron zip, so the installed app is still the packaged arm64 build
  from this commit.

## 12. Review feedback: startup orphan sweep (`ead59cd`)

From the diagnosis session, 2026-11-04 19:03 -03, reviewed against `v0.16.1`. The watchdog (`97dda2c`) and the `install.sh` change are fine. On the live 0.16.1 app, every Node plugin runs with `-r …/app.asar/lib/plugin-watchdog.js` and has stayed up for over 1 hour. This section is about `app/lib/orphan-cleanup.js` only.

### 12.1 The matcher can SIGKILL a process that is not a plugin [Likely]

- `findOrphans()` (`app/lib/orphan-cleanup.js:10`) accepts any process that has parent PID 1 and whose command line *contains* a plugin root anywhere.
- **[Certain]** Parent PID 1 does not mean "orphan". Every GUI app started from Finder, the Dock or `open`, and every launchd agent, has parent PID 1. On this Mac right now that includes Logi Options+, Chrome's `chrome_crashpad_handler` and the cmux helpers.
- Failure scenario: some app or tool is running with parent PID 1, and a plugin path appears in its arguments. For example, an editor opened on a plugin folder from the command line: `/Applications/Visual Studio Code.app/Contents/MacOS/Electron /Users/eduardo/Library/Application Support/Ulanzi Deck Open/StreamDeckPlugins/x.sdPlugin`. When Ulanzi Deck Open starts, `findOrphans` returns that PID and `cleanOrphans` sends SIGKILL, so unsaved work is lost without a prompt.
- The current test (`test/orphan-cleanup.test.js:30`) misses this case. Its only non-plugin line is `/usr/bin/other /tmp/not-ours.js`, which mentions no plugin root.

### 12.2 Proposed rule: match the executable

A process is a leftover plugin only if its parent PID is 1 **and** one of these holds:

1. **Native plugin.** The command starts with `<root>/`. Native plugins run their own binary from inside the plugin folder (`sdmicmute`, `MacControls`).
2. **Node plugin.** The command starts with a known plugin runtime followed by a space, **and** a later argument starts with `<root>/`. Pass the runtimes in from the caller, for example `[nodeRuntime(), process.execPath]`. A packaged instance's `nodeRuntime()` is the same Helper path that the pre-0.16.1 orphans used, so leftovers from older installs still match.

Implementation notes:
- Both the runtime path and the plugin paths contain spaces, and `ps -o command=` joins argv with spaces. Compare with `command.startsWith(runtime + ' ')` and `command.includes(' ' + root + '/')`. Splitting on whitespace gives wrong results.
- Keep `findOrphans(psOutput, roots, runtimes)` pure, so the tests can call it without `ps`.

### 12.3 The root list is a second copy, and it misses a folder [Certain]

- `app/main.js:696-704` hard-codes 5 roots.
- The hosts build their own lists:
  - `plugin-hosts.js:23`: `[path.join(baseDir, 'Plugins'), ...pluginRootDirs()]`
  - `pluginRootDirs()` (`lib/plugins.js:34`) also adds `~/.ulanzi/Plugins`
  - `streamDeckPluginDirs(appDir)` (`lib/streamdeck-plugins.js:61`) builds the Stream Deck list, with `appPluginsDir` from `plugin-hosts.js:102`
- `~/.ulanzi/Plugins` is missing from the sweep list, so orphans from that folder are never swept.
- Build the sweep roots from `pluginRootDirs()` and `streamDeckPluginDirs()` (plus the app's own `Plugins` and `StreamDeckPlugins` folders). Then a new plugin folder needs one edit, not two.

### 12.4 Work to do, test-first

1. Add a test that goes **red** on `v0.16.1`. Give `findOrphans` a parent-PID-1 line whose executable is outside every root and is not a runtime, with a plugin root in one argument. Expected: no match.
2. Add a test with a parent-PID-1 `<runtime> -r <watchdog> <root>/x/plugin.js …` line, where both paths contain spaces. Expected: a match.
3. Add a test with a parent-PID-1 `<root>/x.sdPlugin/sdmicmute -port …` line. Expected: a match.
4. Add a test that the sweep roots include every folder from `pluginRootDirs()` and `streamDeckPluginDirs()`. Expected: **red** on `v0.16.1`, for `~/.ulanzi/Plugins`.
5. Implement 12.2 and 12.3, then make all four tests green.

Done when:
- the 4 tests pass and `npm test` passes
- the existing real re-parented process test (`test/orphan-cleanup.test.js:60`) still passes
- on a packaged build, `kill -9` on the main process and then starting the app again leaves no parent-PID-1 processes under any plugin root (section 7 step 1 command)

### 12.5 Resolution (Revision 3, 19:12 -03)

- **12.1 confirmed.** The editor line matched both processes (`301`, `302`) in the new
  test before the fix; it now returns none.
- **12.2 implemented in `518a242`.** `findOrphans(psOutput, roots, runtimes)`: a native
  plugin must start with `<root>/`; a Node plugin must start with one of our runtimes
  followed by a space and contain ` <root>/` in an argument. Spaces are compared with
  `startsWith`/`includes`, never by splitting.
- **12.3 implemented in `518a242`.** `lib/plugin-dirs.js` now owns `pluginRootDirs()`,
  `streamDeckPluginDirs()` and `sweepRoots()`; the hosts and the sweep use it, and
  `~/.ulanzi/Plugins` is included.
- **Tests:** editor false-positive, runtime+root, native, multiple roots, the full root
  list and the real re-parented process. 298 total, 296 pass, 2 skipped; lint and
  typecheck clean. The editor test was red on `v0.16.1` before the change.
- **Packaged verification (fixed build):**
  - a real orphan (`Helper -e … <root>/fake.js`, ppid 1) was killed at startup;
  - a false positive (`/opt/homebrew/bin/node … <root>`, ppid 1) survived the sweep;
  - `kill -9` on the main left no plugin children and no ppid-1 leftovers;
  - starting the app again left no ppid-1 leftovers.
- **Not released:** `518a242` is on `main` after `v0.16.1`; the installed
  `~/Applications` build contains it, but the 0.16.1 DMG does not.

## 13. Status after 0.16.5 (2026-11-04)

- **Plugin lifetime / orphans:** shipped in 0.16.1–0.16.2 (watchdog, startup
  sweep, strict matcher, shared roots). Verified on a packaged build: a real
  orphan is killed, an editor-style process survives, and `kill -9` leaves no
  leftovers.
- **Churn in the app's own code:** the 2026-11-04 audit's M1–M5 and L1–L6 are
  shipped in 0.16.3–0.16.5; the audit's §8 has the resolution table.
- **Current machine:** the noisy pair (Meet Mute and macOS Controls) is not in
  the active profile set. A 10-minute packaged run at 0.16.3 added 3.9
  WindowServer ports/min with four plugins and 0 `osascript`.
- **Still open:** the ~8k leaked WindowServer ports only clear with logout/reboot;
  Meet Mute has not replied; and key capture is unresolved on macOS 27 (the
  kernel refuses the seize with `kIOReturnNotPrivileged`, and TCC does not hold
  an ad-hoc build's grant). See [`STATUS.md`](STATUS.md) P1.
