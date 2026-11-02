# Ulanzi Deck Open — maximum-effort test coverage audit

**Repository:** `/Users/eduardo/Projects/Personal/Repositories/ulanzi-deck-open`  
**Revision:** `1427323` (Release 0.11.0), clean working tree  
**Analysis only:** no files were modified or committed.  
**Environment:** Node `v22.14.0`, macOS arm64.

---

## 1. Executive summary

The suite is green and fast, but it mostly exercises pure library helpers. The headline coverage number is misleading:

| Measure | Result |
|---|---:|
| `npm test` | **126 pass, 0 fail, 0 skipped**, ~846 ms |
| Built-in coverage, all loaded files including tests | **71.29% lines / 72.07% branches / 64.75% functions** |
| Built-in coverage, production modules it actually loaded (6,223 lines) | **60.65% lines / 61.77% branches / 54.63% functions** |
| Effective line coverage of the whole app (15,512 source lines) | **~24.3%** |

**Why the effective number is so low:** 9,289 production lines are never loaded by any test:

- `renderer/*.js`: **7,608 lines**, 0% exercised.
- `main.js`, `plugin-hosts.js`, `preload.js`, `pop-preload.js`: **976 lines**, 0% exercised.
- `lib/market.js` (308), `lib/deck.js` (255), `lib/pi-themes.js` (105), `lib/html-window.js` (37): never required.

The highest-risk gaps are exactly where regressions have happened before:

1. **IPC handlers:** only 3 of 62 handlers are exercised; function coverage is 10.26%. Only `config:save` is tested for untrusted-sender rejection.
2. **Renderer input and rendering:** `press.js`, `render.js`, `inspector.js`, `ui.js`, `app.js` — including the 0.11 typography work — have no tests at all.
3. **Plugin protocol and lifecycle breadth:** registration, inspectors, settings replay, queue flush, install-from-ZIP, reload/remove/import failure paths, and crash policy are largely untested. Extremely few tests drive public APIs; several seed internal `Map`s directly.
4. **Deck and market:** `lib/deck.js` and `lib/market.js` have 0% coverage despite owning HID framing and credential-bearing store requests.
5. **Test quality:** one regression test can pass vacuously (`audit-regressions` import-consent case), and several tests depend on 20–400 ms sleeps, source-string slicing, or direct internal-state injection.

**Top P0 work:** build an all-handler IPC contract/security test, drive both plugin `_onConnection` protocol machines with a fake WebSocket, test `import:apply`, add renderer key/press and canvas-typography tests, add adversarial archive tests, and add a fake-HID `Deck` test.

---

## 2. Method and coverage caveats

Commands run:

```bash
cd app
npm test
node --version                                      # v22.14.0
node --test --experimental-test-coverage "test/*.test.js"
node --test --experimental-test-coverage \
  --test-coverage-include='**/*.js' \
  --test-coverage-exclude='node_modules/**' \
  --test-coverage-exclude='dist/**' \
  --test-coverage-exclude='build/**' \
  --test-coverage-exclude='test/**' \
  --test-coverage-exclude='scripts/**' \
  "test/*.test.js"
npm run lint
npm run typecheck
```

Both lint and typecheck pass.

**Important built-in-coverage limitation:** Node 22.14’s `--experimental-test-coverage` reports only modules that were loaded. `--test-coverage-include` accepted a broad glob but did **not** add unloaded files. `main.js`, `plugin-hosts.js`, `preload.js`, all renderer files, `market.js`, `deck.js`, `pi-themes.js`, and `html-window.js` were absent from the report. Therefore:

- The built-in report’s “all files 71.29%” includes the test files themselves at ~100%, which inflates it.
- It is not a measure of application coverage.
- For a truthful per-file report including unloaded files, use `c8 --all` (currently not installed) or a small V8-coverage collector. Built-in coverage is still useful as a fast, dependency-free signal.

The suite creates **33 new `ulanzi-*` temp directories per run** and does not clean them up; 6,493 had already accumulated before the measured run. This is a real test-hygiene issue.

---

## 3. Coverage results

### 3.1 Per-file coverage

Production modules that the built-in runner actually loaded:

| Module | Lines | Line % | Branch % | Funcs % | Assessment |
|---|---:|---:|---:|---:|---|
| `ipc.js` | 1,003 | **29.61** | 57.14 | **10.26** | 62 handlers; 3 exercised |
| `lib/streamdeck-plugins.js` | 1,022 | **45.11** | 48.95 | 56.36 | Protocol and sync mostly untested |
| `lib/plugins.js` | 567 | **40.74** | 37.50 | 48.39 | Ulanzi connection/message paths untested |
| `lib/plugin-host.js` | 665 | **72.48** | 66.94 | 52.73 | Lifecycle seams only |
| `lib/import-ulanzi.js` | 507 | **65.88** | 53.52 | 63.16 | One simple profile only |
| `lib/actions.js` | 266 | **40.98** | 50.00 | 31.82 | Only shell-command path |
| `lib/appicon.js` | 114 | **22.81** | 100.00 | **0.00** | No function exercised |
| `lib/siteicon.js` | 182 | **62.64** | 74.55 | 66.67 | Block-list only |
| `lib/sysstats.js` | 93 | **29.03** | 100.00 | **0.00** | No function exercised |
| `lib/store.js` | 590 | **94.07** | 77.25 | 79.25 | Strongest module |
| `lib/archive.js` | 211 | **86.73** | 64.58 | 87.50 | Central-directory limits only |
| `lib/sdcatalog.js` | 133 | **79.70** | 45.16 | 66.67 | No real resolve/download |
| `lib/pi-theme.js` | 103 | **91.26** | 66.67 | 100.00 | String injection only |
| `lib/protocol.js` | 62 | **91.94** | 84.62 | 75.00 | Good framing coverage |
| `lib/plugin-protocol.js` | 39 | **94.87** | 83.33 | 66.67 | Good path coverage |
| `lib/updates.js` | 63 | **100.00** | **54.17** | 80.00 | Fetch only, no scheduler |
| `lib/page.js` | 58 | **100.00** | 66.67 | 100.00 | Only wide-slot scenario |
| `lib/text-style.js` | 100 | **99.00** | 90.91 | 100.00 | Pure-function coverage |
| `lib/version.js` | 40 | **95.00** | 86.36 | 100.00 | Good |
| `lib/actions-meta.js` | 100 | 99.00 | 85.71 | 100.00 | Data consistency |
| `lib/geometry.js` | 21 | 95.24 | 75.00 | 100.00 | Constants only |
| `lib/http.js` | 40 | 100.00 | 93.75 | 100.00 | Good |
| `lib/iconpacks.js` | 26 | 100.00 | 83.33 | 100.00 | Lexical containment only |
| `lib/mime.js` | 59 | 100.00 | 80.00 | 100.00 | Table lookup |
| `lib/paths.js` | 15 | 100.00 | 100.00 | 100.00 | Good |
| `lib/channels.js` | 93 | 100.00 | 100.00 | 100.00 | Constants only |
| `lib/constants.js` | 21 | 100.00 | 100.00 | 100.00 | Constants only |

