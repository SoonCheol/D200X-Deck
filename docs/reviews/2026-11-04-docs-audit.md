# Documentation audit — 2026-11-04

## Summary

The Node/Electron documentation is largely accurate through 0.15.0: version, build and
package scripts, the release workflow, protocol framing, plugin paths and relative links
all check out. The highest-impact problems are a Python quick start that fails on a fresh
clone and a protocol reference that omits the shipped `0x0d` incremental-key protocol.
The README's first image was also a 0.12.0 screenshot; it has since been recaptured
from 0.15.0 (see Resolution). The remaining findings are status/UI-label drift and a few
small reference errors.

## Findings

### 1. README's Python quick start fails, and the package is not documented as installable

- Severity: High
- Where: `README.md:223,259-260`, `examples/hello.py:8-10`, `pyproject.toml:5-17`
- Evidence: `README.md:259-260` documents
  `python3 -m venv .venv && .venv/bin/pip install pillow && .venv/bin/python examples/hello.py`.
  Running the script from the repository root fails before Pillow is needed (the venv
  interpreter behaves the same because `sys.path` is derived from the script path):

  ```
  $ python3 examples/hello.py
  Traceback (most recent call last):
    File "examples/hello.py", line 8, in <module>
      from ulanzi_deck import protocol as P
  ModuleNotFoundError: No module named 'ulanzi_deck'
  ```

  Python adds the script's directory (`examples/`), not the repository root, to
  `sys.path`. The README never says to install the package (there is no
  `pip install -e .`), and `pyproject.toml` is not referenced anywhere in the README or
  docs.
- Problem: The only documented way to run the Python prototype does not work from a
  fresh clone, while the layout and `pyproject.toml` make the package look maintained
  and installable.
- Fix: The import failure is fixed by `PYTHONPATH=.` (verified: `PYTHONPATH=. python3
  examples/hello.py` gets past the import and then fails at
  `ModuleNotFoundError: No module named 'PIL'` because Pillow is not installed in this
  sandbox). Use
  `python3 -m venv .venv && .venv/bin/pip install pillow && PYTHONPATH=. .venv/bin/python examples/hello.py`,
  or document an editable install with `pip install -e '.[render]'`. The editable
  install is **unverified** here: the sandbox has no network, Pillow or setuptools, so
  pip cannot resolve/build it.

### 2. Protocol reference omits the 0x0d incremental key frame

- Severity: High
- Where: `docs/PROTOCOL.md:45-57`, `app/lib/protocol.js:13`, `app/ipc.js:144-145`,
  `CHANGELOG.md:24`
- Evidence: The command table in `docs/PROTOCOL.md:47-57` lists `0x00/0x01`,
  `0x00/0x03`, `0x00/0x06`, `0x00/0x0A`, `0x00/0x0B`, `0x00/0x1A`, `0x01/0x01`,
  `0x03/0x03` and `0x03/0x0A`, but no `0x0d`. The app defines `KEY: 0x0d` at
  `app/lib/protocol.js:13`, sends it through `buildKeyUpdate()`/`deck.pushKey()` at
  `app/ipc.js:144-145`, and 0.14.0 describes it as the shipped incremental path:
  “Live plugin and command-output keys now use the D200’s incremental protocol
  (`0x0d`).” (`CHANGELOG.md:24`).
- Problem: Anyone implementing the protocol from `docs/PROTOCOL.md` will not know that
  single-slot updates exist or what their payload is. This is the protocol the app uses
  for every live plugin/command-output key.
- Fix: Add a row such as `0x00 | 0x0d | → device | incremental single-key update | ZIP
  with one slot (manifest.json + Images/<sha1>.png)`, and note the full-page fallback.

### 3. README and RELEASE disagree about media-key permissions

- Severity: Medium
- Where: `README.md:170-172`, `docs/RELEASE.md:101-103`, `app/native/mediakey.m:54`
- Evidence: `README.md:172` says “Media keys use a native helper and need no
  permission.” `docs/RELEASE.md:102` says the app needs “**Accessibility**
  (hotkeys/text/media keys)”. The helper posts events with
  `CGEventPost(kCGHIDEventTap, …)` (`app/native/mediakey.m:54`), and the action path
  launches it with `stdio: 'ignore'` (`app/lib/actions.js:314-320`), so a permission
  failure would not surface as a readable error.
