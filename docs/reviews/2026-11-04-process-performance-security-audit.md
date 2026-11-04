# Ulanzi Deck Open — process, performance and security audit

Date: 2026-11-04. Source reviewed: `04cb983` (Release 0.16.2), clean `main`. Scope: `app/` (main process, IPC, renderer timers, plugin hosts, native helpers) and `app/scripts/install.sh`. The Python prototype is out of scope.

Why this audit: [`CRASH-REPORT-ANALYSIS-20261104.md`](../CRASH-REPORT-ANALYSIS-20261104.md) showed that 2 third-party plugins started about 28 `osascript` processes per minute, and WindowServer died of Mach port exhaustion. It also found plugin orphans and an orphan sweep that could SIGKILL the wrong process. This audit looks for the same classes of defect in the app's own code:

- processes started on a timer (churn)
- children that outlive their parent (orphans)
- kill rules that can match an unrelated process
- synchronous work on the Electron main thread that repeats every second
- trust boundaries that the earlier audits left open

Confidence tags: **[Certain]** = seen in code, logs or a local run. **[Likely]** = strong inference. **[Guessing]** = not proven.

## 1. Summary

- **[Certain] No High finding.** No *churn* timer is active with the current config on this Mac (0 command-output keys, 0 app-linked profiles, wide key in clock mode). The always-on 1 s wide-panel refresh (`app.js:2160`) only redraws the canvas locally in clock/blank mode: it starts no process and makes no IPC call. The crash risk on this machine is still the 2 third-party plugins.
- **[Certain] The app has 2 built-in churn paths of the same kind as the plugins.** Command-output keys run `/bin/sh -c <command>` on a timer for every such key in every profile, visible or not (M1). The frontmost-app watcher starts 2 `lsappinfo` processes every 3 s, which is 2,400 per hour, whenever any profile is linked to an app (M2).
- **[Certain] Timed-out command-output commands leave orphans.** `execFile`'s timeout kills only `/bin/sh`. Children of a pipeline or of a multi-command string are re-parented to PID 1. This was reproduced with the same options and an inert `sleep` (M3).
- **[Certain] Plugin title and settings updates rewrite `config.json` and `config.json.bak`.** A plugin whose title changes every second causes one synchronous save per second on the main thread, and the backup is overwritten every second (M4).
- **[Certain] A running Timer action pushes the full page every second**, although the single-key protocol 13 path exists (M5).
- **[Certain] `install.sh` kill patterns match any process whose command line contains the bundle path.** Reproduced with an inert `perl` process. This is the defect from crash-report section 12.1, in a second place (L1).
- **[Certain] 3 earlier findings are still open:** unauthenticated plugin WebSocket registration, the `hidseize` hot-plug gap, and `import()` deleting before copying (section 4).

Measured context: WindowServer (pid 83333) held **7,666 to 7,695 ports** between 20:37 and 20:39, flat, with Ulanzi Deck Open not running. It was about 4,600 at 14:47. Leaked ports are not returned while that WindowServer instance lives.

## 2. Findings table

| ID | Finding | Class | Active here? | Effort |
|---|---|---|---|---|
| M1 | Command-output keys spawn a shell on a timer, for hidden keys too | churn | no | S |
| M2 | Frontmost-app watcher spawns 2 `lsappinfo` every 3 s | churn | no | S/M |
| M3 | Timed-out command-output commands orphan their children | orphans | no | S |
| M4 | Plugin title/settings updates rewrite the config and its backup | main-thread I/O, data safety | no (0 `setTitle` in the 31-min log) | S |
| M5 | Timer action pushes the full page every second | HID + main thread | only while a timer runs | S |
| L1 | `install.sh` `pkill -f` can kill unrelated processes | wrong-process kill | dev script | S |
| L2 | Renderer crash triggers an immediate reload with no limit | crash loop | no | S |
| L3 | Deck reconnect enumerates all HID devices synchronously every 4 s | main thread | when the deck is unplugged | S |
| L4 | Every Stream Deck message costs 3 synchronous file calls | main-thread I/O | **yes, 4.3 lines/s** | S |
| L5 | App picker starts `plutil` + `sips` per installed app | churn (bounded) | on first picker open | S |
| L6 | Key-press shell commands hold 2 pipes per long-lived child | file descriptors | depends on keys | S |