Never loaded by tests:

| Module | Lines | Effective coverage |
|---|---:|---:|
| `renderer/*.js` | 7,608 | 0% |
| `main.js` | 692 | 0% |
| `plugin-hosts.js` | 181 | 0% |
| `preload.js` | 95 | 0% |
| `pop-preload.js` | 8 | 0% |
| `lib/market.js` | 308 | 0% |
| `lib/deck.js` | 255 | 0% |
| `lib/pi-themes.js` | 105 | 0% |
| `lib/html-window.js` | 37 | 0% |

### 3.2 Largest absolute blind spots

Approximate uncovered lines from the coverage report:

| Rank | Module | Uncovered lines | Why it matters |
|---:|---|---:|---|
| 1 | `ipc.js` | ~706 | 59 of 62 handlers unexercised; import/apply, POP, icon installs, plugin install dialogs, store, profile export/import |
| 2 | `streamdeck-plugins.js` | ~561 | registration, PI messages, image/title/state, settings, sync, key events |
| 3 | `plugins.js` | ~336 | Ulanzi WebSocket ownership, settings, sync, run, state images, open URLs |
| 4 | `plugin-host.js` | ~183 | server startup/port fallback, install/import/remove, logging, shutdown paths |
| 5 | `import-ulanzi.js` | ~173 | ZIP preview, profile discovery, image budget, folder/multi-state/font export |
| 6 | `actions.js` | ~157 | hotkey, app/url/text/close, sound, media |
| 7 | `appicon.js` | ~88 | all app-icon extraction |
| 8 | `siteicon.js` | ~68 | redirects, DNS, icon discovery |
| 9 | `sysstats.js` | ~66 | CPU/memory/GPU sampling |
| 10 | `store.js` | ~35 | state/pinned image handling and error branches |

### 3.3 Specific uncovered line ranges worth knowing

- `ipc.js:463-498` — plugin SDK detection; `:500-550` — install consent/dialogs; `:658-764` — `import:apply`; `:846-881` — profile export/import; `:885-979` — POP window.
- `lib/plugins.js:167-225` — `_onConnection`; `:229-279` — settings/inspector URL; `:312-411` — sync/run; `:421-562` — plugin messages/state/open URL.
- `lib/streamdeck-plugins.js:452-600` — connection registration and PI messages; `:602-733` — plugin events; `:746-810` — settings/images/inspector; `:840-965` — sync/key; `:990-1015` — inspector URL/connect.
- `lib/plugin-host.js:218-256` — server/port fallback; `:504-585` — install/import/remove; `:591-624` — logging.
- `lib/import-ulanzi.js:263-346` — profile discovery and ZIP extraction; `:480-498` — preview.
- `lib/archive.js:53-54` — archive-size cap; `:75-92` — ZIP64/invalid directory; `:117-120` — unzip failure; `:172-181` — runtime expanded-size monitor.
- `lib/store.js:386-387` — state-icon slots; `:445-446` — missing image recovery; `:550-558` — prune error paths.
- `lib/sysstats.js` — all sampling functions.
- `lib/appicon.js` — all functions.

---

## 4. Test inventory: what each file actually proves

