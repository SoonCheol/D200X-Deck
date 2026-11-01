# Ulanzi Deck Open — architecture & security audit

**Repository:** `/Users/eduardo/Projects/Personal/Repositories/ulanzi-deck-open`
**Revision:** `457f562 Release 0.6.0` (clean working tree)
**Date:** 2026-11-01
**Scope:** `app/` (Electron main, preload, 14 lib modules, 10 renderer files), tests, CI, packaging scripts.
**Method:** read every source file in full; ran `npm test` (46/46 pass), `npm audit`, `node --check`, `git log/status`, and two empirical archive-extraction experiments (see Appendix). No source file was modified.

---

## 1. Executive summary

- **No Critical finding.** The renderer is context-isolated with no Node, the preload exposes a fixed function list (not a generic `invoke`), navigation is denied outside the app page, and action execution uses argv arrays everywhere except the one action that is *meant* to use a shell. Those are the things that usually go wrong in Electron apps and they are right here.
- **The biggest real risk is the trust boundary around imported files, not the network.** `.ulanzideckprofile` import (`main.js:1779`, `renderer/app.js:442-524`) copies arbitrary `action` objects into the config, including `type: "command"`, which `lib/actions.js:63` runs through `/bin/sh -c`. A shared profile file is therefore a shell-script delivery vehicle with only a "Imported profile" toast. Ulanzi-format import (`lib/import-ulanzi.js:152-239`) *cannot* do this — the app's own format can.
- **One path-containment bug in a `rm -rf` handler.** `packDir()` (`main.js:1212`) joins an unsanitised id, so `icons:remove('app:..')` deletes the entire app-data directory (config, images, plugins) and `icons:read` reads arbitrary files. Verified by evaluating `packDir` directly.
- **`main.js` is the architecture problem.** 1,893 lines: window/menu/tray lifecycle, two custom protocols, two plugin-host wirings, ~62 IPC handlers, the update scheduler, icon-pack management, app-icon extraction, POP windows, and a 130-line CORS header rewrite. The two plugin hosts duplicate ≈215 lines each of the same lifecycle plumbing, and the two protocol handlers are the same 130-line function twice.
- **Security plumbing is present but half-applied.** `guarded()` exists and is used on **8 of 62** `ipcMain.handle` registrations; 8 more check `trustedSender` inline. 46 handlers — including the destructive `store:install`, `store:install-icons`, `plugins:reload` — have no sender check at all.
- **`sandbox: false` is set explicitly on the main window** (`main.js:101`) although `preload.js` only requires `electron`. That is the cheapest security upgrade in the repo.
- **The renderer has no module boundaries.** `app.js` defines `state`, `api`, `esc`, `uuid`, `activePage`, `COLS`, `WIDE_KEY_INDEX`, … and the other 8 renderer files reference **73** of its bindings (ui.js 27, inspector.js 16, press.js 13). `app.js` is loaded *last* in `index.html:483`.
- **Reliability has one nasty latent bug:** `Deck.connect()` assigns `this.status = {...}` on the HID-scan error path (`lib/deck.js:45`), shadowing the `status()` *method*. Any later `deck.status()` — including `app:state`, the renderer's bootstrap call — throws `deck.status is not a function`.
- **Tests are good where they exist and silent where it matters.** 46 tests cover protocol framing, config migration/recovery, page ZIPs, both plugin install paths and version comparison. There is **zero** coverage of `main.js` (all IPC, both protocol handlers, path containment, the update scheduler), of `market.js`, `deck.js`, `appicon.js`, `sysstats.js`, and of the entire renderer.

**Verdict:** a well-built single-author app with a genuinely careful security posture in the places the author thought about (schemes, exec, config durability, plugin install), and blind spots exactly where a solo maintainer runs out of attention: `main.js` accretion, duplicated hosts, half-applied IPC validation, and no test coverage of the security-critical glue.

---

## 2. Scorecard

| Area | Rating | One sentence |
| --- | --- | --- |
| Architecture | **C** | Clean, small, single-purpose `lib/` modules underneath a 1,893-line `main.js` that owns six unrelated concerns; the renderer is one shared global namespace. |
| Security | **C+** | Strong fundamentals (isolation, no `openExternal` on unvalidated schemes, contained protocols, capped downloads) undermined by 46 unvalidated IPC handlers, `sandbox: false`, an unsanitised `packDir`, and an import path that carries shell actions. |
| Reliability | **C+** | Atomic config writes, `.bak`/`.corrupt`, crash backoff, port fallback and push dedupe are all present; against that: a method-shadowing bug, a helper daemon with no watchdog, `execFileSync` on the main thread every 3 s, and SIGTERM-only plugin shutdown. |
| Test coverage | **D+** | 46 meaningful unit tests, but they stop at the `lib/` boundary — `main.js`, the renderer and the marketplace have no tests at all, and several tests are timing sleeps. |
| CI / build | **B−** | Tests gate the release, `npm ci`, checksums published, universal helpers built from source; missing lint/typecheck, floating `macos-latest`, actions pinned by tag, and a bundle that ships `test/`, `scripts/` and `native/`. |
| Dependency hygiene | **B** | Three runtime dependencies (`jszip`, `node-hid`, `ws`) for what the app does is lean; `npm audit` reports 5 moderate advisories, all in the dev-only `@electron/packager` chain; no Dependabot. |
| Code duplication | **D** | Two plugin hosts, two protocol handlers, two inspector-height bridges, 7 MIME tables, 4 media-op tables, 4 action-type lists, 2 `esc()`s, 2 version comparators — each pair already drifting. |

---

## 3. Findings

### Critical

**None confirmed.** The two High items below are the ones that would become Critical with one more step (H1 needs the user to import a file; H2 needs a renderer-side primitive). They are listed as High deliberately, not downgraded to be conservative.

---

### High

#### H1. Imported `.ulanzideckprofile` files can carry `command` actions → arbitrary shell execution on key press

- `app/main.js:1779-1797` (`profile:import`), `app/renderer/app.js:442-524` (`remapImportedAction` / `importProfileData`), `app/lib/actions.js:63-83` (`runShell`), `app/lib/store.js:13-16` (`command` is an allowed type).
- **What:** `profile:import` reads a user-chosen JSON file, checks only `format === 'ulanzi-deck-open-profile'` and `Array.isArray(pages)`, and hands the object to the renderer. `remapImportedAction` deep-copies each action and rewrites only `actionid`/page targets — `{type:'command', value:'…'}` survives verbatim. `actions.execute()` then runs it via `spawn('/bin/sh', ['-c', …])`.
- **Why it matters:** the documented feature is "back up or share this profile as one file" (`index.html:282`). A shared profile is a document, and documents get opened. The user gets one toast (`app.js:523`) and no indication that the file contains shell commands, URLs, or hotkeys. This is the standard "malicious document → code execution" path, with the user's full permissions and no sandbox.
- **Fix:** on import, walk the incoming actions (including `holdAction`, `doubleAction`, `steps[].action`, pinned keys) and (a) if any `command`/`text`/`hotkey`/`app`/`url` action is present, show a modal listing them and require an explicit "Import N shell commands" confirmation; (b) mark imported command actions with `imported: true` and render a warning badge on the key. Cheapest correct version: refuse `command` actions on import unless the user ticks a checkbox.
- **Effort** S · **Confidence** high