- Problem: Users cannot tell whether to grant Accessibility for media keys, and
  troubleshooting advice differs depending on which document they read. This report
  does not assert which statement is correct; that needs a clean-account test.
- Fix: Replace both assertions with wording that is true either way, for example:
  “Media keys use the native `mediakey` helper. If a media key does nothing, grant
  Accessibility and relaunch.” Move the exact requirement to the follow-up test.

### 4. README project layout is stale and misplaces core files

- Severity: Medium
- Where: `README.md:209-225`, `app/main.js:196,747`, `app/ipc.js`,
  `app/plugin-hosts.js`, `app/lib/plugin-host.js:54-55`, `app/lib/plugins.js:7,41`
- Evidence: `README.md:211` describes `main.js` as “window, IPC, tray-less lifecycle”,
  but `main.js` has no IPC handlers:

  ```
  $ grep -c ipcMain app/main.js app/ipc.js
  app/main.js:0
  app/ipc.js:4
  ```

  `main.js` also creates a Tray at `app/main.js:196` and calls `createTray()` at `:747`.
  The layout omits `ipc.js`, `plugin-hosts.js` and
  `lib/plugin-host.js`. `README.md:219` calls `lib/plugins.js` the “Ulanzi plugin host
  (spawn, WebSocket, images)”, but its class extends `PluginHost`
  (`app/lib/plugins.js:7,41`) and the shared lifecycle lives in
  `app/lib/plugin-host.js:54-55` (“the WebSocket server and port fallback,
  spawn/exit/backoff…”).
- Problem: A contributor following the tree looks for IPC in `main.js` and for the
  plugin lifecycle in `plugins.js`, and will not find the files that now own those
  responsibilities.
- Fix: Update the layout to include `ipc.js`, `plugin-hosts.js` and
  `lib/plugin-host.js`; describe `main.js` as window/tray/menu-bar lifecycle and the two
  plugin files as protocol adapters.

### 5. Plugin docs describe labels and fallbacks that changed

- Severity: Medium
- Where: `docs/PLUGINS.md:114-115,231,254-255,266-267`, `README.md:202-203`,
  `app/lib/streamdeck-plugins.js:235-241`, `app/renderer/pickers.js:394`,
  `app/renderer/inspector.js:1367-1370`, `app/renderer/index.html:61`,
  `CHANGELOG.md:373,469`
- Evidence:
  - `docs/PLUGINS.md:266-267` says unsupported Windows-only plugins “show **Not
    supported**”; the label is now effectively unreachable for a listed plugin:
    `app/renderer/pickers.js:394` only uses `'Not supported'` when `compatReason` is
    empty, and `app/lib/streamdeck-plugins.js:235-241` always sets “Needs Rosetta” or
    “No compatible code for this Mac” when the plugin is incompatible
    (`CHANGELOG.md:373`). The README
    (`README.md:202-203`) tells users to look for the label that no longer appears.
  - `docs/PLUGINS.md:114-115` and `254-255` say actions without an inspector “fall back
    to the JSON editor” / “settings are edited as JSON”. The JSON editor still exists,
    but only behind an **Advanced: edit settings JSON** disclosure
    (`app/renderer/inspector.js:1367-1370`, `CHANGELOG.md:469`); the docs should say it
    moved behind that disclosure, not that it is a plain fallback.
  - `docs/PLUGINS.md:231` says “Click **Plugins** in the sidebar”, but the sidebar item
    is labelled **Installed** (`app/renderer/index.html:61`).
- Problem: These are the strings and locations users are pointed to when a plugin
  misbehaves; two of them no longer match the UI.
- Fix: Replace “Not supported” with the real reason strings, describe the settings
  disclosure, and change “Plugins” to “Installed”.

### 6. Roadmap still presents shipped work as next and has contradictory status text