| Test file (tests, approx ms) | What it genuinely proves | What it only appears to prove / weak point |
|---|---:|---|---|
| `actions.test.js` (2, 846) | A failing `/bin/sh` command eventually calls the shell error handler; success does not, after a 400 ms wall-clock wait. | Nothing about hotkey/app/url/text/close/sound/media actions, argument construction, timeouts, or spawn failures. The 400 ms sleeps dominate suite time. |
| `archive.test.js` (5, 75) | Central-directory parsing, entry count/expanded-size/path limits, simple extraction, one-entry read. | Does not prove the runtime expanded-size monitor, ZIP64 rejection, unzip failure, truncation, symlink entries, or archive-size cap. |
| `audit-regressions.test.js` (25, 117) | Valuable regression specs for profile round trip, import shorthand, malformed pages, backup images, self-install, port/shutdown, stale exits, crash history, WS origins, global settings, nested plugin collection, source bounds, volume zero, cache reset, log redaction, PI retry. | Several cases seed `generations`/`sockets`/`restarting` directly and call private `_onChildExit`; they prove internal logic, not the public reload/restart flow. Renderer cases slice source by function name. The import-consent case can pass vacuously (see §5). |
| `channels.test.js` (3, 28) | Preload/pop-preload literal channel names exist in `lib/channels.js`; `handle(CH.x` appears in `ipc.js`. | Does not execute the preload or any handler, does not validate `send` channels, return shapes, or sender checks. Regex-only. |
| `http.test.js` (3, 41) | `readCapped` honours declared and streamed limits. | No abort/error/cancel propagation or non-Response body shape. |
| `iconpacks.test.js` (4, 29) | Lexical containment of pack names; id scopes; combined traversal pair. | No symlink/realpath containment; no IPC install/list/read/remove flow. |
| `import.test.js` (4, 44) | Basic hotkey conversion, system/page/plugin mapping, POP cap, one profile directory with keypad slots and wide-key skip. | Most of `import-ulanzi`: ZIP preview, `#Version: 2`, profile discovery, images/budget, fonts/colors, multi-state, folder parents, multimedia, sound, unknown preservation. |
| `ipc-harness.test.js` (3, 71) | A fake Electron harness can register IPC; every literal `invoke` in preload has a handler; `config:save` rejects one untrusted sender without saving; lazy `getWin` dialog; real SD install with fake download and temp cleanup. | Name says “refuses untrusted senders” but only `config:save` is tested. HTTP/array/string handler return shapes, other 58 handlers, consent paths and dialog ownership are untested. Preload is read as a regex, not executed. |
| `page.test.js` (1, 48) | Wide-slot `SmallViewMode`, blank image, clock/no image, default fallback. | Normal key slots, content-addressed dedupe, empty image arrays, manifest shape, compression/performance. |
| `paths.test.js` (3, 27) | `isInside` rejects root, siblings, traversal. | No symlink realpath behavior. |
| `plugin-host.test.js` (2, 44) | Shutdown sends SIGTERM then SIGKILL after a 10 ms timeout for a fake child; `reloadOne` removes only one plugin’s actions/child. | The fake child’s `once()` is a no-op; the test proves the timeout branch, not graceful exit. No server, queue, install, crash or protocol. |
| `plugin-protocol.test.js` (4, 45) | Serves files with MIME, transforms HTML only, rejects traversal, 404s unknown folders. | Missing file/directory, HEAD/range, malformed percent encoding, symlink escape, transform error. |
| `plugin-view.test.js` (3, 29) | Query params stay separate from filename; merge query; reject outside root. | No URL-decoding/encoded traversal, hash-only, absolute path, or empty-file edge. |
| `plugins.test.js` (6, 92) | Folder install, invalid UUID rejection, missing manifest rejection, select-dialog reply/cancel, `_replay` uses action UUID. | No `readPlugin`, connection protocol, settings, inspector URL, sync, run, state messages, open URL, HTML plugin. Select-dialog tests use 20 ms sleeps. |
| `protocol.test.js` (5, 30) | MAGIC/header/length, 1024 padding, 1025-byte report split, decode, garbage rejection. | No `clockPayload`, no max length/allocation behavior. |
| `sdcatalog.test.js` (6, 32) | Version normalization/comparison, update orchestration with stubbed `list`/`release`, catalogue refresh clearing releases. | No real HTTP, catalogue validation, `resolve`, `download`, HTTPS-only, size caps, missing assets, release cache behavior. |
| `shared-meta.test.js` (6, 34) | Metadata consistency: labels/groups/step sets/media labels. | Data-shape checks, not behaviour. High coverage, low regression value per added test. |
| `siteicon.test.js` (4, 33) | Private/loopback/link-local IP and host block list; loopback URL refused before request. | DNS resolution, redirect re-checking, HTML `<link rel=icon>` parsing, image size/type, root fallback. |
| `store.test.js` (21, 161) | Default config, POP/toggle caps, delay zero, fonts/text styles, icon-cleared/face, wide mode, image pruning, parent cycles, migration, corrupt backup, file-backed images, default pages, pinned/standby backgrounds, malformed validation, recovery one-shot/reset. | State icons, pinned/lock images in some branches, missing image files, save failure, settings clamps, `file:` traversal, duplicate IDs, version bump save. No temp cleanup. |
| `streamdeck.test.js` (4, 85) | Scan/install a basic `.sdPlugin`; `_ensurePlugin` dedupes when the port is already resolved; Intel-only Rosetta detection on arm64; empty `setImage` restores default. | The “several actions sync” test does not call `sync`. Protocol registration, PI, sync, key, settings, HTML and manifest overrides are untested. Rosetta test is skipped on CI’s x64 Ubuntu. |
| `text-style.test.js` (3, 28) | Pure weight/family/colour/background normalization. | No rendering; does not prove the renderer uses the normalized values. |
| `ui-copy.test.js` (1, 28) | `prettyHotkey` via a source slice from `HOTKEY_GLYPHS` to `HOTKEY_CATEGORIES`. | Brittle source-string slicing; no key-capture, modifier state, `saveHotkey`, or inspector wiring. |
| `updates.test.js` (4, 37) | Latest release request, 404 null, 500 throw, DMG selection, notes flattening/truncation. | No malformed JSON, missing tag, abort timeout, absent asset, scheduler, notification dedupe. |
| `version.test.js` (4, 29) | Numeric comparison, trailing zeros, pre-release, normalize `v`. | Good. |

---

## 5. Highest-risk untested or weakly tested behaviour