## 3. Findings by severity

Severity follows the earlier audits: it includes operational impact, not only security impact.

### High

None.

### Medium

#### M1. Command-output keys spawn a shell on a timer, for hidden keys too

**Where:** `app/renderer/app.js:409` (`commandInterval`), `app/renderer/app.js:448` (`syncCommandOutputs`), `app/renderer/app.js:505`, `app/ipc.js:122`, `app/lib/actions.js:91`.

**What:**
- **[Certain]** `syncCommandOutputs()` starts one `setInterval` for every key with `type: 'command'` and `showOutput: true`. It walks every page of every profile and every pinned key. `commandKeyVisible()` (`app.js:440`) is used only to decide whether to redraw. It does not stop the spawn.
- **[Certain]** Each tick runs `/bin/sh -c <command>` through `execFile`. The interval is 5 s minimum, 30 s default.
- **[Certain]** `main.js:120` sets `backgroundThrottling: false`, so these timers keep full speed while the editor is hidden. They also run while the deck is disconnected.
- **[Certain]** The editor suggests `osascript` as the example command (`app/renderer/inspector.js:1190`), and the default config uses `osascript` for volume and music keys (`app/lib/store.js:351`).

**Why:** **[Likely]** an `osascript` command-output key leaks WindowServer ports in the same way as the plugins: the crash report measured about 1.1 ports per `osascript` process. 3 such keys at 5 s give 36 processes per minute. That is more than the 2 plugins combined (about 28 per minute) that preceded the 4 Nov session reset. Hidden pages and other profiles add load that nobody sees.

**Fix:**
1. In `tick`, return early unless `commandKeyVisible(keyLocation(key))` is true and the deck is connected or the editor is visible. When a key becomes visible again, call `entry.tick()` once so it does not show stale output.
2. Optional: when the command starts with `osascript` and the interval is under 60 s, show a hint in the inspector.

Regression check: a renderer test with 2 output keys on 2 pages; switch pages; assert `api.runCommandOutput` is called only for the visible key. **Effort S.**

#### M2. The frontmost-app watcher spawns 2 `lsappinfo` processes every 3 s

**Where:** `app/renderer/app.js:1188` to `app/renderer/app.js:1204`, `app/ipc.js:825`.

**What:**
- **[Certain]** When any profile has `appPath`, the renderer calls `api.frontmostApp()` every 3 s. Each call runs `lsappinfo front`, then `lsappinfo info …`. The 1 s cache in `ipc.js:826` does not help at a 3 s interval.
- **[Certain]** That is 40 processes per minute, 2,400 per hour. This is more than the 1,700 per hour from the 2 plugins. The watcher runs with the window hidden (`backgroundThrottling: false`) and with the deck unplugged.
- **[Certain]** `lsappinfo` links CoreGraphics and ApplicationServices (`otool -L`). `ioreg`, used by `sysstats`, links only IOKit, so it cannot be a WindowServer client.
- **[Guessing]** whether `lsappinfo` leaks WindowServer ports. 100 calls changed the port count from 7,674 to 7,675. However, the positive control (30 × `osascript -e 'return 1'`) also showed no rise in this shell. So the test cannot tell. See Appendix B.

**Why:** if `lsappinfo` behaves like `osascript`, one linked profile is enough to reach port exhaustion faster than the plugins did. Even if it does not leak, 2,400 process launches per hour is wasted CPU for a check that changes a few times per hour.

