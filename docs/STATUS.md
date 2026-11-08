# Project status, open items and handoff

Last updated: 2026-11-07 (after v0.16.14).

This is the live status of the app. [`ROADMAP.md`](ROADMAP.md) holds the plan and
shipped history; [`../CHANGELOG.md`](../CHANGELOG.md) holds user-facing notes; this
file holds what is still open, what is verified, and what the next agent should know.

## 1. Current state

| Item | Value |
|---|---|
| Release | **v0.16.14** — https://github.com/edufalcao/ulanzi-deck-open/releases/tag/v0.16.14 |
| `main` | `bda2550` ("Prepare 0.16.14"), tag `v0.16.14` |
| Installed app | `~/Applications/Ulanzi Deck Open.app` — 0.16.14 (local build of the release), ad-hoc signed |
| Tests | **357 total, 355 pass, 2 skipped**; eslint and `tsc --noEmit` clean |
| Deck | Ulanzi D200, firmware 2.0.3, macOS 27.2 (26B123) |
| Release assets | `Ulanzi-Deck-Open-0.16.14.dmg` (248646069 bytes) + `SHA256SUMS.txt`, checksum verified |

### What 0.16.3–0.16.14 changed

- **0.16.14** — a tile owns its title (no hidden fallback to the caption; the
  Caption controls are hidden on tiles; saved tiles adopt the caption on load),
  and Reset colours clears the accent bar and glyph colour together.
- **0.16.13** — one profile `⋯` menu and one Import profile dialog (Studio list
  plus a file picker that detects both formats, a Name field for a new profile,
  Save in the dialog footer), Store header install buttons, centred icon buttons,
  and "Choose a plugin…" clears the key's plugin action. The GUI was checked by
  the owner only for the parts they reported; the Studio ZIP through the new picker
  is untested.
- **0.16.12** — choosing "Choose a plugin…" on a plugin key clears the plugin,
  action and settings (it used to leave the old action on the key).
- **0.16.11** — a plugin is stopped 30 s after its last key is removed
  (`reapIdle` in `lib/plugin-host.js`). Unit-tested; the live check (remove a
  plugin's last key, confirm the plugin and its helper are gone after ~40 s) is
  pending.

- **0.16.10** — hotkey and Type text report a missing Accessibility grant (with
  the remove/re-add hint) instead of failing silently; Electron 45.2.3.

- **0.16.9** — key capture is skipped on macOS 27+ (App tab shows "Not needed on
  macOS 27"); no more `hidseize` polling there. Plugin retry fixes (currency,
  weather) live in their own repos, not in this app.

- **0.16.8** — a failed deck write drops the handle ("Device lost") so the app
  reconnects instead of staying "Connected"; `deck.log` records connects and
  disconnects. Unit-tested; the hardware unplug test of this build is pending.

- **0.16.7** — Type text posts Unicode through the native `hotkey` helper
  (emoji no longer type `aaaa`, no `osascript` per press); README explains the
  Accessibility re-grant after an update.
- **0.16.6** — the lock screen shows only the wallpaper (the drawn clock froze
  while the Mac slept); key capture documented as unavailable on macOS 27.

- **0.16.3** — command-output keys only run while visible; plugin titles no longer
  save the config; command timeout kills the process group; timers push one key
  via `0x0d`; timers keyed by page/slot; `install.sh` patterns anchored.
- **0.16.4** — plugin IPC boundary documented, app data `0600`/`0700`; `hidseize`
  polling re-arm; packaged builds ad-hoc signed.
- **0.16.5** — the audit's main-thread/I/O batch (M2, L2–L6, `import()`
  staging), the key-capture state fix from PR #13, and the Open App icon fix.

The full finding list and code references are in
[`reviews/2026-11-04-process-performance-security-audit.md`](reviews/2026-11-04-process-performance-security-audit.md);
§8 there records the resolution.

## 2. Open items

Priority order for the next session.

### P1 — Key capture / Input Monitoring (the main unresolved product issue)