#### H2. `packDir()` does not sanitise the pack id: arbitrary file read and arbitrary directory deletion

- `app/main.js:1212-1216` (`packDir`), `app/main.js:1303-1318` (`icons:read`), `app/main.js:1326-1333` (`icons:remove`).
- **What:** `packDir(id)` splits `"app:<name>"` and returns `path.join(iconsRoot(), name)` with no `..` filtering. Verified: `packDir('app:..')` → `…/Application Support/Ulanzi Deck Open`, `packDir('app:../../..')` → `…/Library`. `icons:remove` guards only on the `app:` prefix and then calls `fs.rmSync(dir, { recursive: true, force: true })`; `icons:read` builds `path.join(dir, path.basename(file))` and validates with `target.startsWith(dir)`, which is trivially true for any `dir`.
- **Why it matters:** one IPC call from the renderer (`removeIconPack('app:..')`) deletes `config.json`, `Images/`, `Plugins/`, `store.json` and `streamdeck.log` in a single non-interactive step. `icons:read` turns the same bug into an arbitrary-file-read that returns base64 to the renderer. Today both require a renderer-side primitive (I found no XSS — see Appendix), so this is a latent Critical sitting behind the weakest link in the app.
- **Fix:** `const name = String(id).split(':').pop(); if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(name) || name.includes('..')) return null;` and then assert `path.relative(root, dir)` neither starts with `..` nor is absolute. Replace the `startsWith` checks in `icons:read` with `path.relative`.
- **Effort** S · **Confidence** high

#### H3. `Deck.connect()` overwrites the `status()` method on the error path, breaking `app:state`

- `app/lib/deck.js:41-48` (the `this.status = {...}` assignment), `app/lib/deck.js:107-109` (the `status()` method), `app/main.js:1057-1062` (`app:state` calls `deck.status()`).
- **What:** inside the `try { Deck.find() } catch`, the code does `this.status = { connected: false, message: … }`. `status` is a prototype method, so this creates an own data property that permanently shadows it. Every later `deck.status()` throws `TypeError: deck.status is not a function`.
- **Why it matters:** `HID.devices()` can throw when the HID service is unavailable (sleep/wake, a broken `node-hid` load, a USB stack hiccup). The renderer's `init()` awaits `api.getState()` (`app.js:1600`), so the failure is a rejected promise in the bootstrap — no `try/catch` there — leaving a half-initialised UI, and `deck:reconnect` (`main.js:1116`) throws too. A one-word typo turns a transient HID error into a dead app.
- **Fix:** delete line 45 and let `_status(false, …)` be the single path, or rename the assignment to `this._lastStatus`.
- **Effort** S · **Confidence** high

#### H4. Main window runs with `sandbox: false` although its preload needs nothing from Node

- `app/main.js:96-103` (`sandbox: false` at :101), `app/preload.js:3` (only `require('electron')`), `app/main.js:1837` (POP window also `sandbox: false`).
- **What:** `contextIsolation: true` and `nodeIntegration: false` are set correctly, then the sandbox is explicitly disabled. `preload.js` uses `contextBridge` and `ipcRenderer` only — both available in a sandboxed preload. The other renderers (plugin HTML windows, `main.js:434-438` / `526-530`) do not set `sandbox`, so they already take the Electron default.
- **Why it matters:** with the sandbox off, a renderer compromise (any future XSS in the ~90 `innerHTML` sites) reaches the full Node/Chromium syscall surface of the renderer process instead of the OS sandbox. There is no functional reason for it here.
- **Fix:** remove `sandbox: false` from both `webPreferences` blocks and smoke-test the preload bridge (startup, `getState`, one key press, one plugin inspector). If something breaks, the culprit will be a preload dependency on a Node builtin, which does not currently exist.
- **Effort** S · **Confidence** high (code) / medium (that nothing regresses)

---

### Medium

#### M1. IPC sender validation covers 16 of 62 handlers; `guarded()` is applied to 8

- `app/main.js:52-67` (`trustedSender`, `guarded`); guarded at `:1064, :1148, :1326, :1387, :1502, :1513, :1583, :1593`; inline `trustedSender` at `:1120, :1352, :1357, :1362, :1748, :1760, :1780, :1800`.
- **What:** 62 `ipcMain.handle` registrations; 8 wrapped in `guarded()`, 8 check the sender by hand, 46 check nothing. Unvalidated handlers with side effects include `store:install` (`:1335`, downloads and unpacks a ZIP), `store:install-icons` (`:1228`, same plus `rm -rf` of the destination), `plugins:reload` (`:1494`), `plugins:open-log` (`:1536`), `icons:open-folder` (`:1320`), `plugins:install-rosetta` (`:1399`, spawns `osascript`), `config:save` is guarded but `plugins:sync`/`plugins:run` are not.
- **Why it matters:** today only `renderer/index.html` holds the preload, so the practical exposure is small — but this is the layer that is supposed to stay correct when a new window, iframe or navigation bug appears. The inconsistency also means a reviewer cannot tell intent from code.
- **Fix:** wrap every `ipcMain.handle` through one helper (`handle(channel, fn)` that applies `guarded` unless the channel is on a short, commented allowlist of pre-renderer channels), so the default is deny.
- **Effort** S · **Confidence** high

#### M2. Stream Deck property-inspector bridge injects action settings into `<script>` without escaping `</script>`

- `app/main.js:930-999` (`const payload = connect ? JSON.stringify(connect) : 'null'` at `:932`, interpolated at `:934`).
- **What:** `inspectorConnect()` returns a tuple whose 5th element is itself a JSON string containing the action's settings. `JSON.stringify` does not escape `<`, so a setting value containing `</script>` closes the injected script element. Verified: the produced payload string contains a raw `</script>`. Settings are settable by the plugin itself (`setSettings`) and by the user in the JSON textarea (`inspector.js:1315-1326`).
- **Why it matters:** script injection into the `sd-pi://local` origin, which is `sandbox="allow-scripts allow-forms allow-modals allow-same-origin"` (`inspector.js:1191`). Impact is bounded — that origin can already read any plugin's PI files and register as an inspector for its own context — but it is an injection in a boundary the app owns, and it is one line to remove.
- **Fix:** `JSON.stringify(connect).replace(/</g, '\\u003c')` (or `JSON.stringify(...).replace(/<\/script/gi, '<\\/script')`) before interpolation.
- **Effort** S · **Confidence** high (injection) / medium (impact)