**Fix:** replace polling with 1 long-lived process: `lsappinfo listen +becameFrontmost forever` (documented in `man lsappinfo`, example "Show the notifications sent out whenever the front application is changed"). Parse its output in main and push changes to the renderer. If that output proves hard to parse, the minimum change is to poll only while the deck is connected.

Regression check: a unit test for the parser on a captured `listen` sample, and a check that no `lsappinfo` process starts per tick. **Effort S/M.**

#### M3. Timed-out command-output commands orphan their children

**Where:** `app/lib/actions.js:91` to `app/lib/actions.js:96`.

**What:** **[Certain]** `execFile('/bin/sh', ['-c', command], { timeout: 8000 })` sends SIGTERM to `/bin/sh` only. A standalone script with the same options (Appendix B.4) showed:
- `sleep 6 # …\nsleep 6` with a 1 s timeout: the callback fired at 1,008 ms, and 1 `sleep` was left with parent PID 1.
- `(sleep 6; echo late) & sleep 6`: 4 processes were left, 3 with parent PID 1.

A single simple command is safe, because `sh` replaces itself with it (exec). Pipelines (`osascript … | head -1`), `;` lists and `&&` chains are not.

**Why:** a command that hangs (an AppleScript waiting on a busy app, a network call) leaves 1 orphan per tick. At the 5 s minimum that is up to 720 orphans per hour. The startup orphan sweep does not catch them: they are not under a plugin root. They also survive quit.

**Fix:** use `spawn` with `detached: true`, so the shell leads its own process group. Run your own timer and, on timeout, call `process.kill(-child.pid, 'SIGKILL')`. Keep the 256 KB output cap by counting bytes. Make the timeout a parameter so a test can use 500 ms.

Regression check: `runCommandOutput('sleep 30 | cat; # MARKER', { timeout: 500 })`; after 1 s, assert no process command line contains the marker. **Effort S.**

#### M4. Plugin title and settings updates rewrite `config.json` and its backup

**Where:** `app/renderer/app.js:1996` to `app/renderer/app.js:2025` (`onPluginTitle`), `app/renderer/app.js:1988` (`onPluginSettings`), `app/renderer/ui.js:575` (`scheduleSave`, 250 ms debounce), `app/lib/store.js:644` (`save`).

**What:**
- **[Certain]** When a plugin title changes, the renderer writes it into `key.label` and calls `scheduleSave()`. `setSettings` does the same.
- **[Certain]** Each `save()` runs on the main thread, synchronously: deep-copies and stringifies the config, writes `config.json.tmp`, copies `config.json` to `config.json.bak`, renames, reads and parses `.bak` again, then lists `Images/` to prune.
- **[Likely]** a plugin that updates its title every second (clocks, timers, counters, monitors) causes 1 save per second. With the current 24.5 KB config that is about 49 KB written per second, or about 4 GB per day.
- **[Certain]** `.bak` is replaced on every save. After any bad edit, the next plugin title tick copies the bad state into `.bak` within about 1 s. The backup then protects only against a torn write, not against a bad edit.
- **[Certain] Not active here:** the 31-minute log window (Appendix B.3) has 0 `setTitle` and 0 `setSettings` events.

**Fix:** keep plugin-driven titles in runtime state only and stop writing `key.label` from plugin events. `pluginStateTitles` already holds per-state titles, but it is keyed `${actionid}:${stateIndex}` and `effectiveKey()` (`app.js:340`) only consults that form. A stateless title therefore needs either a separate map or a wildcard key that `effectiveKey()` and `drawIndex()` also read; reusing the existing map is not a one-line change. Keep `scheduleSave()` for `setSettings`, since plugins expect settings to persist, but those are rare. Separately, consider copying `.bak` only when the previous save is older than a few minutes.

Regression check: a renderer test that sends 10 `onPluginTitle` events and asserts `api.saveConfig` is not called. **Effort S.**

#### M5. A running Timer action pushes the full page every second

**Where:** `app/renderer/press.js:101` to `app/renderer/press.js:119`, `app/renderer/press.js:86`, `app/lib/page.js:54`, `app/lib/deck.js:111`.