- Severity: Medium
- Where: `docs/ROADMAP.md:3-14,129,213-227,336,392,410-421`
- Evidence: The status block is dated 2026-11-02 (`docs/ROADMAP.md:3`) even though the
  file records a 0.15.0 section at `:213` (dated 2026-11-03 in `CHANGELOG.md:3`).
  `:223-227` says “### Next: store detail
  polish / M27”, while the same file says “Shipped in 0.11.4 — store detail polish
  (M27)” at `:129`. It also presents `PLAN-0.10.0.md` as a current triage that “lists
  what remains” (`:13-14`), but that plan is marked shipped and is historical. The same
  file marks Soundboard “done” at `:336,392` and defers it to v3 at `:410-421`.
- Problem: The roadmap's “next” item is already released, a historical plan is
  presented as current, and Soundboard is both done and deferred. A contributor cannot
  tell what is actually left.
- Fix: Update the status date/version, replace “Next” with the real remaining 1.0 items,
  reword the `PLAN-0.10.0` line as historical, and clarify Soundboard as “`sound` action
  done; Soundboard multi-action deferred”. Do not rewrite `docs/PLAN-0.10.0.md` itself.

### 7. Action-model design record contradicts its own implementation status

- Severity: Medium
- Where: `docs/ACTION-MODEL-V2.md:3-8,24,158,171-174`, `CHANGELOG.md:308-309`,
  `docs/ROADMAP.md:39-43`, `app/lib/actions-meta.js:25,45`
- Evidence: The header says “implemented … Soundboard and press triggers are now live”
  (`docs/ACTION-MODEL-V2.md:3-5`). The `sound` action is live
  (`app/lib/actions-meta.js:25,45`; play/stop audio is listed as done), but the
  Soundboard feature is deferred in the same
  document's feature table and phases (`:24,158`) and in its own next sentence (`:8`).
  The status section also still says “**Then (v2.2)** — `multi` … and `toggle`” and
  “**Then (v2.3)**” (`:171-173`), even though Multi/Toggle and the step editor shipped
  in 0.10.0 (`CHANGELOG.md:308-309`, `docs/ROADMAP.md:39-43`).
- Problem: The document is labelled as an implemented record but describes v2.2/v2.3 as
  future work and claims the deferred Soundboard is live.
- Fix: Change the header sentence to “the `sound` action and press triggers are now
  live” and leave the feature table's Soundboard v3 entry alone; update the later status
  lines to mark v2.2/v2.3 done (or label that section historical).

### 8. README hero screenshot is from 0.12.0

- Severity: Medium
- Where: `README.md:8`, `docs/screenshots/main.png`
- Evidence: `README.md:8` embeds `docs/screenshots/main.png` as the first image. The
  image's footer reads `v0.12.0 · MIT`, and it shows the old emoji sidebar icons, the
  old toolbar and the old type scale. 0.15.0 changed the sidebar/toolbar icons, type
  scale and inspector (`CHANGELOG.md:6-10`). The PNG is 1600×900
  (`file docs/screenshots/main.png`).
- Problem: The first image on the README misrepresents the current app and hides the
  layout/icon work that defined 0.15.0.
- Fix: Recapture it from a GUI Terminal with `cd app && npm run readme-screenshot`
  (`app/scripts/readme-screenshot.sh:9-14` uses the demo config, `ULANZI_SIZE=1600x900`
  and the README path), or temporarily caption it as an older screenshot. This audit did
  not regenerate it.

### 9. Python package metadata and protocol constants are stale

- Severity: Low
- Where: `pyproject.toml:5-11`, `ulanzi_deck/__init__.py:8`,
  `ulanzi_deck/protocol.py:23`, `app/lib/protocol.js:13,18`, `README.md:223`
- Evidence: `pyproject.toml:7` and `ulanzi_deck/__init__.py:8` report version `0.0.1`
  while the app and release are 0.15.0. `pyproject.toml` has no `readme`, authors or
  project URLs (`:5-11`), so its published metadata would be sparse and unattributed.
  `ulanzi_deck/protocol.py:23` defines `CMD_KEY_EVENT = 0x00` while the app uses
  `CMD.KEY_EVENT = 0x01` (`app/lib/protocol.js:18`); grep shows the Python constant is
  defined but never used anywhere in the package. There is also no `PROTO_KEY = 0x0d`
  equivalent to `app/lib/protocol.js:13`. The README lists `ulanzi_deck/` among the
  maintained files (`README.md:223`).