#### M3. `trustedSender` and `isLocalPage` are substring checks, not path containment

- `app/main.js:53-60` (`url.startsWith('file://') && url.includes('/renderer/index.html')`), `app/main.js:123` (`url.includes('/renderer/')`).
- **What:** any `file://…/renderer/index.html` passes, wherever it lives, and any `file://…/renderer/…` may be navigated to. Neither check resolves the path or compares it to `__dirname`.
- **Why it matters:** both are the only gate in front of the preload bridge and of navigation. They are correct today because nothing can navigate the window anywhere else (`will-navigate`, `will-redirect`, `setWindowOpenHandler` all deny) — this is a defence-in-depth defect that becomes the primary control the moment one of those three is relaxed.
- **Fix:** compare `path.resolve(fileURLToPath(url))` against `path.join(__dirname, 'renderer')` with `path.relative`.
- **Effort** S · **Confidence** high (code) / low (current exploitability)

#### M4. One malformed page discards the whole config, silently

- `app/lib/store.js:151` (`for (const page of config.pages)`), `:362-390` (`load()` catch → `.bak` → defaults), `:382` (`this.emit?.('recovered')`).
- **What:** `validateConfig` dereferences `page.keys` without checking that `page` is an object. Verified: a config whose `pages` array contains `null` throws `TypeError: Cannot read properties of null (reading 'keys')`; `load()` catches, copies the file to `.corrupt`, loads `.bak`, and if that also fails writes a default config. `Store` does not extend `EventEmitter`, so `this.emit?.('recovered')` is a no-op — the recovery is never surfaced.
- **Why it matters:** hand-editing `config.json` (which the README invites by documenting its location) with one typo costs the user every page, profile and pin, with no message. The `.corrupt` copy is the only recovery path and nothing tells the user it exists.
- **Fix:** filter non-object pages (`config.pages = config.pages.filter(p => p && typeof p === 'object')`) before the loop, and have `load()` return a `{ recovered: true }` flag (or have `Store` extend `EventEmitter`) so `main.js` can toast "Your config was damaged; restored from backup (damaged copy saved as config.json.corrupt)".
- **Effort** S · **Confidence** high

#### M5. `hidseize` is spawned once and never restarted; the "wide key types the Ulanzi URL" symptom returns

- `app/main.js:635-642` (`startHidSeize`), `:644-668` (`spawnHelper`, `proc.on('exit')` only clears the handle), `:885` (single call at startup).
- **What:** if the helper exits (permission denied, crash, or macOS killing it after the Input Monitoring grant changes), `seizeProc` is set to `null` and nothing respawns it. There is no backoff, no retry, no user-visible state beyond the one-shot `seize:permission` toast.
- **Why it matters:** this is the exact failure documented in README:169 — the deck's firmware fallback types `www.ulanzistudio.com` into the frontmost app. The fix path the README gives ("enable Input Monitoring and relaunch") is the only one, and the app gives no hint that the helper is gone.
- **Fix:** reuse the crash-backoff pattern already in `plugins.js:429-450`: on exit, schedule a respawn (capped, e.g. 5 s → 60 s), emit a `seize:state` event, and show a persistent warning in Deck settings → Display while it is down.
- **Effort** S · **Confidence** high

#### M6. `frontmostApp()` blocks the main thread with two synchronous process spawns every 3 seconds

- `app/main.js:1727-1745` (`execFileSync('lsappinfo', …)` twice), `app/main.js:1871` (IPC handler), `app/renderer/app.js:812-829` (3 s poll, active whenever any profile has `appPath`).
- **What:** `lsappinfo` is invoked synchronously twice per poll (plus once per `apps:frontmost` call), and again inside `startFrontmostWatch` on the main process event loop.
- **Why it matters:** each spawn is ~10–30 ms of fully blocked main thread, i.e. UI/IPC stutter up to 60 ms every 3 s for users who link a profile to an app — the "app feels laggy" class of bug that is very hard for a non-technical user to report. It also runs while the window is hidden (`backgroundThrottling: false`).
- **Fix:** switch to `execFile` with a cached in-flight guard (the renderer already tolerates a stale answer), or drop the poll to 5 s and skip when the window is hidden.
- **Effort** S · **Confidence** high

#### M7. `sd-pi-open` messages are posted but never handled — links in Stream Deck inspectors are dead

- `app/main.js:959-966` (`parent.postMessage({ type: 'sd-pi-open', url: absolute }, '*')`), `app/renderer/app.js:1463-1479` (the only `message` listener, which returns early for anything that is not `ulanzi-pi-height`).
- **What:** the injected bridge replaces `window.open` in every Stream Deck property inspector and forwards the URL to the parent. Nothing listens for `type === 'sd-pi-open'`, so the click is swallowed.
- **Why it matters:** "Help"/"Get API key" buttons in third-party inspectors silently do nothing — a user-visible functional bug in a feature (PIs) that the changelog spends a lot of effort on.
- **Fix:** handle it in the existing listener (`if (data.type === 'sd-pi-open' && /^https?:/i.test(data.url)) api.openExternal(data.url)`), and add the `event.source`/origin check that the listener currently lacks (see M8).
- **Effort** S · **Confidence** high

#### M8. The `message` listener trusts any frame and any payload

- `app/renderer/app.js:1463-1479`.
- **What:** `window.addEventListener('message', …)` accepts `ulanzi-pi-height` from any origin and any window, and writes `data.height` into the iframe's inline style (clamped to 60–560 px).
- **Why it matters:** every plugin property inspector (third-party code) can resize the settings panel at will; combined with M7's missing origin check, the same channel is the natural place to hang a URL-opening primitive. Cosmetic today, structural tomorrow.
- **Fix:** record the iframe's `contentWindow` when it is created (`inspector.js:1191`) and ignore messages whose `event.source` is not that window; also check `event.origin` starts with `ulanzi-pi://` or `sd-pi://`.
- **Effort** S · **Confidence** high

#### M9. Ulanzi store "Update" uses string inequality while the SD store uses numeric comparison