**What:**
- **[Certain]** While a Timer key runs, `tick()` calls `pushNow({ background: true })` every second.
- **[Certain]** `pushNow` renders every key and sends the page to main. Main builds a ZIP with DEFLATE level 6 in JavaScript (JSZip). Then it writes it with synchronous `device.write()` calls of 1,024-byte reports.
- **[Certain]** The code comment in `ui.js` says a full page is "hundreds of KB over HID".
- **[Certain]** A single-key path exists: `pushKeyNow(index)` (`ui.js:731`) through `scheduleLivePush(index)` (`ui.js:712`), protocol 0x0d.
- **[Certain] Deliberate trade-off:** the `tick()` comment in `press.js` says this is an intentional exception to the 5 s live-image throttle, because a timer must count down in real time. This is not an oversight; the finding is that the full-page path is a heavier way to meet that requirement than the per-key 0x0d path.
- **[Guessing]** the exact cost per push. This session had no deck attached, so it was not measured.

**Why:** a 5-minute timer means 300 full-page builds over 5 minutes (one per second), each followed by a few hundred blocking 1,024-byte HID writes, on the main thread. That main thread also handles key events, plugin sockets and IPC.

**Fix:** in `tick()`, replace `pushNow({ background: true })` with `scheduleLivePush(index)`. `scheduleLivePush` already coalesces to 1 per second and falls back to a full push when needed. Call `notePluginKeyPress()` first if the first frame must be quick.

Regression check: a press test that starts a timer and asserts `api.pushKey` is called and `api.pushPage` is not, for 3 ticks. **Effort S.**

### Low

#### L1. `install.sh` kill patterns can SIGKILL unrelated processes

**Where:** `app/scripts/install.sh:24`, `:26`, `:30`, `:32`.

**What:** **[Certain]** `pkill -f` matches the pattern anywhere in a command line. Reproduced: an inert `perl -e 'sleep 15' "$DEST/Contents/Frameworks/editor-open-file.txt"` matched the line 32 pattern. The same pattern with a `^` prefix did not match it (Appendix B.5).

**Why:** this is the defect from crash-report section 12.1. An editor, `tail` or debugger opened on a file inside the bundle would be killed with SIGKILL during `npm run install-app`. The script is dev-only, so this is Low.

**Fix:** prefix all 4 patterns with `^`, for example `pkill -9 -f "^$DEST/Contents/Frameworks/"`. App and helper processes start with the bundle path, so they still match. **Effort S.**

#### L2. A renderer crash triggers an immediate reload, with no limit

**Where:** `app/main.js:150` to `app/main.js:152`.

**What:** **[Certain]** `render-process-gone` calls `win.reload()` at once, every time. **[Likely]** a crash that repeats on load (for example out of memory on a very large profile) loops forever and starts a new renderer process each time.

**Fix:** count crashes in a 60 s window. After 3, stop reloading and show an error in the tray menu or a dialog. This matches the plugin hosts' crash limit. **Effort S.**

#### L3. Deck reconnect enumerates all HID devices synchronously every 4 s

**Where:** `app/main.js:515`, `app/lib/deck.js:28`.

**What:** **[Certain]** while the deck is not connected, `tryConnect` runs every 4 s and calls `HID.devices()`. That call is synchronous and enumerates every HID device on the Mac, on the main thread. **[Certain]** node-hid 3.4.0 ships `HID.devicesAsync()` (`node_modules/node-hid/nodehid.js:243`). **[Guessing]** the cost per call; not measured.

**Fix:** use `devicesAsync()` and back off to 15 s after a minute without a deck. **Effort S.**

#### L4. Every Stream Deck message costs 3 synchronous file calls

**Where:** `app/lib/plugin-host.js:614` (`_log`), `app/lib/streamdeck-plugins.js:297` and `:461`.