| Area | Current evidence | Highest-risk gaps |
|---|---|---|
| **Plugin lifecycle / socket ownership** | `plugin-host.test.js` (shutdown, reloadOne); several `audit-regressions` cases for generations, stale exits, crash cap, port failure, shutdown. | `start()` and 20-port EADDRINUSE fallback; actual `verifyClient` handshake; `_send` queue + `_flushQueue`; `_onConnection` for both SDKs; registration replacement (SD 4409); global settings replay; inspector registration; `_noteConnected` stable window; crash backoff timing; `htmlExited`; HTML restart; retired-child shutdown. Generation tests often seed Maps directly. |
| **Plugin install / reload** | One folder install; one self-install preservation; one SD store ZIP install. | Ulanzi ZIP install and failed-extraction cleanup; staging rollback when copy fails; install of an already-managed folder; read-only `import`/`remove`; destination traversal; reinstall over an existing plugin; manifest overrides (`manifest.mac.json`/`macos.json`); `mergePatch`; `_codeFor` target/Wine/HTML selection; `findPluginRoot` depth; `reloadOne` rescan/restart. |
| **Archive extraction / limits** | Entry count, central-directory expanded size, basic extraction, one-entry read. | Archive-size cap; ZIP64; truncated EOCD; invalid directory offset/size; absolute/Windows/backslash paths; NUL names; symlink entries and post-extraction realpath containment; real `unzip` failure/timeout; runtime expanded-byte monitor; exactly-at-limit boundaries; `readZipEntry` maxBuffer. |
| **IPC sender paths / dialogs** | `config:save` untrusted denial; lazy `getWin` for one dialog; SD store install; one install-folder cancel. | 59 other handlers; default-deny across all channels; handler return shapes; trusted-but-malformed args; `import:apply`; `profile:export/import` size/format; icon-pack install/read/remove; plugin install consent accept/decline; `looksLikeStreamDeckPlugin`; POP lifecycle; app list/icon/frontmost; site icon; update state; `setLoginItem`; accessibility. `trustedSender` lacks `file:` traversal/query/symlink cases. |
| **Deck push / timers / standby** | Deck: **0%**. Renderer standby/lock/timer/push: **0%**. | HID connect/open error text; frame splitting and writes; brightness/sleep clamping; wide-mode clock intervals (5 s / 1 s / 60 s / 0); clock/stats/blank payloads; report-id stripping and key-event parsing; device-info merge; disconnect cleanup. Renderer: `scheduleStandby`, `enterStandby`, 30 s refresh, first-press swallow, `exitStandby`, lock screen, `scheduleAutoExit`, timer countdown/beep, `schedulePush`/`scheduleLivePush` coalescing, `pushNow` reentrancy and `pushAgain`. |
| **POP / hotkeys** | `prettyHotkey` only. | `ipc.pop:show`: item sanitization, second-press toggle, browser window geometry, focus/blur, 15 s timeout, choice listener verification, previous-app restore. `pop.js`: keyboard navigation, Enter/Space, Escape, empty items. `hotkeys.js`: `physicalKeyToken`, `hotkeyCombo`, modifier state, `handleHotkeyKey`, `saveHotkey`; inspector hotkey buttons. |
| **Store migrations / recovery / images** | Strong: migration, backup, corrupt file, pruning, text styles, pinned/standby/background images, source bounds, zero volume. | State icons and pinned icons in `_imageSlots`; missing `file:` image becomes null; basename traversal; lock images; SVG/GIF/WebP MIME; duplicate hash dedupe; save/backup failure; version bump save; `activePage()` fallback; settings clamps (brightness, standby, update hours); invalid pinned slots/states/holdMs; duplicate page IDs. No cleanup of temp dirs. |
| **Profile import / export** | Own-format round trip: icon, wideMode, autoExit, font, textStyle. Import-ulanzi: one simple page. Command consent shorthand: weak (below). | Own format: pinned keys, profile background/appPath/appName, page background, hold/double actions, nested plugin `actionid` remap, duplicate names, invalid payloads, `format` mismatch, 128 MB limit. `import:apply`: new/merge/replace, collision remap, parent/goto remap, page-name dedupe, cleanup. Import-ulanzi: `#Version: 2` ZIPs, `previewProfile`, `listProfiles`, folder parents, multi-state views, fonts/colours, multimedia, sound, images/budget, page limit, missing manifest warnings, `sourceAction` preservation. |
| **Market / catalogue / updates** | Catalogue update orchestration with stubs; updater HTTP fetch/notes. | `market.js` **0%**: login token persistence/permissions, vendor-only token header, redirect token stripping, cross-origin credential POST rejection, HTTPS every hop, response caps, JSON error codes, categories, list normalization, `checkFile`, `resource`, ZIP-signature download. Catalogue: list validation/caching, `resolve`, `download` HTTPS and size, missing asset, release-cache expiry. Updater: malformed JSON, missing version, timeout, no DMG, scheduler, notification dedupe, re-enable path. |
| **Renderer canvas text styles / inspector wiring** | `text-style.js` only; no renderer file loaded. | `drawKey`: key text family/weight/colour, caption family/weight/size/align/background, emoji-only sizing, auto-shrink, caption suppression over live images and `captionExplicit`, icon/text face, indicator dots, badges, page background slices, imported/missing badges, blank plus. `drawSystemPanel` clock/stats/blank; standby slice generation. `inspector.js`: every `#insp-text-*`, `#insp-font-*`, `#insp-font-show`, face tabs, drag/drop, action-type switching, trigger controls, page settings, multi-step editor. A broken selector currently fails silently. |

### Two concrete weak-test findings worth fixing immediately

1. **`audit-regressions.test.js:105-138` can pass without asserting the behaviour in its name.**  
   It imports with `confirm: () => false`, then only checks commands **if `saved` is true**. The coverage report confirms lines `130-136` are never executed. If import silently did nothing, the test would still pass. Add `assert.equal(saved, false)`, plus an affirmative-consent case that asserts commands are marked `imported` and survive save/load.

2. **`streamdeck.test.js:67-89` overstates its name.**  
   “launches a plugin once when several actions sync before the port resolves” actually calls `_ensurePlugin()` twice. It never calls `sync()`. Rename to “ensurePlugin dedupes simultaneous launches” or rewrite it to call `sync()` twice with fake actions.

### Latent untested logic worth a test even before refactoring

These are code-reading observations, not claims of current user-visible failure:

- `lib/import-ulanzi.js:247-253` — the image-budget error is thrown inside the same `try` whose `catch` swallows it. Exceeding 64 MB does not surface the intended error; it silently skips images. No test.
- `lib/import-ulanzi.js:440-442` — `if (mapped.action.type === 'plugin' && !mapped.action.plugin)` can never be true for a mapped plugin, so `missingPlugins` reporting is effectively dead. No test.
- `lib/import-ulanzi.js:322` — `fs.readFileSync(file, {encoding:'latin1'}).slice(0,12)` reads the whole profile file just to inspect 12 bytes, up to the 256 MB cap. No test/benchmark.
- `lib/archive.js` — symlink entries are not rejected; extracted symlinks could point outside the destination. The lexical `isSafeEntry` check does not inspect external attributes. No test.
- `lib/sdcatalog.js:120` — `download()` uses `redirect: 'follow'` and only checks the initial HTTPS URL; a redirect to HTTP can downgrade the package download. No test.
- `lib/plugin-protocol.js` / `lib/plugin-view.js` — containment is lexical (`isInside`), not `realpath`; a symlink inside a plugin directory can serve/load a file outside it. No test.

---

## 6. Test-quality issues