- `app/renderer/store-ui.js:330-333` (`String(item.version) !== String(installedPlugin.version)`), `app/lib/sdcatalog.js:35-53` (`compareVersions`), `app/lib/updates.js:38-40` (`isNewer`).
- **What:** the changelog for 0.2.0 says the phantom-update bug ("1.0.0" vs "1.0") was fixed by comparing versions numerically — that fix landed only in the Stream Deck path. The Ulanzi detail view still compares strings, so `1.0` vs `1.0.0` shows "Update" for an identical version, and `1.10` vs `1.9` shows *no* update when one exists.
- **Why it matters:** a documented fix that is not actually applied on one of the two paths; users get a pointless re-download or miss an update. It is also the clearest instance of the duplicated-logic problem (see §4).
- **Fix:** reuse `compareVersions` (export it to the renderer, e.g. via a tiny `shared/version.js` loaded by both `index.html` and `require`d by `lib/`) in `store-ui.js`.
- **Effort** S · **Confidence** high

#### M10. Plugins are stopped with SIGTERM only — no escalation, no timeout

- `app/lib/plugins.js:876-894` (`stopAll`), `app/lib/streamdeck-plugins.js:1286-1301`, `app/main.js:1044-1053` (`will-quit`).
- **What:** `proc.kill()` sends SIGTERM and the app exits immediately afterwards without waiting or escalating to SIGKILL.
- **Why it matters:** a plugin that traps or ignores SIGTERM (or is blocked in a native call) survives the app as an orphan holding the plugin WebSocket port and the deck's HID handle — the next launch then reports "Deck busy" and the user has to reboot or hunt in Activity Monitor. Native Stream Deck plugins are exactly the kind of code that installs signal handlers.
- **Fix:** in `will-quit`, send SIGTERM, wait up to ~1.5 s for exit events, then SIGKILL the remainder; the same helper can serve both hosts.
- **Effort** M · **Confidence** medium-high

#### M11. Installing a plugin folder/ZIP has no confirmation, while store install does

- `app/main.js:1457-1470` / `:1472-1486` (`plugins:install-folder` / `install-zip`), `app/renderer/store-ui.js:427-433` (store install `confirm(...)`).
- **What:** the store path warns "Plugins run on your Mac with your user permissions, outside the app sandbox. Only install plugins you trust." The two manual install paths show a file dialog and immediately install, `reload()` and spawn.
- **Why it matters:** installing is code execution by design; the warning exists but is applied inconsistently, which teaches users that the dialog *is* the confirmation. `docs/PLUGINS.md:52` and `:73` carry the warning in prose that most users will never read.
- **Fix:** reuse the same `confirm()` text in both handlers (main-side, before `installAnyPlugin`), so the warning cannot be skipped by a renderer change.
- **Effort** S · **Confidence** high

#### M12. `fetch:site-icon` performs unrestricted outbound requests from the main process

- `app/main.js:1881-1888`, `app/lib/siteicon.js:41-101` (`redirect: 'follow'`, no host filter), `app/renderer/ui.js:418-434`.
- **What:** any `http(s)` URL is fetched (page + up to 8 candidate icons + `/favicon.ico`), following redirects, including `127.0.0.1`, `169.254.169.254` and `*.local`. Only `content-type: image/*` and a 2 MB cap are enforced.
- **Why it matters:** a URL key in an imported or shared profile, plus one click on **Favicon** (or an edit of the URL field, which auto-fetches when the key has no icon — `inspector.js:1339-1342`), gives an attacker a blind SSRF probe against the user's LAN and a way to pull intranet images into a config that is then re-exported.
- **Fix:** resolve the hostname and reject loopback/private/link-local ranges (and `file:`/`data:`), or at minimum refuse redirects to a different host than the one the user typed.
- **Effort** S · **Confidence** high (code) / medium (impact)

---

### Low

#### L1. `Store` is not an `EventEmitter`, so config recovery is silent
`app/lib/store.js:382` (`this.emit?.('recovered')`), class declared at `:281`. Dead notification path. Fix: return a flag from `load()` and toast it in `main.js:865-866`.
**Effort** S · **Confidence** high

#### L2. Plugin file-open helpers use prefix or no containment
`app/main.js:459-461` (`file.startsWith(action.meta.dir)` — a sibling dir named `Foo.ulanziPlugin2` passes), `app/lib/plugins.js:840-846` (`msg.local` → `shell.openPath(path.resolve(meta.dir, url))` with **no** check at all). A plugin already runs code, so this is a capability-widening bug, not a boundary break. Fix: `path.relative` in both places.
**Effort** S · **Confidence** high

#### L3. Marketplace credentials/token can be forwarded across a redirect
`app/lib/market.js:117` (`redirect: 'follow'` on the login POST), `:209` (same for downloads), `:109`/`:208` (token attached by *initial* host only). A 307/308 from `ugc.ulanzistudio.com` would resend the password (login) or the `authToken` header to the redirect target. Fix: `redirect: 'manual'` and re-validate the host on each hop.
**Effort** S · **Confidence** high (code) / low (likelihood)

#### L4. Ulanzi profile import has no size or page cap
`app/lib/import-ulanzi.js:479-497` (`previewProfile` parses every profile found), `:243-267` (`readImage` embeds up to 4 MB per image as base64). A crafted ZIP with many pages × 13 keys can exhaust memory during **preview**, before the user confirms anything. Fix: cap total decoded bytes (e.g. 64 MB) and page count, and abort with a clear error.
**Effort** S · **Confidence** high

#### L5. `app:state` ships the entire config — with every image inlined as base64 — over IPC
`app/main.js:1057-1062`, `app/lib/store.js:345-360` (`_internalize`). Called at startup and after every Ulanzi import (`import-ui.js:155`). With 10 pages of custom icons this is multiple MB of structured clone per call. Fix: return `file:` refs and let the renderer resolve them through a small `icons:image` handler, or send images lazily.
**Effort** M · **Confidence** high

#### L6. The 30-second wide-panel timer redraws the wrong mode
`app/renderer/app.js:1565-1568` calls `renderSystemPanel(canvas)` with **no options**, so it always paints the clock; the 1 s `refreshWideStats` (`:1626`, `ui.js:247-261`) corrects it within a second. Visible as a ≤1 s flicker on `stats`/`blank` pages every 30 s. Fix: delete the 30 s timer (the 1 s one already covers it) or pass `wideOptions(activePage())`.
**Effort** S · **Confidence** high (code) / medium (visible impact)

#### L7. `dialog:pick-image` can reject without a user-visible error
`app/main.js:1713-1725` (`fs.readFileSync(file)` uncaught), `app/renderer/inspector.js:984-988` (`await api.pickImage()` with no catch). Picking an unreadable/removed file yields an unhandled rejection and no toast. Fix: try/catch in the handler, return `{ ok: false, error }`.
**Effort** S · **Confidence** high