**What:**
- **[Certain]** every message in either direction calls `existsSync`, `statSync` and `appendFileSync` on the main thread.
- **[Certain]** measured in `streamdeck.log.1`: 7,990 `setImage` lines in 30.9 minutes, all from `com.t01ik.macoscontrols.sdPlugin` (4.3 per second; 4 contexts at exactly 1 per second). The 1 MB log rotates about every 31 minutes.

**Why:** each call is small, but it repeats 4 times per second for as long as the app runs, on the thread that also handles keys.

**Fix:** keep the size in memory instead of `statSync` per line, and write through one `fs.createWriteStream`. Or log `setImage` at most once per context per minute. **Effort S.**

#### L5. The app picker starts `plutil` + `sips` per installed app

**Where:** `app/renderer/pickers.js:14` (4 at a time), `app/lib/appicon.js:19`, `app/lib/appicon.js:100`.

**What:** **[Certain]** the first open of the app picker resolves an icon for every listed app: 1 `plutil` and 1 `sips` each. Results are cached per session, so this is a burst of about 2 processes per app, not a steady rate. **[Certain]** `sips` links AppKit. **[Guessing]** whether it registers with WindowServer.

**Fix:** **[Likely]** `nativeImage.createThumbnailFromPath(appPath, { width: 196, height: 196 })` returns the app icon in-process on macOS. Check its output size and quality before switching. **Effort S.**

#### L6. Key-press shell commands hold 2 pipes per long-lived child

**Where:** `app/lib/actions.js:65` to `app/lib/actions.js:86`.

**What:** **[Likely]** `runShell` spawns `/bin/sh` with `detached: true` and piped stdout/stderr, then `unref()`s it. A background child (`caffeinate -d &`, a dev server) inherits the pipes, so main keeps 2 file descriptors per launched process until it exits. After the app quits, a child that writes to stdout gets SIGPIPE. Not reproduced in this session.

**Fix:** pipe only stderr, and only until the shell itself exits. Or redirect stdout to `ignore`. **Effort S.**

## 4. Still open from earlier audits

These were re-checked against `04cb983` and are unchanged. They are not counted as new findings.

| Earlier ID | Status in 0.16.2 | Where |
|---|---|---|
| 2026-11-02 M7 (rest) | **[Certain] Open.** The Origin fix landed (`isAllowedWsOrigin` rejects `null`). Registration still has no secret: any local process can claim a known plugin UUID, close the real plugin's socket (`4409 replaced`), and receive its global and action settings. Same-user processes already have that access, so the real boundary is another macOS user on the same Mac. | `app/lib/streamdeck-plugins.js:466` to `:497`, `:481`; `app/lib/plugins.js:186` |
| 2026-11-02 hidseize hot-plug note | **[Certain] Code unchanged; [Guessing] effect.** After the first seize, the helper only waits for its parent (`while (running && getppid() != 1) sleep(1);`). It never seizes a re-plugged deck. Needs a hardware test: unplug, replug, then check whether the firmware fallback types into the front app. | `app/native/hidseize.c:94` |
| 2026-11-02 M1 (rest) | **[Certain] Half fixed.** `install()` now stages the copy before it removes the old folder. `import()` still removes `dest` before `cpSync`, so a failed copy loses the previous copy. | `app/lib/plugin-host.js:570` |

## 5. Checked, no finding