| Issue | Where | Evidence / impact | Recommendation |
|---|---|---|---|
| **Vacuous assertion** | `audit-regressions.test.js:105-138` | `if (saved) { … }` never runs; no `saved === false` assertion. | Fix assertions; add affirmative consent case. Do not merely extend the loop. |
| **Brittle source-string slicing** | `audit-regressions.test.js:25-29`, `375-408`; `ui-copy.test.js:10-16` | Slices by `indexOf('function …')` / `const …`. Renaming or reformatting breaks the test; a changed implementation with the same names still runs. | Extract helpers to `lib/` (CJS) and import them; or load whole files with a fake global context. |
| **Regex-only channel tests** | `channels.test.js`; `ipc-harness.test.js:127-129` | Proves literal presence, not that the preload bridge works or that handlers enforce trust. | Execute `preload.js` with fake `contextBridge`/`ipcRenderer`; table-drive all handlers. |
| **Sleep-based races** | `streamdeck.test.js:85`, `plugins.test.js:73,95`, `actions.test.js:16,30`, `plugin-host.test.js:32` | 20 ms, 20 ms, 400 ms, 400 ms, 10 ms. Slow/flaky under CI load; actions test dominates suite duration. | Await the async method directly (`await manager._selectDialog(...)`), use EventEmitter fake children and fake timers, or expose a promise. |
| **Fake timers mixed with real ticks** | `audit-regressions.test.js:223-294` | `t.mock.timers.enable({apis:['setTimeout']})` combined with real `setImmediate` and `Date.now()`. Works now but fragile. | Use `t.mock.timers` consistently; advance and await microtasks in a helper. |
| **Asserting internal state instead of public behaviour** | `audit-regressions.test.js:254-321` | Manually seeds `generations`, `childGenerations`, `socketGenerations`, `children`, `sockets`, `restarting`; calls private `_onChildExit`. A behaviour regression in `reload()` can still pass. | Drive `reload()`/`restart()`/child exit events and assert observable sockets, sends, child count and crash policy. |
| **Over-mocking the host** | `streamdeck.test.js`, `plugin-host.test.js`, `audit-regressions.test.js` | `_spawn`/`spawn` overridden; `spawnCommand` often not asserted; fake `once()` no-op. Does not catch wrong command/args/env or graceful-exit bugs. | Add a focused test asserting the exact spawn tuple; use an EventEmitter child that emits `exit`. |
| **Test names overstate scope** | `ipc-harness.test.js` “refuses untrusted senders”; `streamdeck.test.js` “several actions sync”; `store.test.js:401` “one malformed page is dropped” (calls `validateConfig` only); `audit-regressions` “child retired by reload” (manually constructed) | Future readers trust a guarantee that is not checked. | Rename precisely; keep one broad integration test per claim. |
| **No temp-dir cleanup** | `store.test.js:11-13`, `import.test.js`, `streamdeck.test.js`, `plugins.test.js`, `plugin-host.test.js`, `plugin-protocol.test.js` | 33 new `ulanzi-*` dirs per run; 6,493 accumulated. Can fill CI/tmp. | Use `t.after(() => fs.rmSync(dir, {recursive:true, force:true}))` or a shared `tempDir(t)`. |
| **Coverage inflation by data-only tests** | `shared-meta`, `geometry`, `constants`, `channels` | 100% but little behavioural regression value; raw “all files” includes test files at 100%. | Keep, but don’t use them to justify a global threshold. |
| **Mac-only tests skipped in CI** | `streamdeck.test.js:91` | CI runs Ubuntu x64; `process.arch !== 'arm64'` skips Rosetta detection. Release tag runs macOS, but PRs do not. | Add an Ubuntu-compatible arch fixture test (mock `process.arch`/`binaryArch`) or a macOS CI job. |
| **No DOM/canvas/Electron e2e** | whole renderer/main | Zero tests run HTML, canvas, preload, BrowserWindow, protocol handlers, tray, quit. | Add a small fake-DOM/canvas harness first; add a Playwright Electron smoke test later. |

---

## 7. Proposed high-value tests

Effort: **S** ≈ under 2 hours, **M** ≈ half-day to one day, **L** ≈ multi-day.  
Level: **U** unit, **I** integration (real modules + fakes), **E** end-to-end/Electron.

### P0 — do next

| ID | Target | What to assert | Fixture / fake | Effort | Risk reduced | Level |
|---|---|---|---|---|---:|---|
| **P0-1** | `ipc.js` `registerIpc`, `trustedSender`; `preload.js` | Every one of the 62 `ipcMain.handle` channels denies an untrusted `senderFrame` with the shared error and leaves ctx spies untouched; trusted only for the exact `renderer/index.html` path; reject `..`, query, other files, missing frame; preload API surface matches handlers; every `send` channel is declared. | Reuse `test/ipc-harness.test.js` fake Electron; table-driven channels; ctx spies. | M | **High — security boundary** | I |
| **P0-2** | `ipc.js` `import:apply`, `profile:import/export` | New/merge/replace modes; collision ID remap for pages/goto/parent; duplicate page names get suffixes; replace keeps profile/pinned and removes only active-profile pages; cleanup temp dir; profile format/size rejection; export validates `format` and writes only with consent. | Temp Ulanzi profile dir; real `Store`; fake Electron dialogs; `t.after` cleanup. | M | **High — data loss/corruption** | I |
| **P0-3** | `lib/plugins.js` `_onConnection` | Inspector `connected` sends `add` with action settings; unknown plugin closes 4402; known plugin registers socket, replays `add`/`setactive`, sends `didReceiveGlobalSettings`, flushes queue; `paramfromplugin` updates settings; close removes only its own socket; bad JSON ignored. | Fake `ws` EventEmitter: `readyState=1`, `send` spool, `close` spy; host maps seeded through `sync`. | S/M | **High — plugin core** | I |
| **P0-4** | `lib/streamdeck-plugins.js` `_onConnection` | Unknown `registerPlugin` closes 4402; known registration sends `deviceDidConnect`, replays active actions; second socket closes previous 4409; unknown PI 4403; PI/plugin settings and `sendToPlugin`; `setImage`/`setTitle`/`setState`; inspector settings re-sent after 150 ms; malformed JSON ignored. | Same fake ws + fake timers; action metadata fixture with two states. | M/L | **High — plugin core** | I |
| **P0-5** | `lib/plugin-host.js` `install`/`import`/`remove`/`reloadOne` | ZIP install extracts safely and removes temp; install over self preserves source; failed copy leaves previous install; destination traversal rejected; read-only import copies, read-only remove rejects; reloadOne clears only matching actions and restarts when actions remain. | Temp plugin folders/ZIP; fake `_spawn`; spy `reloadOne`. | M | **High — install/data loss** | I |
| **P0-6** | `renderer/press.js` `handleKeyEvent` | Tap only on press; 60 ms bounce suppressed; hold fires at `holdMs` and release does not also fire; double fires within 300 ms; standby first press swallowed; lock ignores; wide key cycles without action; SD plugin forwards keyDown/Up and never runs tap; missing/empty key no-op. | VM context with fake `$`, `state`, `api`, `activePage`, `keyAt`, `WIDE_KEY_INDEX`, `toast`; `t.mock.timers`. | M | **High — user input** | U/I |
| **P0-7** | `renderer/press.js` `runMulti`, `runToggle`, `openPop`, `toggleTimer`, `formatTimer` | Multi awaits each async step, stops on failed result, honours delay, alternate/random, per-action cancellation; toggle alternates two; POP maps items and runs selected index; timer countdown text/beep/refresh; format hours/minutes. | Same VM harness; fake `api.runAction`, `showPop`, `drawIndex`, `pushNow`. | M | **High — action semantics** | U |
| **P0-8** | `renderer/render.js` `drawKey`, `drawSystemPanel`, `renderStandbySlices` | Key text uses `textStyle.family/weight/colour`; caption uses `font.family/weight/size/align/colour`; gradient/solid/none backgrounds; caption suppressed for live image unless `captionExplicit`; icon face suppresses text; indicator draws number/dots; badges; blank plus; wide panel clock/stats/blank; standby returns 14 indexed images. | Recording canvas 2D context + fake `Image` with dimensions; VM with `window.DeckGeometry`, `DeckTextStyle`, `timerTextFor`. | M | **High — 0.11 typography regression** | U |
| **P0-9** | `lib/deck.js` | Connect success and busy/error message; `sendFrame` writes 1025-byte reports; brightness/sleep clamps; `setWideMode` schedules 5 s/1 s/60 s/0 intervals and correct payloads; `_onReport` strips report id and emits key press; device-info JSON merge; disconnect closes and stops clock/stats. | Fake `node-hid` via `Module._load`; EventEmitter device with `write` spool; fake timers. | M | **High — hardware protocol** | U |
| **P0-10** | `lib/archive.js` | Reject archive over size cap, truncated/no EOCD, ZIP64, invalid directory, absolute/Windows/backslash/NUL names; corrupt ZIP extraction rejects; `readZipEntry` cap; runtime monitor kills an `unzip` that writes too much; symlink entry policy. | Hand-built ZIP buffers; fake `unzip` script on `PATH` writing a large file; `t.after` cleanup. | L | **High — security/disk exhaustion** | U |
| **P0-11** | `lib/store.js` image handling | State icons, pinned keys, lock/standby images externalize to `file:` and internalize back; missing file becomes null; `file:../../x` is basename-contained; SVG/MIME mapping; orphan pruning keeps current+backup references; settings clamps. | Temp store dirs; `t.after` cleanup. | S | **Medium/High — config loss** | U |