- Problem: This is not a live bug because the constant is unused, but anyone who reuses
  these constants gets the wrong `cmd` value and no incremental-key support, and the
  package metadata/version look maintained without complete published metadata.
- Fix: Either align the package with the app (version, correct constants, `PROTO_KEY`,
  readme/authors/URLs) or explicitly mark it as a frozen prototype and stop listing it
  as a maintained component.

### 10. PLUGINS limitations still say fixed port 3906 and omit the OpenAction store

- Severity: Low
- Where: `docs/PLUGINS.md:55-65,175,268-269,273-274`,
  `app/lib/plugin-host.js:242-246,254`,
  `app/renderer/index.html:418`, `app/lib/sdcatalog.js:13`, `CHANGELOG.md:582`
- Evidence: `docs/PLUGINS.md:175` says “The app runs a WebSocket server on
  `127.0.0.1:3906`”, and `:268` says “Ulanzi plugins use port 3906”; the host actually
  retries the next port on `EADDRINUSE` (`app/lib/plugin-host.js:242-246`) up to 20
  attempts (`:254`), and 0.3.1 documents the fallback to 3907/3908
  (`CHANGELOG.md:582`). The same limitation then says “Quit Ulanzi Studio/other deck
  software if a port is busy” (`:269`), which contradicts the documented retry.
  Separately, `:273-274` says “Plugin catalogues/store fronts from OpenDeck/Elgato are
  not built in; use Install folder/ZIP or the Ulanzi Store.” That statement about
  OpenDeck/Elgato is true, but it omits the built-in **Store → OpenAction Plugins** tab
  documented at `:55-65` (`app/renderer/index.html:418`,
  `app/lib/sdcatalog.js:13`).
- Problem: A plugin author who hard-codes 3906 can fail even though the host supports a
  fallback, and users are not told that the OpenAction catalogue is available in-app.
- Fix: Say “3906, falling back to the next free port; plugins must use the port passed
  on the command line” and add the built-in **Store → OpenAction Plugins** tab to the
  limitation's alternatives.

### 11. PROTOCOL says the app does not bake titles, contradicting the README and the writer

- Severity: Low
- Where: `docs/PROTOCOL.md:136-137`, `README.md:72-73`, `app/lib/page.js:30,49,70`,
  `app/renderer/render.js:291-295,379`
- Evidence: `docs/PROTOCOL.md:136-137` says “The `Text`/`Font` fields make the
  **device** draw a text overlay (the app does not bake the title into the image).”
  `README.md:72-73` says “what you see is what the deck shows (labels are rendered into
  the images)”, and this app's page writer sends `Text: ''` for every key
  (`app/lib/page.js:30,49,70`), so the label has to be baked into the PNG. The renderer
  decides to draw it at `app/renderer/render.js:291-295` and calls `ctx.fillText` at
  `:379`.
- Problem: The protocol notes describe the vendor app's text handling but are easy to
  read as describing this app, and they contradict the README.
- Fix: Attribute the sentence to Ulanzi Studio, then note that this app bakes titles and
  sends `Text: ''`.

### 12. Capture README references files that are not in the repository

- Severity: Low
- Where: `docs/captures/2026-10-31-wide-key/README.md:28-31,76-77`
- Evidence: `:29-30` says “Examples are in `proto13-2_1.json`, `proto13-3_1.json`,
  `proto13-4_1.json`”, but the directory contains only `README.md`; `:76-77` says the
  vendor-generated files “are not committed”.
- Problem: The links are dangling by design, so a reader cannot inspect the examples
  the notes point to.
- Fix: Remove the filenames and describe the captured shape, or commit/attach sanitised
  samples and keep the references.

### 13. PLUGINS says read-only plugins are shown with 🔒