#### L8. A failed plugin port bind leaks the HTML-plugin "running" flag
`app/lib/streamdeck-plugins.js:822-832`: `_htmlRunning.add()` happens before the port resolves, and `launch` silently does nothing when `port` is falsy. The plugin then never starts and can never be retried without a reload. Fix: clear `_htmlRunning` in the `else` branch and emit an error.
**Effort** S · **Confidence** high

#### L9. `inspectors` maps are never cleared on reload/stopAll
`app/lib/plugins.js:513-524` and `:876-894`; `app/lib/streamdeck-plugins.js:1222-1237`, `:1286-1301`. Stale sockets for dead actionids accumulate until the iframe closes. Fix: clear both maps next to `sockets.clear()`.
**Effort** S · **Confidence** high

#### L10. No process-level error logging in main
No `process.on('unhandledRejection' | 'uncaughtException')` anywhere in `app/main.js` or `app/lib/*`. Every async lifecycle path (`whenReady().then(...)`, `checkForUpdates`, the protocol handlers) can reject into the void. Fix: two handlers that `console.error` with a timestamp (and optionally append to the existing `streamdeck.log`).
**Effort** S · **Confidence** high

#### L11. `settings.lastPush` is written on every push and then dropped by the schema
`app/renderer/ui.js:532`, `app/lib/store.js:112-124` (whitelist). Verified: `validateConfig({settings:{lastPush:123}}).settings.lastPush === undefined`. Dead state that still lands in `config.json`. Fix: delete the write, or add the field to the schema.
**Effort** S · **Confidence** high

#### L12. Installing, importing or removing one plugin restarts every plugin
`app/lib/plugins.js:573, 589, 598` and `app/lib/streamdeck-plugins.js:1197, 1211, 1219` all return `this.reload()`, which kills every child process and clears every action. A user installing plugin #2 loses the state of plugin #1 (timers, counters, connections) and pays a full respawn storm. Fix: add `reloadOne(uuid)` and use it for single-plugin operations.
**Effort** M · **Confidence** high

#### L13. Committed native binaries are executed by `npm start` and cannot be verified from source
`app/bin/hidseize`, `app/bin/hotkey`, `app/bin/mediakey` (tracked, universal Mach-O), `docs/RELEASE.md` ("committed as universal binaries"). Release builds rebuild them from `native/` (`prepackage` → `scripts/build-helpers.sh`), so published DMGs are fine — but a source-only reviewer or a `npm start` user runs binaries that the repo cannot prove match `native/*.c|.m`. Fix: keep them out of git and make `prestart` build them (or document the SHA-256 of each binary next to its source).
**Effort** S · **Confidence** high

#### L14. The packaged bundle ships tests, scripts, native sources and per-arch helper binaries
`app/package.json:15` (`--ignore='^/(dist|build/icon\.iconset)'` only). Verified in the shipped `app.asar`: `test/` (10 files), `scripts/` (7 files, including `harness.js`), `native/*.c|.m`, `build/helpers/*` (6 binaries, ~175 KB), plus `node-hid`'s hidapi test corpus. Fix: extend `--ignore` to `^/(test|scripts|native|build/helpers|docs)`.
**Effort** S · **Confidence** high

#### L15. CI has no lint, format or type gate; actions are tag-pinned; `ci.yml` has no `permissions:`
`.github/workflows/ci.yml:15-25` (only `node --check` + tests), `:8-13` (no `permissions:` block), `release.yml:19-25` (`actions/checkout@v4`, `macos-latest` floating). Adding `permissions: contents: read` and an ESLint pass is ~30 min and would have caught several Nits below (`no-dupe-keys` finds N1, `no-unused-vars` finds N3).
**Effort** S · **Confidence** high

---

### Nit

#### N1. Duplicate `backgroundThrottling` key in the same object literal
`app/main.js:98` and `:102`. Harmless (last wins) but exactly what `no-dupe-keys` exists for. **Effort** S · **Confidence** high

#### N2. Redundant requires inside functions
`app/main.js:391-392` (`const os`, `const { randomUUID }` re-required inside `listApps`, both already at `:6-7`), `:1435` (`execFileSync` re-required), `app/lib/plugins.js:528-530` and `:584`, `app/lib/streamdeck-plugins.js:1158`. **Effort** S · **Confidence** high

#### N3. Dead code and unused surface
`app/renderer/app.js:177` (`state.draggingBrightness`, never read); `:35` (`ACTION_ICON_PATHS['pop:preset']` is unreachable — `actionIconSrc` only indexes by `action.type` for `pop`; the changelog admits the asset is unused); `app/lib/deck.js:190-197` (`_startReading` is an empty stub, `_stopReading` clears a timer that is never set); `app/preload.js:31` + `app/main.js:1890` (`pickFile`/`dialog:pick-file` — zero call sites); `app/scripts/build-hidseize.sh` (superseded by `build-helpers.sh`); `app/renderer/styles.css` `.emoji-input`/`.emoji-row` (unused). **Effort** S · **Confidence** high

#### N4. Four copies of the media-op table
`app/lib/import-ulanzi.js:102-121` (`MULTIMEDIA` + `SYSTEM_MEDIA_LABELS`), `app/renderer/app.js:142-149` (`MEDIA_EMOJI`), `app/renderer/inspector.js:59-66` (`MEDIA_LABELS`) and again inline at `:184-193`, `:297-304`, `:719-726`. **Effort** S · **Confidence** high

#### N5. Default settings live twice
`app/lib/store.js:263-275` (`createDefaultConfig`) vs `:112-124` (the `validateConfig` whitelist). Adding a setting means editing two places, and `lastPush` (L11) proves they drift. **Effort** S · **Confidence** high

#### N6. CSP could be tighter
`app/renderer/index.html:5-8`: no `object-src 'none'`, no `base-uri 'none'`, and `frame-src` allows bare `file:` although every iframe is `ulanzi-pi:`/`sd-pi:`. **Effort** S · **Confidence** high

#### N7. `plugins.js` uses optional chaining on fields that are always initialised
`app/lib/plugins.js:386-387, 878-881` (`this.htmlRunning?.`) though the constructor sets a `Set` at `:84`; the SD host initialises `_htmlRunning` lazily instead (`streamdeck-plugins.js:823`). Two conventions for the same field. **Effort** S · **Confidence** high

#### N8. `renderChrome()` dereferences `activePage()` without a guard
`app/renderer/ui.js:35` (`title.value = page.name`). `validateConfig` guarantees a page today, so this is latent; `renderInspector` (`inspector.js:462`) already handles the null case. **Effort** S · **Confidence** high

#### N9. Log volume on the hot path
`app/main.js:367-372` logs a line for **every** key down and up (`[deck] key index=… t=… flags=…`), and `:75` logs every dock toggle. On a chatty plugin or a stuck key this fills stdout with no rotation (unlike `streamdeck.log`, which rotates at 1 MB — `streamdeck-plugins.js:918-929`). **Effort** S · **Confidence** high