### P1 — soon

| ID | Target | What to assert | Fixture / fake | Effort | Risk reduced | Level |
|---|---|---|---|---|---:|---|
| **P1-1** | `lib/market.js` | Token only sent to `*.ulanzistudio.com`; redirect off-vendor strips token; cross-origin 307 with POST body rejects; HTTP hop rejected; 303 becomes GET without content-type; response caps; login saves `0600`; logout removes; categories/list normalization; download requires HTTPS and `PK`; `checkFile` rejects HTML. | Fake `global.fetch` returning redirects/headers/bodies; temp dir. | M | **High — credential/supply chain** | U |
| **P1-2** | `lib/import-ulanzi.js` full | `previewProfile` handles directory and `#Version: 2` ZIP; `listProfiles`; page limit; image budget error; missing image; Windows path; multi-state views; fonts/colours; multimedia/sound/open/close/text/page/folder/indicator; folder parent mapping; `missingPlugins`/`unmapped`/`skipped` reports; `sourceAction` survival. | Temp profile tree + JSZip fixtures; `t.after`. | M/L | **High — import correctness** | I |
| **P1-3** | `ipc.js` plugin management handlers | Install folder/ZIP consent accept and decline; detection of `.sdPlugin` folder/ZIP/manifest heuristic; list/sync/run/key/set-settings/restart/reload/import/remove/reveal success and error; `plugins:changed` emitted; read-only error. | Fake Electron + real `PluginManager`/`StreamDeckPlugins` in temp dirs; stub install/spawn. | M | **Medium/High — install UX/data** | I |
| **P1-4** | `ipc.js` icon pack handlers | Install sanitizes id/name, copies images, dedupes filenames, writes `pack.json`, rejects non-ZIP/oversize; list hides dot files; read uses basename; remove refuses `ulanzi:` and accepts `app:`; traversal does nothing. | Temp `ULANZI_CONFIG_DIR`, fake market download, JSZip fixture. | M | **High — path traversal/data deletion** | I |
| **P1-5** | `renderer/inspector.js` | Changing `#insp-text-family/weight/colour` updates `key.textStyle`; `#insp-font-*` updates `key.font`; `#insp-font-show` toggles disabled controls and `captionExplicit`; face tabs; action-type switch; trigger fields; multi-step editor; no stale event listeners after re-render. | `linkedom`/`jsdom` + canvas stub; fixture config/state; dispatch DOM events. | M/L | **High — recent typography/UI wiring** | I |
| **P1-6** | `app/plugin-hosts.js` | Error listener attached before `scan`; bad manifest does not abort initialization; `state/title/settings/toast/alert/ok` forwarded; SD brightness clamps/saves/deck calls; `switch-profile` forwarded; HTML window open/stop/close; select-dialog filters. | Fake Electron (`BrowserWindow`, `dialog`, `shell`), fake hosts, temp dirs. | M | **Medium/High — startup availability** | I |
| **P1-7** | `lib/actions.js` | `runHotkey` builds correct helper args for key codes/modifiers; `openUrl` rejects `javascript:`/unknown schemes and prefixes `https://`; `openApp` fallback; `typeText` enter; `closeApp`; sound volume/clamping/stop; media invalid op and exit code; permission error mapping. | Inject fake `spawn`/`execFile`; or extract pure arg builders; fake `electron.shell`. | M | **Medium/High — user actions** | U |
| **P1-8** | `lib/sdcatalog.js` | `resolve` requires catalogue entry; release asset `.zip/.streamdeckplugin`; `download` rejects HTTP/redirect downgrade/oversize/non-200; cache expiry; `updates` skips missing/no version/release failure. | Fake `global.fetch` with redirects and bodies. | S/M | **Medium — supply chain** | U |
| **P1-9** | `renderer/app.js` own-format round trip | Export/import preserves pinned keys, profile background/appPath/appName, page background, hold/double, nested plugin IDs; duplicate names; invalid format/no pages rejected; export only runs with `format`. | Extract/import pure helpers into `lib/profile.js`; or VM with real source. | M | **Medium — backup/restore** | U |
| **P1-10** | `ipc.js` dialogs | `config:state` recovery one-shot; pick image MIME/data; pick audio; profile export save/cancel/write error; import size >128 MB/format/no pages; `getWin` lazy for every dialog; `app:open-external` scheme filter. | Harness + temp files + fake dialogs. | S/M | **Medium — dialogs/UX** | I |
| **P1-11** | `ipc.js` POP + `renderer/pop.js` | Item sanitization (9 max, font 10–20, icon allowlist), second press toggles closed, choice only from popup webContents, Escape/blur/timeout, previous-app restore, keyboard focus/navigation. | Fake `BrowserWindow`/`ipcMain`/`screen`/`frontmostApp`; DOM harness for `pop.js`. | L | **Medium — user-facing POP** | I/E |