- **[Certain]** Plugin lifetime: the Node watchdog preload, SIGTERM then SIGKILL on shutdown, generation tracking, and the crash limit (gives up after 6 exits in 60 s, backoff 1 to 30 s). `app/lib/plugin-host.js:340` to `:384`, `:630`.
- **[Certain]** The startup orphan sweep matches only `<root>/…` executables or `<runtime> … <root>/…`. `app/lib/orphan-cleanup.js:10`.
- **[Certain]** `hidseize` exits when its parent dies (`getppid() == 1`), so it cannot be orphaned. `app/native/hidseize.c:58`, `:94`.
- **[Certain]** `sysstats` starts `ioreg` at most every 5 s and only in wide-key stats mode. `ioreg` links only IOKit. `app/lib/sysstats.js:47`.
- **[Certain]** Imported profiles: shell commands need confirmation, nested steps are scanned, and `showOutput`/`outputInterval` are removed, so an imported command never runs on a timer. `app/renderer/app.js:682` to `:750`.
- **[Certain]** IPC: every `invoke` handler goes through the resolved-path sender check in `handle()` (`app/ipc.js:26`). The one raw listener, `popChoice` (`ipc.js:979`), is also validated, but differently: it accepts only events whose `sender` is the popup's `webContents`.
- **[Certain]** `ulanzi-image://` serves only validated content-addressed names. `ulanzi-pi://` and `sd-pi://` check both the lexical and the real path. `app/lib/image-protocol.js`, `app/lib/plugin-protocol.js:26`.
- **[Certain]** Archives: entry count, expanded size, unsafe names and a live size monitor that kills `unzip`. **[Likely]** a symlink entry followed by a file under it does not escape: `unzip` wrote the symlink as a placeholder file first and refused the second entry ("exists but is not directory"). The sandbox blocked real symlink creation, so a symlink named like an icon was not tested (Appendix B.6).
- **[Certain]** The marketplace token file is written with mode 0600. `app/lib/market.js:100`.
- **[Certain]** The login-shell PATH probe took 0.15 to 0.18 s on this Mac (1.5 s timeout, SIGKILL on timeout). Not a problem here.

## 6. Fix order

1. **M3** (orphans): smallest change, removes an unbounded leak.
2. **M1** (hidden output keys): one guard in `tick`.
3. **M4** (plugin titles saved to disk): stop writing `key.label` from plugin events.
4. **M5** (timer pushes): one-line swap to `scheduleLivePush(index)`.
5. **L1** (`install.sh`): add `^` to 4 patterns.
6. **M2** (frontmost watcher): `lsappinfo listen`. This needs a parser and a long-lived child, so it is larger than the others.
7. **L2 to L6** when convenient.

Each M fix has one regression check listed with it. None of them needs new dependencies.

## 7. Appendix — method, commands and limits

### A. Method

- Read every process-spawn site (`grep -E "spawn|execFile|exec\(|spawnSync|osascript"`) and every timer (`grep -E "setInterval|setTimeout\("`) in `app/` outside `node_modules`, `dist` and `test`.
- Traced each timer to what it spawns or writes, and whether it stops when the window is hidden or the deck is disconnected.
- Read the live config and the Stream Deck log read-only, to see which paths are active on this Mac.
- Ran only system tools and my own inert scripts. No repo code was executed, no test suite was run, and no file outside the scratchpad was changed.

### B. Commands and results

**B.1 Live config** (read-only, Python `-I`; re-checked against both `config.json` and `config.json.bak`): 3 pages × 13 keys = 39 keys, 1 profile, 0 linked profiles, 0 `showOutput` keys, wide mode clock on all pages (`wideMode` is unset, which defaults to clock). Action types: plugin 25, page 6, url 4, app 2, hotkey 1, pop 1; 0 `text`.

**B.2 Which spawned binaries can talk to WindowServer** (`otool -L`):

| Binary | AppKit / CoreGraphics / ApplicationServices |
|---|---|
| `/usr/bin/osascript` | AppKit, Carbon, ApplicationServices |
| `/usr/bin/lsappinfo` | CoreGraphics, ApplicationServices |
| `/usr/bin/open` | AppKit, ApplicationServices |
| `/usr/bin/sips` | AppKit, CoreGraphics, ApplicationServices |
| `/usr/sbin/ioreg` | none (IOKit only) |
| `/usr/bin/afplay` | none |
| `/bin/sh` | none |