- Severity: Low
- Where: `docs/PLUGINS.md:18-20,153,271-272`, `app/renderer/pickers.js:397-399`
- Evidence: The source table says “read-only, shown with 🔒” (`:18-20`), the Installed
  list says “read-only 🔒” (`:153`), and the limitation says “shown with 🔒” (`:271-272`).
  In 0.14.0 the plugin badge was `🔒 Read-only`
  (`git show v0.14.0:app/renderer/pickers.js`, line 398), but the 0.15.0 code renders
  just “Read-only” (`app/renderer/pickers.js:397-399`). Icon packs still use
  `🔒 Ulanzi` (`app/renderer/pickers.js:305`), so that icon-pack reference is not
  stale.
- Problem: The docs send users looking for a lock glyph that the plugin list no longer
  renders.
- Fix: Say “Read-only” for plugin rows and drop the emoji there; leave the icon-pack
  wording alone unless it also needs a product decision.

### 14. One remaining stale emoji claim; no 0.15.0 UI glyphs remain

- Severity: Low
- Where: `docs/ACTION-MODEL-V2.md:165-166`, `CHANGELOG.md:254`
- Evidence: `docs/ACTION-MODEL-V2.md:165-166` still says “Choosing a media key pre-fills
  the key emoji (⏯️ ⏭️ ⏮️ 🔊 🔉 🔇)”, but 0.10.5 says “Default action faces no longer
  use emojis. POP, timer, brightness, audio, command, hotkey, close, media, page and
  empty text now use their bundled SVGs” (`CHANGELOG.md:254`).
- Problem: This is the only additional stale emoji/UI reference found outside the
  historical changelog and reviews; it describes behaviour removed in 0.10.5.
- Fix: Remove the sentence or replace it with “Media key faces use the bundled SVG
  unless the key has a custom emoji.”

## Checked and correct

- Line numbers re-checked against commit `32bac0e` after the 0.15.0 edits: no cited line
  shifted (README 269 lines, CHANGELOG 706, ROADMAP 432, PLUGINS 321, PROTOCOL 179).
- Python import failure reproduced; `PYTHONPATH=.` gets past the `ulanzi_deck` import but
  the script then needs Pillow. The editable-install fix is unverified because this
  sandbox has no network, Pillow or setuptools.
- Tray verified: `app/main.js:196` creates it and `:747` calls `createTray()`; the
  “tray-less” description is wrong.
- “Not supported” fallback verified effectively unreachable:
  `app/renderer/pickers.js:394` uses it only when `compatReason` is empty, and
  `app/lib/streamdeck-plugins.js:235-241` always supplies a reason for incompatible
  plugins.
- Screenshot verified as 1600×900 with the footer `v0.12.0 · MIT`; it was not
  regenerated.
- Emoji sweep: no `🔌`, `🛍`, `⚙`, `🖼` or `⟳` remain in current-facing README/docs;
  `⚙`/`🔌` occur only in historical `CHANGELOG.md` entries and old reviews. Beyond the
  media-key emoji in finding 14 and the read-only `🔒` in finding 13, no other emoji
  references remain in current-facing docs.
- Version chain: `app/package.json` / `app/package-lock.json` / `v0.15.0` tag /
  `CHANGELOG.md` top section all agree on 0.15.0.
- Toolchain numbers: Node engine `>=22.13.0`, Electron 45.2.1, ESLint 10.14.0 and
  `ws` 8.22.1 match the changelog and `package.json`.
- Tests: `cd app && npm test` reports **284 tests, 282 pass, 2 skipped**; this matches
  the 0.15.0 wording “282 passing, plus two … skipped”. `npm run lint` and
  `npm run typecheck` also pass.
- Build/install commands and paths: `npm start`, `npm run package`, `package:all`,
  `install-app`, `make:dmg`, `dist/Ulanzi Deck Open-darwin-*` and
  `dist/Ulanzi-Deck-Open-<version>.dmg` all match the scripts.
- Release workflow: workflow name `Unsigned DMG`, `v*` and `workflow_dispatch` triggers,
  `npm ci`, test/lint/typecheck, `package:all`, `make:dmg`, `SHA256SUMS.txt`, DMG
  artifact and tag-only release all match `docs/RELEASE.md`.
- CI: job `test`, Node 22, `npm ci --ignore-scripts`, syntax check, lint, typecheck and
  tests match `.github/workflows/ci.yml`.