### P2 — later

| ID | Target | What to assert | Fixture / fake | Effort | Risk reduced | Level |
|---|---|---|---|---|---:|---|
| **P2-1** | `lib/sysstats.js` | CPU delta first sample 0 then percentage; mem clamp; GPU regex/cache/5 s throttle/busy; `start` idempotent; `stop`; `sample`. | Stub `os.cpus/totalmem/freemem`, fake `execFile`, fake timers. | S | Low/Medium | U |
| **P2-2** | `lib/appicon.js` | `findIconFile` plist/name/candidates/readdir fallback; `resolveAppPath` direct `.app` and exact case-insensitive name; icon cache; missing/sips failure. | Temp `.app` tree with `Contents/Resources/*.icns`; fake `execFile`. | S/M | Low/Medium | U |
| **P2-3** | `lib/updates.js` | Malformed JSON, missing tag, no DMG, abort/timeout, `releaseNotes`/`plainNotes` branches (heading, bold, code, separator, truncation). | Fake `fetchImpl`; already has response helper. | S | Low | U |
| **P2-4** | Electron app smoke | Launch with `ULANZI_NO_DECK=1`, temp `ULANZI_CONFIG_DIR`; window loads; add a key; profile export/import smoke; no uncaught renderer errors; quit cleanup. | Playwright `_electron.launch` or Spectron-style harness. | L | **High but expensive** | E |
| **P2-5** | `main.js` window security | `isRendererFile` rejects external/`..`/sibling; `will-navigate`/`will-redirect` prevented; `setWindowOpenHandler` denies and opens only http(s)/mailto; quit confirmation cancel/quit. | Extract `isRendererFile` or fake Electron harness around `createWindow`. | M | Medium/High | I |
| **P2-6** | `lib/plugin-view.js` / `lib/plugin-protocol.js` symlinks | `realpath` containment rejects symlink escape; encoded traversal/empty hash; missing file; malformed percent. | Temp dirs with symlinks. | S | Medium | U |

---

## 8. Coverage / CI plan

### 8.1 Commands to add

Keep the existing simple workflow untouched:

```jsonc
// app/package.json — add, do not replace "test"
"test": "node --test \"test/*.test.js\"",
"test:coverage": "node --test --experimental-test-coverage \"test/*.test.js\"",
"test:coverage:all": "c8 --all --include='lib/**/*.js' --include='ipc.js' --include='main.js' --include='plugin-hosts.js' --include='preload.js' --include='pop-preload.js' --include='renderer/**/*.js' --exclude='renderer/assets/**' --reporter=text --reporter=json-summary npm test"
```

`c8` is not installed today. Add it as a devDependency if network/CI allows; otherwise start with `test:coverage` (built-in) and clearly label the missing files.

For built-in thresholds, Node 22 supports:

```bash
node --test --experimental-test-coverage \
  --test-coverage-lines=... \
  --test-coverage-branches=... \
  --test-coverage-functions=... \
  "test/*.test.js"
```

But these apply only to loaded files, so they cannot enforce whole-app coverage.

### 8.2 CI

Add a separate non-blocking coverage job to `.github/workflows/ci.yml`:

```yaml
  coverage:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: app
    steps:
      - uses: actions/checkout@...
      - uses: actions/setup-node@...
        with:
          node-version: 22
      - run: npm ci --ignore-scripts
      - run: npm run test:coverage
      - uses: actions/upload-artifact@...
        if: always()
        with:
          name: coverage
          path: app/coverage/
```

Keep `npm test`, lint and typecheck as the required gates. Do not gate coverage in the first PR.

### 8.3 Recommended thresholds and gating

**Phase 1 — report only (now):**
- Upload per-file coverage; comment on PRs with a summary.
- Use `c8 --all` so unloaded files show 0%, not disappear.
- Exclude `test/**`, `scripts/**`, `dist/**`, `node_modules/**`, `renderer/assets/**`.

**Phase 2 — gate the already-strong pure modules:**
Per-file minimums, if the pinned c8 supports `--per-file`; otherwise enforce with a small script reading `coverage-summary.json`:

| Group | Files | Lines | Branches | Functions |
|---|---|---:|---:|---:|
| Core pure | `store`, `archive`, `text-style`, `page`, `protocol`, `http`, `paths`, `version`, `iconpacks`, `plugin-view`, `mime`, `channels`, `constants`, `geometry`, `actions-meta` | 85 | 75 | 85 |
| Good but thin | `plugin-protocol`, `updates`, `plugin-host` | baseline + 3 pts | baseline + 3 | baseline + 5 |
| Weak, do not gate yet | `ipc`, `plugins`, `streamdeck-plugins`, `actions`, `import-ulanzi`, `siteicon`, `sdcatalog`, `appicon`, `sysstats` | report only | report only | report only |
| Unmeasured | `main`, `plugin-hosts`, `preload`, `renderer` | report only until harness exists | — | — |

**Phase 3 — ratchet:**
- Set a whole-app floor near the measured baseline, e.g. **28% lines / 24% branches**, then raise 2–3 points per minor release. This prevents a “coverage number looks fine” regression without pretending the app is at 80%.
- Require changed files to meet the Phase 2 bar using `diff-cover` (or an equivalent changed-lines report).
- Do not add a global 70–80% gate now. It is unattainable with renderer at 0%, and it would encourage more tests for `constants`/`shared-meta` rather than the security and data paths that matter.

**Per-file reporting:** yes. A single global percentage hides `ipc` at 30%, `plugins` at 41%, `streamdeck-plugins` at 45%, and renderer at 0%.

**Renderer coverage:** built-in/c8 will not see plain `<script>` renderer files unless they are loaded by a test. Options:
1. Load renderer scripts into a VM context with `new vm.Script(source, { filename: path })` and a fake DOM/canvas. This can attribute executed lines to the real file.
2. Extract pure logic (`press` state machine, text layout, inspector updaters, import remap) into CJS modules under `lib/`.
3. For true end-to-end renderer coverage, use Playwright Electron JS coverage. This is P2.

---