---

## 4. Duplication map

| Concept | Location A | Location B | Overlap | Consolidation |
| --- | --- | --- | --- | --- |
| Plugin host lifecycle | `lib/plugins.js` (897 lines) | `lib/streamdeck-plugins.js` (1304 lines) | **≈215 lines each** of the same plumbing: `_loadGlobalSettings` (8/8), `_saveGlobalSettings` (9/10), `start` port-retry (38/33), `_send` (12/11), `_flushQueue` (8/8), `restart` (26/26), `reload` (12/16), `install` (51/51), `import` (11/10), `remove` (8/7), `htmlExited` (19/18), `stopAll` (19/16) — ~430 lines, ≈20% of the two files | Extract `PluginHost` (WS server + port retry, spawn/exit/backoff, settings persistence, send/queue, install/import/remove) and keep two thin protocol adapters. Do it *after* Phase 1; the drift is real (`starting` Set exists only in the SD host, `reloadOne` in neither) but a bad base class is worse than duplication. |
| Custom protocols | `main.js:886-915` (`ulanzi-pi`) | `main.js:917-1016` (`sd-pi`) | Same 30-line skeleton twice; the SD one adds the inspector bridge. ~130 lines | `createPluginProtocol({ scheme, manager, transformHtml })` in `lib/plugin-protocol.js`, unit-testable without Electron. |
| HTML plugin windows | `main.js:428-452` | `main.js:520-572` | ~45 lines: map, hidden 420×320 window, `closed` → `htmlExited`, `loadFile().catch(close)`; B adds a 100-try `executeJavaScript` connect loop | One `openHtmlPluginWindow({ meta, connect, onClosed })`. |
| Inspector height bridge | `main.js:806-840` (`PI_THEME` script) | `main.js:967-997` (SD bridge script) | ~65 lines implementing "how tall is this inspector" twice, with **different algorithms** (`measure()` recursion vs child iteration) | One `PI_BRIDGE` string with a `mode` flag. This code has already produced two changelog fixes (0.3.1 height, 0.3.1 collapse) — a single implementation halves the bug surface. |
| PI theme CSS | `main.js:681-726` (`SD_PI_THEME`) | `main.js:728-840` (`PI_THEME`), `styles.css:1084-1100` | The 13-line custom `<select>` arrow block is byte-identical; the scrollbar block is duplicated with/without `!important` | One `pi-theme.css` string + CSS custom properties; keep `styles.css` for the app shell only. |
| MIME tables | `lib/plugins.js:28-35`, `lib/streamdeck-plugins.js:22-41`, `lib/store.js:279`, `lib/import-ulanzi.js:24-31` | `main.js:901-911`, `:1001-1011`, `:1309-1313`, `:1721-1722` | **8 copies**, already inconsistent (only the SD table knows `.mjs`, `.cjs`, `.ttf`, `.wav`, `.mp3`; only the protocol handlers know `.htm`) | `lib/mime.js` with `byExtension()` and `byExtensionImage()`. |
| Grid geometry | `lib/constants.js:14-18` (`COLUMNS/ROWS/KEY_COUNT/WIDE_INDEX/WIDE_SLOT`) | `renderer/app.js:136-140` (`COLS/ROWS/KEY_COUNT=14/WIDE_KEY_INDEX=13`), `renderer/render.js:3-5` (`KEY_SIZE`, `WIDE_INDEX`) | Three definitions of the same 5×3 + wide-key layout; `KEY_COUNT` means 15 in constants and 14 in the renderer | Renderer geometry file emitted from `constants.js` (or passed through `preload`), so the deck and the UI cannot disagree. |
| HTML escaping | `renderer/app.js:206-212` | `renderer/pop.js:4-5` | Identical 6-line `esc()` | `renderer/escape.js` loaded by both pages. |
| Version comparison | `lib/sdcatalog.js:35-53` (numeric) | `renderer/store-ui.js:333` (string), `lib/updates.js:38-40` (wrapper) | Two semantics for "is this newer", one of them wrong (M9) | One shared module used by both processes. |
| Media-op table | `lib/import-ulanzi.js:102-121` | `renderer/app.js:142-149`, `renderer/inspector.js:59-66` + 3 inline copies | 6 ops × (label, emoji) in 6 places | One table in `constants.js`, mirrored to the renderer. |
| Action type registry | `lib/store.js:13-16` (`ACTION_TYPES`) | `renderer/inspector.js:15-21` + `:38-43`, `renderer/app.js:151-169` + `:6-36` | Four lists that must stay in sync when a type is added (labels, groups, trigger subset, icon, validator) | A single registry `{ type: { label, group, icon, triggerable, normalize } }`; the renderer renders from it. |
| Default settings | `lib/store.js:263-275` | `lib/store.js:112-124` | Two hand-maintained lists; `lastPush` already drifted | One `DEFAULTS` object consumed by both. |
| IPC channel names | `main.js` (62 literals) | `preload.js` (63 `invoke` + 20 `subscribe` literals) | Every channel name is typed twice; a typo is a silent `undefined` at runtime | `lib/channels.js` required by both (they are both CommonJS). |

---

## 5. Refactor roadmap

Ordered; each phase is independently shippable.

### Phase 1 — Safety and cheap correctness (≈1 day, low risk)

| # | Item | Effort | Risk | Payoff |
| --- | --- | --- | --- | --- |
| 1.1 | `packDir` allowlist + `path.relative` containment (H2) | S | none | closes the only `rm -rf` primitive |
| 1.2 | Confirm `command` actions on profile import; warn on key tiles (H1) | S | low | removes the document→RCE path |
| 1.3 | Delete `this.status =` in `Deck.connect` (H3) | S | none | fixes a dead-app failure mode |
| 1.4 | `sandbox: true` on both app windows (H4) | S | medium (needs a smoke test) | one-line renderer hardening |
| 1.5 | Route all IPC through `handle()` = `guarded` by default (M1) | S | low | makes the default deny |
| 1.6 | Escape `</script` in the sd-pi bridge payload (M2) | S | none | closes an injection |
| 1.7 | Filter non-object pages + surface "recovered from backup" (M4) | S | none | stops silent total loss |
| 1.8 | `hidseize` watchdog with backoff (M5) | S | low | fixes the documented "types a URL" regression |
| 1.9 | `execFile` for `lsappinfo` + in-flight guard (M6) | S | low | removes 3 s UI stutter |
| 1.10 | Handle `sd-pi-open` + verify `event.source` (M7, M8) | S | none | restores PI links |
| 1.11 | Numeric version compare in the Ulanzi store (M9) | S | none | removes phantom updates |
| 1.12 | ESLint (`no-dupe-keys`, `no-unused-vars`, `no-undef` with the renderer globals declared) + `permissions: contents: read` in CI | S | low | catches N1/N3 and the next typo |
| 1.13 | Dead-code sweep (N3) + `lastPush` (L11) | S | none | ~60 lines gone |