Key capture (`hidseize`) seizes the deck's keyboard collection so its firmware
fallback cannot type `www.ulanzistudio.com` into the frontmost app. On this Mac it
does **not** work, and the app now reports why:

- With Input Monitoring denied: `access 1` / `manager 0xe00002e2`
  (`kIOReturnNotPermitted`).
- With Input Monitoring granted (as reported in PR #13): `access 0`, then
  `seize 0xe00002c1` (`kIOReturnNotPrivileged`, not `kIOReturnExclusiveAccess`).
  macOS refuses the keyboard seize itself; the PR's unverified hypothesis is that
  it requires root.
- On this machine, TCC never granted the ad-hoc build: macOS shows an entry and a
  toggle, but the helper still logs `access 1`. `tccutil reset ListenEvent` finds
  no bundle-id entry, so the entries are path-based. Removing and re-adding the
  app (and the helper path) did not help.
- The deck's URL fallback does **not** reproduce on firmware 2.0.3 with the app
  running, so the practical impact here is unclear.

**Decision (owner, 2026-11-05): no certificate, so key capture is documented as
unavailable on macOS 27** (README, CHANGELOG). Code and the Grant… button are
unchanged at the time. Superseded 2026-11-05 by option B: after the owner saw no
URL typed with the wide key in TextEdit, the app skips the helper on macOS 27+
(`keyCaptureUnsupported`) and the App tab shows "Not needed on macOS 27". Reopen
only if a Developer ID certificate appears.

What to try next if a certificate appears, in order:

1. **Verify on a Developer ID–signed build.** TCC needs a stable code identity.
   With a real certificate, grant Input Monitoring and check
   `~/Library/Logs/Ulanzi Deck Open/seize.log` for `access 0` and `seized 1`.
   The ad-hoc build's cdhash changes on every rebuild, which is why manual grants
   do not stick.
2. If `seize 0xe00002c1` persists with a real signature, test whether a
   **privileged helper** (SMJobBless / launchd) can seize; if not, document that
   key capture is unavailable on macOS 27 and consider removing the feature and
   the TCC prompt.
3. Do **not** keep fighting TCC with ad-hoc builds; it cannot hold a stable grant.

Acceptance: the log shows `access 0` and `seized 1`, and after unplug/replug it
shows `released` then `seized 1`, with no URL typed into a focused text field.

### P2 — Hardware and GUI acceptance

**Passed 2026-11-05 on the installed 0.16.5 build (owner-observed, no log
evidence):** key capture row and state text, Grant… only for the permission
state, profile follows the front app, keys work after unplug/replug, app picker
thumbnails. Still open from this list: lock/unlock/sleep, helper crash/restart,
HID error paths, clean-machine DMG.

Original checklist:

The 0.16.5 gate was green on unit tests, but these were not re-confirmed after
the final build:

- **Key capture tab:** Deck settings → App, with the correct state text and the
  Grant… button only for the permission state.
- **Frontmost profile switching:** link a profile to an app, switch apps, and
  confirm the profile follows within ~3 s. The watcher is unit-tested; the
  installed config had no linked profile, so it was not observed.
- **Deck replug:** unplug/replug and confirm keys still work with the async HID
  and 15 s backoff.
- **App picker thumbnails:** visual quality of the in-process thumbnail versus
  the old `sips` output.
- **Timer on the deck:** verified at 0.16.3, including across a page change.

Other hardware work for 1.0: lock/unlock/sleep, helper crash/restart, HID error
paths, and a clean-machine DMG install.

### P3 — Packaging and TCC stability

- The app is **ad-hoc signed** (`scripts/after-package.sh`). `codesign` gives it
  a real identity, but the cdhash changes every build, so Input Monitoring must
  be removed and re-added after each update. Documented in the README.
- The DMG is **not notarized**; Gatekeeper on another Mac may require
  right-click → Open. A Developer ID + notarization is the fix if the app is
  distributed more widely.
- TCC may show duplicate “Ulanzi Deck Open” entries from earlier builds. Remove
  the stale ones before granting.

### P4 — Security decisions already made

- **Plugin WebSocket has no per-plugin secret.** Any local process that knows a
  plugin UUID can register as it, read its settings and replace its socket. The
  practical boundary is another macOS user on the same Mac; a token in argv is
  readable and a Unix socket would break third-party plugins. Decision: document
  the boundary and keep app data owner-only. Revisit only if the threat model
  changes (multi-user Mac, untrusted local software).
- **`config.json`, `.bak` and the data directory are `0600`/`0700`.** The plugin
  settings file and market token are already `0600`.
- **`hidseize` re-arm** is implemented (`aefd21c`): after a replug it returns to
  polling and seizes the new device. Code-verified only; blocked by P1.

### P5 — Upstream and third-party

- **Meet Mute** (`com.fredemmott.micmutetoggle`): **fixed upstream in v1.0.4**
  (2026-11-05). The author replied to the direct message and replaced the
  per-poll `osascript` with one long-lived JXA helper. Installed on page 1;
  a 60 s sample (6 reads, 10 s apart) showed one `osascript -l JavaScript`
  process and WindowServer ports flat (12,441–12,453). Not yet re-measured over
  a long idle period or a call. The `callPoll`/`idlePoll` workaround is no
  longer needed.
- **Amphetamine:** a built-in native action was considered and **dropped**; the
  noisy plugin is not in current use. Revisit only if it returns.

### P6 — Machine state

- **WindowServer port growth — cause found and fixed (2026-11-06).**
  `app/scripts/port-monitor.sh` logs the WindowServer port count and short-lived
  programs every minute to `~/Library/Logs/Ulanzi Deck Open/port-monitor.log`.
  Ports per minute: app closed +0.9; app open with the old config +7.7 to +8.5
  (window visible or closed makes no difference); empty config about 0; page 1
  only +7.4; page 1 without Claude usage and Codex limits +2.1; Claude usage and
  Codex limits only +7.5; Claude usage only: no growth. Cause: the **Codex limits
  plugin** (`com.ulanzi.codexLimits`, our fork in `~/Projects/.../ulanzi-codex`).
  Each refresh of each key ran `npm`/`npx`/`pnpm` lookups even with `codex` on PATH,
  `codex login status` and a new `codex app-server`; with `refreshMinutes: 3` and two
  keys the ports jumped +20 to +157 every 3 minutes. Fix in plugin 1.1.2 (commit
  `69ac518` in `ulanzi-codex`): lazy command lookup, cached lookup and login
  (30 min), one shared `codex app-server` for keys refreshing together. On the full
  profile: old code +12.9/min (six jumps), new code −1.3/min (no jumps over four
  cycles). Page 2 with the new plugin, mac left alone, 18:32 to 18:46: +0.5/min
  excluding one macOS-caused step (+203/−103 with `SetStoreUpdateService`). Page 3 (macOS Controls monitor
  keys), 20:19 to 20:33: fit +2.7/min, median step −2, steps tied to other apps (cmux,
  Quick Look); no 3-minute rhythm, no repeated `MacControls` starts. One run per condition. `codex app-server` still starts once per refresh
  and runs its own `git` checks, which the plugin cannot change.
- The earlier Meet Mute / Amphetamine `osascript` leak (about 25 to 29 a minute)
  is fixed upstream and is gone.
- No DNS in the agent shell on 2026-11-04; DNS worked again after the reboot on
  2026-11-06.

## 3. Known limitations and gaps

- **Ad-hoc signing / TCC** as above.
- **Key capture unavailable on macOS 27** until P1 is resolved.
- **Single deck, macOS-focused.** The native helpers (`hidseize`, `mediakey`,
  `hotkey`) are macOS-only; plugin folders are otherwise platform-aware.
- **Timers are keyed by page/slot.** Moving a key to another slot while its timer
  runs leaves the old timer running invisibly and starts fresh on the new slot.
  Rare; acceptable unless it bites.
- **Log rotation** renames the file while appending; on macOS this is safe. The
  sink tracks size in memory, so an external truncation is not noticed until the
  next size threshold.
- **Frontmost watcher** treats any `lsappinfo listen` output as “changed” and
  re-resolves; if the child exits, the renderer's poll falls back to the old
  two-process lookup. It is not a parser of the payload by design.
- **Renderer modules (3.3)** remain optional and the highest-risk refactor; not
  started.
- **Unimplemented platform features:** firmware update, Python plugins,
  multi-device (D200X / Dial / AU05), OBS Studio actions.
- **Dependency advisories (`npm audit`, 2026-11-05):** 0 in production
  dependencies (`--omit=dev`), and none for `electron@45.2.1`. 7 moderate in dev
  tooling only: `glob` (GHSA-3g3m-2fjr-6pw4) and `minimatch` (GHSA-g3hv-75wg-m249)
  via `@electron/packager` and `eslint`. They run at build/lint time on our own
  files, not in the shipped app. `npm audit fix --force` proposes *downgrades*
  (`@electron/packager@18`, `eslint@9`), so it is not applied. Wait for upstream
  releases and re-run before 1.0.

## 4. Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-11-04 | Plugin WebSocket stays unauthenticated; document the same-user boundary, make app data owner-only | A secret cannot be kept from the same user; Unix sockets break third-party plugins |
| 2026-11-04 | `hidseize` uses a polling re-arm, not IOHID callbacks | Smaller C change; hardware test remains the gate |
| 2026-11-04 | Drop the built-in Amphetamine action | The plugin is not in current use |
| 2026-11-04 | Ad-hoc sign every packaged build | TCC had no code identity at all before; still unstable across builds |
| 2026-11-04 | Ship the `hidseize` re-arm as code-verified despite the blocked hardware test | It is a strict improvement and the fallback no longer reproduces here |
| 2026-11-04 | Timers keyed by page/slot instead of the action object | The inspector replaces `key.action`; the countdown must follow the slot |
| 2026-11-05 | Document key capture as unavailable on macOS 27 (docs only, code and Grant… unchanged) | No Developer ID certificate (0 signing identities); ad-hoc builds cannot hold a TCC grant; the kernel refused the seize even with a grant (PR #13); the URL fallback does not reproduce on firmware 2.0.3. Retest only with a Developer ID build |
| 2026-11-06 | Rebrand parked (owner). If revived: drop "Ulanzi" from the app name (trademark risk), rename together with the 1.0.0 Developer ID signing, migrate `~/Library/Application Support/Ulanzi Deck Open`. GitHub/npm check found no exact-name repo for DeckOpen, Deckable, Padwright; avoid OpenDeck, ODeck, UDeck, MacroDeck. Trademark and domain search not done | Name "Ulanzi Deck Open" starts with Ulanzi's brand; bundle ID changes reset permissions anyway |
| 2026-11-07 | Owner adopted all Ulanzi plugins into `~/Library/Application Support/Ulanzi Deck Open/Plugins` and deleted `~/Library/Application Support/Ulanzi` (Ulanzi Studio data). Plugin installs for the agent now go to the app folder, not the Studio folder | The app's copy wins over the Studio copy, so an rsync into the old folder would be ignored silently. The Studio profile list in Import profile is now empty; `~/Library/Application Support/UlanziDeck` is not Studio's, it holds the Currency plugin's rate history |
| 2026-11-05 | Merge PR #13 (key-capture state + App tab) | `0xe00002c1` is `kIOReturnNotPrivileged`; the old text misdiagnosed it |

## 5. Environment and tooling (agent shell)

- **No DNS.** Start `python3 /tmp/ulanzi-github-proxy.py` in the background and
  use `HTTPS_PROXY=http://127.0.0.1:8899` (plus `HTTP_PROXY`, `SSL_CERT_FILE`)
  for GitHub/`gh`. Stop it when done.
- **GUI apps cannot be launched from the agent shell** (`kLSNoExecutableErr`).
  The owner opens the app from Finder/Spotlight.
- **`hdiutil attach/create` fails** with "Device not configured";
  `makehybrid` + `convert` works.
- **`pgrep`/`pkill` are unreliable**; use `ps` + `kill`.
- **Packaging:** `npm run package:all -- --electron-zip-dir=/tmp` (cached Electron
  zips in `/tmp`). `after-package.sh` copies helpers and ad-hoc signs.
- **Release:** tag `vX.Y.Z`, push `main` and the tag; CI (`419…`) and the
  “Unsigned DMG” workflow publish the release. Verify `SHA256SUMS.txt`.
- **Screenshots:** `ULANZI_NO_DECK=1 ULANZI_SIZE=1600x900 ULANZI_SHOT=…`.
- **Port sampling:** `top -pid <WindowServer> -stats pid,ports` prints a `+`/`-`
  suffix; strip it before parsing.
- **`lsappinfo front` returns `[ NULL ]`** without an Aqua session, so the
  frontmost watcher cannot be observed from the agent shell.

## 6. Repository map

| Path | What |
|---|---|
| `app/main.js` | Window, tray, deck lifecycle, helper spawn, crash guard |
| `app/ipc.js` | IPC handlers, image/plugin protocols, frontmost cache |
| `app/lib/plugin-host.js` | Plugin discovery, WebSocket server, spawn, settings, install/import |
| `app/lib/plugins.js`, `streamdeck-plugins.js` | Ulanzi and Stream Deck protocol adapters |
| `app/lib/orphan-cleanup.js`, `plugin-dirs.js` | Startup orphan sweep and shared roots |
| `app/lib/actions.js` | Key actions, command output, shell pipes |
| `app/lib/deck.js` | HID protocol, page/key pushes, clock/stats |
| `app/native/hidseize.c` | Keyboard seize helper (see P1) |
| `app/renderer/` | Editor UI (classic scripts; `app.js`, `ui.js`, `press.js`, `pickers.js`) |
| `app/test/` | 338 node:test cases; renderer tests use vm slices |
| `docs/reviews/` | Audits (2026-11-01/02/04) |
| `docs/CRASH-REPORT-ANALYSIS-20261104.md` | WindowServer/osascript evidence |

## 7. How to work

1. Read this file, [`ROADMAP.md`](ROADMAP.md) and the latest
   [`CHANGELOG.md`](../CHANGELOG.md).
2. Test-first for fixes; one commit per finding; run `npm test`, `npm run lint`
   and `npm run typecheck` from `app/`.
3. Do not modify files in the installed third-party plugin folders
   (the app's `Plugins` and `StreamDeckPlugins` folders, `com.fredemmott.micmutetoggle`, …).
   Plugin installs are done by the owner with `rsync -a` into the app's `Plugins` folder.
4. Ask before long A/B measurements, new features, or cutting a release/tag.
5. Prefer evidence over claims: a log line or a red test, not “looks fine”.

## 8. Next three actions

**1.0.0 is parked (owner, 2026-11-06).** The 0.16.x line stays the current line.
Plan when revived (decision of 2026-11-05): make 1.0.0 the first Developer ID +
notarized release.

1. Get an Apple Developer account, then sign (hardened runtime + Electron
   entitlements, helpers first), notarize and staple in CI. Ask before adding
   credentials or changing the release flow. This also reopens P1 (key capture).
2. Install 0.16.8 and unplug the deck once; `deck.log` should show `offline`
   then `connected`.
3. Hardware matrix, 2026-11-05 (owner-observed): lock/unlock passed (wallpaper
   only, wide key keeps the clock); sleep passed for a short sleep (a long sleep
   was not tried); replug passed; `hidseize` kill/respawn passed (new pid, app
   kept running). **Not done:** clean-machine DMG install, long sleep.
4. Then bump to 1.0.0 and tag.