## 9. Prioritized recommendations

### P0 — do next

1. **P0-1 IPC contract/trust matrix.** The app’s main security boundary is one `handle()` wrapper; only one of 62 channels proves it works. This is the highest leverage test in the repo.
2. **P0-3/P0-4 Plugin protocol machines.** These are the integration seams the last audit found broken (registration, socket ownership, settings replay, inspectors). Current generation tests seed internals rather than drive them.
3. **P0-2 `import:apply` and profile round trips.** Data-loss/corruption paths, page-ID remapping and replace semantics are completely untested.
4. **P0-6/P0-7 Key press, hold/double, multi/toggle/POP timers.** Core user input and the 0.10 sequence/timer work; `press.js` is 445 lines with zero tests.
5. **P0-8 Canvas typography and caption rendering.** 0.11 changed exactly this code and has no renderer test. A wrong `font` string or caption suppression is invisible to the suite.
6. **P0-10 Archive adversarial cases.** Zip-slip/zip-bomb/symlink/truncation are security-sensitive and only happy paths are tested.
7. **P0-9 Deck fake-HID tests.** Protocol framing is tested, but the device state machine, timers and report parsing are not.
8. **P0-5 Install/reload transaction tests.** Preserve source and previous install; read-only import/remove; ZIP install.
9. **P0-11 Store image edge cases.** Fast, cheap, closes the remaining image/recovery branches.

### P1 — soon

- **P1-1 Market credential/redirect tests.** `market.js` is 308 lines at 0%; it handles tokens and downloads.
- **P1-2 Import-ulanzi full profile coverage.** The importer has several untested branches that look wrong on inspection (budget throw swallowed, missingPlugins dead condition).
- **P1-3/P1-4 Plugin and icon IPC flows.** After P0-1’s harness, these are incremental.
- **P1-5 Inspector event wiring.** Recent typography and trigger/action editor work; a broken selector fails silently.
- **P1-6 Plugin-host wiring.** Startup availability and event forwarding.
- **P1-7 Actions.** Only shell commands are tested; hotkeys/apps/URLs/media are daily-use paths.
- **P1-8 Catalogue downloads, P1-9 profile round trip, P1-10 dialogs, P1-11 POP.**

### P2 — later

- **P2-1/P2-2/P2-3** `sysstats`, `appicon`, updater edge branches: lower frequency, small files.
- **P2-4** Playwright Electron smoke/e2e: high confidence but expensive; do after the fake-DOM harness proves renderer logic.
- **P2-5** main-window security; **P2-6** symlink containment.

---

## 10. Tests to replace or delete rather than extend

| Test | Recommendation | Reason |
|---|---|---|
| `test/channels.test.js` (all 3) | **Replace** with a behavioural `ipc-contract` test that executes `preload.js` with fake `contextBridge`/`ipcRenderer`, captures the exposed API, and table-drives all handlers. | Regex presence checks cannot catch a handler that is registered but unsafe, or a preload function wired to the wrong channel. |
| `test/ui-copy.test.js` | **Replace/delete** after moving `prettyHotkey` to a CJS module (e.g. `lib/hotkeys.js`); unit-test it directly. | Source-slice VM test is brittle and only covers one formatter. |
| `test/audit-regressions.test.js` renderer slices (`:25-29`, `:375-408`) | **Replace** with tests for extracted `lib/` helpers; then split `audit-regressions` into `store-regressions`, `plugin-host-regressions`, `import-regressions`, `renderer-regressions`. | `indexOf('function …')` is a maintenance trap; a grab-bag file hides ownership. |
| `test/streamdeck.test.js:67-89` (“several actions sync”) | **Rewrite** to call `sync()` twice with fake actions, or rename to “ensurePlugin dedupes concurrent launches”. | Current test does not exercise sync; name overstates. |
| `test/plugins.test.js:58-97` select-dialog tests | **Rewrite** to `await manager._selectDialog(...)` directly; keep one cancellation case. | 20 ms sleeps; duplicate coverage of the same wrapper. |
| `test/actions.test.js:8-35` | **Rewrite** with an EventEmitter fake child / injected spawn; delete the 400 ms sleeps. | Slow, timing-dependent, and only proves shell stderr routing. |
| `test/store.test.js:401-407` “one malformed page is dropped” | **Rename** to “validateConfig drops malformed pages”, or delete the duplicate and keep the real on-disk load test in `audit-regressions`. | It calls only `validateConfig`, not load; the name implies the load path. |
| `test/plugin-host.test.js:28-34` shutdown escalation | **Rewrite** with a fake `EventEmitter` child that emits `exit`; add a separate no-exit case for SIGKILL. | The current fake’s `once()` is a no-op, so only the timeout branch is exercised. |
| `test/audit-regressions.test.js:105-138` import consent | **Fix, do not delete.** Add `assert.equal(saved, false)` and an affirmative-consent branch; then add save/load assertions for all container types. | Currently the body under `if (saved)` never runs; the test can pass vacuously. |
| `test/ipc-harness.test.js:127-129` preload regex | **Replace** the regex portion with executing preload; retain the handler-map and SD-install cases. | Literal regex does not prove the bridge surface or call shapes. |
| `test/shared-meta.test.js`, `geometry`, `constants` | **Keep.** Do not extend with more data-consistency assertions as a coverage tactic. | They are cheap guardrails, not behavioural coverage. |
| `test/page.test.js` | **Keep and split** into wide-slot behavior, normal slot/dedupe behavior, empty input. | One test covers several concerns; splitting improves failure localization without deleting coverage. |

---

## 11. Bottom line

- **Current tests are not worthless:** `store`, `text-style`, `protocol`, `paths`, `http`, `archive` central-directory checks, and the audit-regression specs are genuinely useful. They caught real historical defects.
- **But the application’s highest-risk surfaces are outside the tested set:** IPC, both plugin protocol machines, the renderer, HID, the market, and install/import transactions.
- **The 71% headline should not be used as a quality signal.** Effective whole-app line coverage is about **24%**, and the built-in runner cannot see renderer/main/plugin-hosts/preload at all.
- **The best next investment is harnesses, not more assertions:** a reusable fake Electron IPC harness (already started), a fake WebSocket, a fake canvas/DOM renderer harness, a fake HID, and a profile/plugin fixture builder. Those unlock the P0 tests without turning the suite into hundreds of brittle source-string checks.

No repository files were changed; `git status` remains clean at `1427323`.