*Dependency:* none. Everything here is local and reversible.

### Phase 2 — Structural seams in `main.js` and shared modules (≈3–4 days, medium risk)

| # | Item | Effort | Risk | Payoff |
| --- | --- | --- | --- | --- |
| 2.1 | `lib/plugin-protocol.js` — one factory for `ulanzi-pi`/`sd-pi` (Duplication #2) | M | low | 130 → 40 lines; testable without Electron |
| 2.2 | `lib/mime.js` (Duplication #6) | S | none | kills 8 copies |
| 2.3 | `lib/channels.js` shared by `main.js` + `preload.js` (Duplication #13) | S | low | typos become load-time errors |
| 2.4 | Extract `main.js` → `ipc/`, `lifecycle/window.js`, `lifecycle/tray.js`, `plugins/wiring.js`, `icons/`, `updates/scheduler.js` | M | medium | 1,893 → ~300-line entry point; each module testable |
| 2.5 | One `PI_BRIDGE` + one PI theme string (Duplication #4, #5) | M | low | one implementation of inspector sizing |
| 2.6 | Action registry (Duplication #11) + one media table (#10) | M | medium | adding an action type becomes one edit |
| 2.7 | `shared/version.js` + one geometry module (Duplication #9, #7) | S | low | removes two classes of drift bug |
| 2.8 | First real tests for the extracted pieces: `plugin-protocol` (traversal, MIME, injection), `packDir` containment, `guarded`/`trustedSender`, `importProfileData` (command detection) | M | none | the security-critical glue finally has coverage |
| 2.9 | `openHtmlPluginWindow` helper (Duplication #3) | S | low | 45 → 15 lines |

*Dependency:* 2.1 and 2.8 should land together (extract + test in the same PR). 2.4 depends on 2.1/2.3.

### Phase 3 — Host consolidation and renderer structure (≈1–2 weeks, higher risk)

| # | Item | Effort | Risk | Payoff |
| --- | --- | --- | --- | --- |
| 3.1 | `PluginHost` base class + two protocol adapters (Duplication #1) | L | **high** | removes ~430 duplicated lines and the drift between hosts; only worth it once 2.8 exists as a safety net |
| 3.2 | `reloadOne(uuid)` so install/import/remove stop restarting every plugin (L12) | M | low | big UX win, independent of 3.1 |
| 3.3 | Renderer: replace the shared global namespace with one explicit store (`state` + `subscribe`/`render`) and ES modules (`<script type="module">`), starting with `esc`/`uuid`/`geometry` | L | high | removes the 73 cross-file global references and the load-order dependency |
| 3.4 | `tsc --checkJs --noEmit` with `// @ts-check` on `lib/` only | M | medium | catches the `this.status` class of bug at author time |
| 3.5 | `npm audit`/Dependabot + a scheduled Electron upgrade job | S | low | keeps the runtime current without manual hunting |

*Dependency:* 3.1 must follow 2.8 (no test net = don't merge two hosts). 3.3 is optional; the app works, so treat it as "when you next touch the renderer".

---

## 6. Quick wins (each < ~30 minutes)

- [ ] `packDir`: allowlist `[A-Za-z0-9._ -]`, reject `..`, and use `path.relative` in `icons:read`/`icons:remove` (H2).
- [ ] Delete `app/lib/deck.js:45` (H3).
- [ ] Remove `sandbox: false` from `main.js:101` and `:1837` (H4).
- [ ] `JSON.stringify(connect).replace(/</g,'\\u003c')` in `main.js:932` (M2).
- [ ] Add `if (data.type === 'sd-pi-open') api.openExternal(data.url)` to `app.js:1463` (M7).
- [ ] `compareVersions` in `store-ui.js:333` (M9).
- [ ] Filter non-object pages in `validateConfig` (M4).
- [ ] Confirm dialog in `plugins:install-folder` / `install-zip` (M11).
- [ ] Warn (and require a checkbox) when an imported profile contains `command` actions (H1).
- [ ] `process.on('unhandledRejection')` + `uncaughtException` → `console.error` (L10).
- [ ] Delete the 30 s wide-panel timer (`app.js:1565-1568`) (L6).
- [ ] `--ignore='^/(test|scripts|native|build/helpers)'` in `package.json:15` (L14).
- [ ] Add `permissions: contents: read` to `ci.yml` (L15).
- [ ] `try/catch` around `fs.readFileSync` in `dialog:pick-image` (L7).
- [ ] Delete `state.draggingBrightness`, `pickFile`/`dialog:pick-file`, `pop:preset`, `build-hidseize.sh`, `.emoji-input`/`.emoji-row` (N3).
- [ ] Remove the duplicate `backgroundThrottling` (N1) and the in-function `require`s (N2).

---

## 7. What is already good (do not refactor away)

- **Preload surface is a fixed API, not a pipe.** 83 named functions (63 `invoke` + 20 subscriptions), no `invoke(channel, …)` escape hatch, `contextIsolation: true`, `nodeIntegration: false` (`preload.js:11-95`, `main.js:96-103`). A compromised renderer cannot reach an arbitrary channel.
- **Navigation is denied, not filtered.** `will-navigate`, `will-redirect` and `setWindowOpenHandler` all refuse anything outside the app page (`main.js:120-140`), with a comment explaining *why* (inheriting the preload bridge). Plugin views get no preload at all.
- **Shell use is deliberate and narrow.** Every action except `command` passes an argv array to `execFile`; `typeText`/`closeApp` build AppleScript through `JSON.stringify` (I checked the escaping — quotes and backslashes round-trip correctly); `openUrl` allowlists `http(s)`/`mailto` and rejects any other scheme (`actions.js:143-155`). The comment at `actions.js:51-55` states the rule, and the code follows it.
- **Protocol handlers set MIME explicitly** (no sniffing), refuse paths escaping the plugin dir, and return `Response` objects rather than `file://` URLs (`main.js:886-1016`). `protocol.handle` is registered inside `whenReady` after `registerSchemesAsPrivileged` at module scope — the correct order.
- **Plugin install is validated where it counts.** Ulanzi: UUID regex + destination containment (`plugins.js:562-571`); Stream Deck: every ZIP entry rejected if absolute or containing `..` (`streamdeck-plugins.js:1159-1164`). And Apple's `unzip` turns out to sanitise `../` itself (verified — see Appendix), so the unvalidated paths are defence-in-depth, not a hole.
- **Marketplace hygiene.** Token attached only for `*.ulanzistudio.com`, `store.json` written `0600`, password never persisted, downloads streamed with a 128 MB cap *and* a post-hoc length check, ZIP magic-byte check, and a `content-type` sanity check before install (`market.js:19-39, 69-79, 203-223`).
- **The updater is notify-only.** HTTPS, 15 s timeout, never executes or unpacks anything, and the release URL goes through the `http(s)` allowlist before `openExternal` (`updates.js:12-36`, `main.js:1119-1125`). This is the right call for an unsigned app.
- **Config durability is genuinely well done.** `tmp` + `rename`, `.bak` before every write, `.corrupt` preserved, images externalised to content-addressed files so `config.json` stays small, pruning that keeps files still referenced by the backup, `path.basename` on `file:` refs so a hand-edited path cannot escape `Images/`, parent-cycle and cross-profile-parent repair, and "every profile owns a page" (`store.js:324-470, 175-208`). Very few hobby apps get this right.
- **Plugin resilience.** Port fallback when Ulanzi Studio owns 3906 (`plugins.js:217-228`), exponential crash backoff capped at 5/minute with a give-up message, message queue flushed on connect, `forceRefresh` for plugins that only fetch on settings change, single-flight spawn guard in the SD host (`streamdeck-plugins.js:838-839`) — and a test for it.
- **Renderer discipline in the small.** Consistent `esc()` on every interpolated `innerHTML` (I checked all ~60 sites; the unescaped ones are numbers and constants), a bounded LRU image cache with recency refresh (`render.js:7-33`), `state.pushing`/`pushAgain` to serialise pushes, press timers cleared on navigation (`ui.js:627-635`), and a focus-trapped modal system with `aria` roles.
- **Tests assert behaviour, not smoke.** `store.test.js` checks image pruning across two saves and backup retention; `streamdeck.test.js` checks the double-spawn regression and the empty-`setImage` fallback; `plugins.test.js` checks that a `../../` UUID is rejected. These are the right tests.
- **Release discipline.** `release.yml` runs `npm test` *before* packaging, publishes `SHA256SUMS.txt`, and its release notes tell the user exactly what the quarantine step is. CI runs a syntax check across every JS file.

---

## 8. Appendix

### 8.1 What I read / ran

- **Read in full:** `app/main.js` (1,893), `app/preload.js`, `app/pop-preload.js`, all 14 `app/lib/*.js`, all 10 `app/renderer/*.js`, `app/renderer/index.html`, `app/renderer/pop.html`, `app/package.json`, all 10 `app/test/*.test.js`, `.github/workflows/{ci,release}.yml`, `app/scripts/{install,make-dmg,build-helpers,build-hidseize,after-package}.sh`, `app/scripts/{harness,watch-temp-zips}.js`, `README.md`, `CHANGELOG.md`, `docs/{RELEASE,ROADMAP,PLUGINS}.md`.
- **Ran:** `git log --oneline -30`, `git status`, `git ls-files`, `npm test` (46/46 pass, 841 ms), `npm audit` (5 moderate, dev-only), `npm ls --all`, `node -p "require('electron/package.json').version"` (45.1.0), `node --check` (via CI parity), `asar.listPackage` on the shipped `app.asar`, `file app/bin/*`.
- **Evaluated in node (no writes):** `packDir('app:..')` → app data dir; `JSON.stringify(inspectorConnect-payload)` contains a raw `</script>`; `validateConfig({pages:[null]})` throws `TypeError`; `validateConfig` drops `settings.lastPush`.
- **Not run:** the app itself, any network call to Ulanzi/GitHub, anything under `~/Library/Application Support`.

### 8.2 Deliberately *not* flagged (and why)

- **ZIP-slip in `plugins.install`, `import-ulanzi.extractProfileZip`, `store:install-icons`.** I built a ZIP with a `../evil.txt` entry and one with a symlink to `/tmp` and extracted both with the system `unzip` (`UnZip 6.00 … with modifications by Apple`). The traversal entry was written as `out/evil.txt` (sanitised), and the symlink was refused ("symlink error: Permission denied"). So these three `unzip -oq` call sites are **not** traversal vectors on macOS. I still recommend copying the entry validation from `streamdeck-plugins.js:1159-1164` into them for parity — that is why it appears only as context in §7, not as a finding.
- **Prototype pollution via `mergePatch` (`streamdeck-plugins.js:48-56`).** A `__proto__` key from `JSON.parse` is an own property; `out[key] = …` sets the prototype of the freshly spread object, never `Object.prototype`. Not exploitable. (`Object.fromEntries` and object spread both use `CreateDataProperty`.)
- **XSS in the renderer.** I checked every `innerHTML` template (≈60) for unescaped interpolation. Everything user/plugin/remote-sourced goes through `esc()`; the rest are numbers, `Math.*`, fixed option lists, or `toast()` (which uses `textContent`). I found **no** renderer XSS, which is why H2 is rated High rather than Critical.
- **AppleScript injection in `typeText` / `closeApp` / `runHotkey`.** `JSON.stringify` escaping of `"` and `\` is sufficient for AppleScript string literals, and the key-code/ modifier tables are closed sets. No finding.
- **`command` actions from *imported Ulanzi* profiles.** `mapAction` (`import-ulanzi.js:152-239`) has no branch that produces `type: 'command'`, so the Ulanzi import path cannot inject shell. The RCE path (H1) is only the app's own `.ulanzideckprofile` format.
- **`app/assets` vs `app/renderer/assets` duplication.** There is no `app/assets` directory; only `app/renderer/assets` (29 SVGs + brand.png). The alleged duplication does not exist.
- **Electron EOL.** Electron 45.1.0 is installed and pinned by `package-lock.json`. I did not assert a support status because I could not verify the release calendar from the repo; the actionable point is that there is no Dependabot/renovate config (`.github/` contains only `workflows/`), which is listed under L15/Phase 3.5.
- **`.DS_Store` in the bundle.** Three `.DS_Store` files exist in the working tree but are gitignored, and the shipped `app.asar` contains none. Not a finding.
- **The 1.3 GB `app/dist/` tree.** Gitignored build output from a 0.1.0 local package; not part of the source and not shipped by CI. Ignored except as the source of the asar evidence in L14.
- **`store:install-rosetta` spawning `osascript`.** The command string is a compile-time constant with no interpolation, so there is no injection; the behaviour (opening Terminal to run `softwareupdate`) is intentional and documented in the UI tooltip.
- **`connect-src` / `webSecurity`.** Not set, i.e. defaults are correct (`webSecurity: true`, no insecure content). No finding.