- Dependabot: npm weekly with minor/patch grouping and GitHub Actions monthly match
  `.github/dependabot.yml`.
- Protocol basics: frame magic/length/padding, 1025-byte host reports, 1024-byte device
  reports, key payload `01 <index> 01 <state>`, slot `3_2`/index 13, 402×196 wide key,
  `SmallViewMode` 1/0/2, and the `0x06`/`0x0A`/`0x0B`/`0x1A` payloads match the code.
- Plugin docs: source directories, spawn arguments, key-down/key-up order, property
  inspector schemes, image handling, Ulanzi/Stream Deck message tables and the
  `392 px` icon downscale match the implementation.
- Links/assets: all relative Markdown links in `README.md`, `docs/*.md`, the plans and
  the historical reviews resolve; `docs/screenshots/main.png` and the icon-option
  assets exist. The single external Markdown link (`crates.io/crates/openaction`) is
  unverified because the sandbox has no DNS.
- Release skill: preflight gates, version bumps (both package-lock fields), changelog
  header, tag/push order, asset names and local install/verification commands match the
  workflows and `app/scripts/*`.
- Icon-options README: app/tray asset names and the documented 18 px + `@2x` sizes
  match `app/build/tray*.png`.

## Out of scope / follow-ups

- Test on a clean macOS account whether media keys actually require Accessibility, then
  write that answer once and link it from both README and RELEASE.
- Decide whether the Python prototype should be maintained, versioned with the app, or
  removed; verify an editable install (`pip install -e '.[render]'`) in an environment
  with network access before documenting it.
- Do not rewrite `docs/PLAN-0.10.0.md`; it is a historical plan record. Only the roadmap
  should be brought forward.
- Screenshot regeneration needs a GUI session; it was performed afterwards from a GUI
  Terminal and is included in this commit.
- Historical audit records in `docs/reviews/` were treated as records, not re-judged.
  Their internal findings were not reassessed; only their links and the roadmap's
  characterisation of them were checked.

## Resolution (2026-11-04)

Fixed in this commit:

- **1** — README quick start now uses the verified `PYTHONPATH=.` form, and the layout
  describes `ulanzi_deck/` as a prototype the app does not use. The package itself is
  unchanged; whether to maintain it remains a product decision.
- **2** — `docs/PROTOCOL.md` documents `0x00/0x0d` and the full-page fallback.
- **3** — README and RELEASE now give the same media-key wording; neither asserts that
  a permission is or is not required.
- **4** — README project layout lists `ipc.js`, `plugin-hosts.js` and
  `lib/plugin-host.js`, and describes `main.js` and the plugin adapters correctly.
- **5**, **13** — PLUGINS and README use the current **Installed** label, the real
  compatibility reason strings, the **Advanced: edit settings JSON** disclosure and
  **Read-only** plugin rows.
- **6** — ROADMAP status is 0.15.0 / 2026-11-03, the 1.0 next items replace the
  shipped M27 section, `PLAN-0.10.0.md` is marked historical, and the Soundboard text
  distinguishes the shipped `sound` action from the deferred multi-action.
- **7**, **14** — ACTION-MODEL-V2 marks v2.2/v2.3 done, limits the header claim to the
  `sound` action, and describes media-key faces as using the bundled SVG.
- **10** — PLUGINS describes the port fallback, removes the “quit if busy” advice and
  mentions the **Store → OpenAction Plugins** tab.
- **11** — PROTOCOL attributes the device-drawn title to Ulanzi Studio and notes that
  this app bakes titles and sends `Text: ''`.
- **12** — the wide-key capture README describes the incremental ZIP shape instead of
  naming uncommitted files.
- **8** — `docs/screenshots/main.png` was recaptured at 1600×900 from 0.15.0 with
  `npm run readme-screenshot`, so the README now shows the current icons, toolbar and
  type scale.

Still open:

- **3 (permission test)** — whether media keys require Accessibility has not been
  answered on a clean account, so the docs keep the conditional wording.
- **9** — the Python package's version, metadata, `CMD_KEY_EVENT` value and missing
  `PROTO_KEY` are untouched pending the maintain/remove decision.