**B.3 Stream Deck log rates** (`streamdeck.log.1`, 22:53:21Z to 23:24:15Z, 7,998 lines): 7,990 `plugin->host setImage` from `com.t01ik.macoscontrols.sdPlugin`, 4 `keyDown`, 4 `keyUp`; 0 `setTitle`, 0 `setSettings`. That is 4.31 `setImage`/s, from three contexts at about 1/s (1,855, 1,855 and 1,854 lines) plus context `0` at about 0.31/s (568 lines).

**B.4 `execFile` timeout and grandchildren** (standalone script, same options as `runCommandOutput`, timeout 1,000 ms):

```
callback after 1008 ms, killed=true, signal=SIGTERM
at 2500 ms, leftover sleep processes: 1
   84913     1 sleep 6
---- pipe-holding variant:
callback after 1007 ms, killed=true, signal=SIGTERM
at 2500 ms, leftover sleep processes: 4
   85004     1 /bin/sh -c (sleep 6; echo late) & sleep 6
   85005     1 sleep 6
   85006 85004 sleep 6
```

The leftovers exited on their own after 6 s.

**B.5 `install.sh` pattern** (inert dummy, `pgrep` only, nothing killed by the pattern):

```
dummy pid=88177: perl -e sleep 15 /Users/eduardo/Applications/Ulanzi Deck Open.app/Contents/Frameworks/editor-open-file.txt
unanchored match (install.sh:32 pattern): 88177
anchored match (^ prefix):
```

**B.6 `unzip` symlink fixture** (inert files in the scratchpad): `pack/link → outside`, then `pack/link/pwned.txt`. Result: `checkdir error: … pack/link exists but is not directory`; nothing was written outside. `symlink error: Permission denied` came from the session sandbox, so the second fixture (a symlink named `icon.png`) is untested.

**B.7 WindowServer ports** (`top -l 1 -pid 83333 -stats ports`, app not running):

| Step | Readings |
|---|---|
| Baseline, 10 s apart | 7,666, 7,686, 7,675, 7,674 |
| After 100 × `lsappinfo front` | 7,675, 7,674, 7,674, 7,675 |
| Before 30 × `osascript -e 'return 1'` | 7,672, 7,693 |
| After | 7,695, 7,674, 7,670 |

The positive control did not rise either. Either this shell's sandbox stops `osascript` from connecting to WindowServer, or a script with no `tell application` does not register as a client. Either way, the `lsappinfo` result proves nothing. To settle M2, repeat B.7 from a normal Terminal, with a positive control that matches the plugins' scripts (`tell application "Amphetamine"` style), and judge over at least 10 minutes as the crash report advises.

### C. Not covered

- No deck was attached: M5 and L3 costs are not measured, and the `hidseize` hot-plug behavior is not tested.
- The renderer was not run, so the M1, M4 and M5 regression checks are proposals, not red tests.
- Third-party plugin code was not reviewed beyond its message rates.
- No dependency advisory check (offline).

### D. Review corrections (2026-11-04, after verification)

The audit was re-checked against `04cb983` and the live machine. These edits were made:

- **B.1** action counts corrected (49 keys / `text 9` → 39 keys / 0 `text`) after
  recounting `config.json` and `config.json.bak`. The "not active here" conclusion
  is unchanged: 0 `showOutput` keys and 0 linked profiles both hold.
- **B.3** `setImage` rate now split by context; the 4.31/s total was already right.
- **§5 IPC** now names the one raw listener (`popChoice`) and its webContents
  identity check, instead of claiming every handler uses `trustedSender()`.
- **M4 fix** notes that `pluginStateTitles` is keyed `${actionid}:${stateIndex}`,
  so a stateless title needs a new key or map rather than a one-line reuse.
- **M5** is now labelled a deliberate trade-off (per the `press.js` comment), and
  the "per second" wording was fixed: 300 builds over 5 minutes, one per second.

Re-verified without change: M1, M2, M3 (orphan reproduced with ppid 1), L1, L2,
L3, L4, L5, L6, the B.2 `otool` table, and the M2 fix syntax
(`lsappinfo listen +becameFrontmost`).
