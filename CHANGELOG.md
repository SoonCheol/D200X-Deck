# Changelog

## 0.13.4 — 2026-11-03

### Changed
- **Tile controls are labelled.** The colour picker for the top bar is now labelled **Accent bar**, and the glyph colour picker is labelled **Glyph colour**, so they are no longer confused with each other. Size fields now say **Size** with tooltips explaining that blank means automatic.

### Tests
- 270 passing, plus one opt-in Electron smoke test that is skipped without a GUI session.

## 0.13.3 — 2026-11-03

### Added
- **Tile glyph colour.** Tile glyphs can use their own colour, with a reset link back to white. Contributed by @marcelopazzo in #9.

### Changed
- **Tiles without a glyph centre and enlarge their title**, using the empty glyph area instead of leaving a gap. Contributed by @marcelopazzo in #8.

### Fixed
- The **Reset glyph colour** link appears as soon as a colour is picked.

### Tests
- 267 → **270** passing, plus one opt-in Electron smoke test that is skipped without a GUI session.

## 0.13.2 — 2026-11-03

### Changed
- **Tile glyphs accept up to 40 characters** instead of 8. Short words and numbers can be the main tile line; automatic sizing still shrinks them to fit.

### Tests
- 267 passing, plus one opt-in Electron smoke test that is skipped without a GUI session.

## 0.13.1 — 2026-11-03

### Added
- **Tile text size controls.** Glyph, title and subtitle now have optional pixel-size fields in the inspector. Leave a field blank for automatic sizing; automatic text also shrinks to fit instead of being cut off.

### Tests
- 266 passing, plus one opt-in Electron smoke test that is skipped without a GUI session.

## 0.13.0 — 2026-11-03

### Added
- **Native tile key face.** Choose **Tile** in the inspector to draw a coloured accent bar, glyph, title and subtitle directly on the key. Text is stored in `config.json`, so script-generated profiles stay small and editable instead of embedding a PNG per key.
- **Reload results are logged.** `--reload-config` and the File menu append `OK` or `FAIL` with the config path and error to `~/Library/Logs/Ulanzi Deck Open/reload.log`.
- **Failed commands flash and log.** A non-zero command exit flashes the key red, shows the last stderr line as a toast, and writes the full stderr to `~/Library/Logs/Ulanzi Deck Open/commands.log`.
- **Replace-import keeps page IDs.** Replacing a same-name profile preserves the imported page IDs when they do not collide with another profile, so script-generated profiles can be regenerated and reimported instead of patching key by key.

### Fixed
- Tile fields are normalised and persist through save/load; command-failure metadata stays tied to the key that ran it.

### Tests
- 259 → **266** passing, plus one opt-in Electron smoke test that is skipped without a GUI session.

## 0.12.0 — 2026-11-03

### Added
- **Custom app links.** `slack://`, `zoommtg://` and `linear://` open directly; other schemas ask once per app session. Local files and script schemes remain blocked.
- **Command output on keys.** A shell command can refresh a key every 5–86 400 seconds with text, a data URL, raw SVG or a PNG/JPG/WebP/SVG file path. Pressing the key refreshes it once, without running the command twice.
- **Reload config from disk.** Use **File → Reload Config from Disk** or `open -n -a "Ulanzi Deck Open" --args --reload-config`. Invalid files are copied to `config.json.rejected` and never replace the running config.
- **Replace a profile on import.** Importing a profile with an existing name offers Replace, Import as copy, or Cancel.
- **Script-friendly quit.** `--quit` and SIGTERM skip the confirmation and flush pending config saves first.

### Fixed
- **Finder/Spotlight launches now use the login shell’s PATH**, so Homebrew tools and user scripts work from command actions. Login banner/logout output is ignored.
- **Command output settings are bounded and imported profiles cannot start timers.** The user opts in after reviewing an imported command.
- **Duplicate profile/page IDs are repaired on load**, and importing duplicate page IDs is rejected.
- **Image output paths are size-checked before reading** and symlinked images work.
- **Reloading while the deck sleeps or is locked no longer wakes or unlocks it**, and it applies brightness, sleep, launch-at-login and standby settings.
- Store covers under `/static/` resolve against the main site, with a screenshot fallback.

### Tests
- 240 → **259** passing, plus one opt-in Electron smoke test that is skipped without a GUI session.

## 0.11.6 — 2026-11-03

### Changed
- **The store tab is now “OpenAction Plugins”.** The tab has always listed the OpenAction registry, and every row is already tagged OpenAction, so the old “Stream Deck Plugins” name described the SDK rather than the source. The subtitle, search placeholder, loading/empty copy and documentation follow the same name.
- “Stream Deck / OpenAction” is retained where it describes plugin compatibility, such as the Installed list and inspector groups.

### Tests
- 240 passing, plus one opt-in Electron smoke test that is skipped without a GUI session.

## 0.11.5 — 2026-11-03

### Fixed
- **Store covers hosted under `/static/` now load.** Legacy listings such as Nanoleaf point at the main Ulanzi site rather than the UGC asset host, so their icons were broken.
- **A stale store cover falls back to the listing’s first screenshot**, then to the placeholder, instead of showing a broken image.
- **Plugin listings without a downloadable package say “No download”** instead of the misleading “Not a plugin”.

### Tests
- 238 → **240** passing, plus one opt-in Electron smoke test that is skipped without a GUI session.

## 0.11.4 — 2026-11-03

### Changed
- **The store detail now helps you decide whether to install.** Screenshots from the listing appear above the description, with a thumbnail strip; the metadata row shows category, installed/update state, installed version, download size, downloads and stars.
- **Back sits at the top-left** of the detail view instead of floating at the far right.
- **The raw plugin ID is now a collapsible disclosure**, and long descriptions replace the one-line summary when the listing provides one.

### Fixed
- **Installed plugins with a newer store version can be updated from the detail view.** The button previously stayed disabled as “Installed”.

### Tests
- 234 → **238** passing, plus one opt-in Electron smoke test that is skipped without a GUI session.

## 0.11.3 — 2026-11-02

### Changed
- **More automated coverage for the riskiest runtime paths:** archive extraction is now proven to stop an `unzip` that expands past the byte budget, timers are proven to count down, beep and cancel cleanly, and the POP palette keyboard navigation (arrows, Home/End, Enter, Space, Escape and focus restore) is covered.

### Tests
- 227 → **234** passing, plus one opt-in Electron smoke test that is skipped without a GUI session.

## 0.11.2 — 2026-11-03

### Fixed
- **The hotkey test now checks the correct macOS and Linux command paths**, so the Ubuntu CI gate passes again. The 0.11.1 app build itself was unaffected.

### Tests
- 227 passing, one opt-in Electron smoke test skipped without a GUI session.

## 0.11.1 — 2026-11-02

### Changed
- **Expanded automated coverage** across the IPC trust boundary, both plugin connection protocols, profile import/apply, plugin and icon installs, key press/hold/double/timers, renderer typography and panel drawing, the deck HID state machine, archives, store images, market/updates and the inspector/POP/dialog wiring.
- The Electron boot smoke test is opt-in with `RUN_ELECTRON_SMOKE=1`; the agent shell has no Aqua session and cannot launch Electron.

### Fixed
- **DRM-protected Elgato Marketplace plugins now show a clear message** instead of a JSON parse error. Their encrypted manifests cannot be installed without circumventing Elgato's DRM.
- **Stream Deck plugin downloads reject redirect downgrades to HTTP.**
- **Plugin inspector files and `openView` targets reject symlinks that escape the plugin directory.**
- **Renderer navigation uses a shared, symlink-aware file-origin guard.**
- **IPC sender checks reject query strings, fragments and non-empty file hosts**, not just the wrong path.

### Tests
- 126 → **227** passing, plus one opt-in Electron smoke test that is skipped without a GUI session.

## 0.11.0 — 2026-11-02

### Changed
- **Key text and captions have independent typography.** Both support System, Avenir Next, Georgia and Menlo fonts, Light / Regular / Bold weights and a text colour.
- **Caption styling also has size, alignment and background** (gradient, solid or none).
- **Key text keeps its auto-shrink and 12-character limit.** The key background control now sits in the key face header instead of its own section.
- **Caption controls use the same font / weight / colour row as key text**, with size, alignment and background on the next row.
- Legacy numeric weights are snapped to the Light / Regular / Bold presets so the three options render distinctly.

### Tests
- 121 → **126**.

## 0.10.7 — 2026-11-02

### Changed
- **Plugin lifecycle is generation-aware.** A stale child exit can no longer clear a replacement plugin's socket, consume its restart suppression, or change its crash policy.
- **Archive extraction is bounded and off the main process.** Profile, plugin and icon-pack ZIPs are inspected before expansion, reject unsafe paths and excessive entry counts, are unpacked asynchronously, and are stopped if the extracted tree crosses the size budget.
- **Catalogue release metadata expires when the catalogue refreshes**, so the store cannot keep offering an old version or download URL.
- **Profile round trips keep the wide-panel mode, folder auto-exit and profile icon.**
- **Unmapped imported actions keep a bounded copy of their source action data across reload.**
- **Renderer linting now checks undefined globals** with explicit per-file cross-file bindings.

### Fixed
- **AgentDeck's Setup tutorial opens its page instead of a blank window.** `openView` parameters are passed to `loadFile` as a query instead of being appended to the filename.

### Tests
- 104 → **121**. Added a fake-Electron IPC harness, archive-limit checks, plugin-view parameter checks, and profile/source-action round-trip coverage.

## 0.10.6 — 2026-11-02

### Changed
- **Press triggers is collapsible.** It starts closed on a fresh key, opens automatically when a hold or double-press trigger exists, remembers a manual collapse, and shows Hold / 2× badges.
- **A Do nothing key cannot set triggers until it has a primary action**, unless a hold/double trigger already exists. Existing trigger-only keys stay editable.
- **Running timers refresh the deck every second** with a silent background push instead of the 5-second live-image throttle, and push their final face when stopped.

### Tooling
- **`npm run install-app` launches through LaunchServices** so macOS creates the menu bar item instead of starting a GUI-less process from the shell.
- Added the repo release skill at `.opencode/skills/ulanzi-release`.

### Tests
- 104 (unchanged).

## 0.10.5 — 2026-11-02

### Changed
- **Type text keys show the typed text as their default face**, with the same ~12-character truncation and font shrinking as the Quick actions item. Empty text keys use the text SVG; typed emoji text is kept as-is.
- **Quick actions text steps show their text** with an adaptive font and a full-text tooltip. The window now fits three rows, so nine actions need no scrollbar.
- **POP/Multi step types are grouped** like the main action picker: Device & pages, Apps & links, System and Plugins.
- **Open app and Close app steps have Choose…**, using the existing app picker.
- **Brighter and Dimmer have distinct sun icons** with a centered + and −, and the direction dropdown is wide enough to show both labels.
- **Toggle two actions is capped at exactly two steps**; Add delay is hidden for toggles.
- **Default action faces no longer use emojis.** POP, timer, brightness, audio, command, hotkey, close, media, page and empty text now use their bundled SVGs. Existing auto-emoji keys migrate; custom emoji and typed emoji text are preserved.
- **The Toggle two actions knob meets the track edge**, removing the hairline gap.
- **Tooltips are instant and render-stable**: Push and the capped Add action use CSS hover/focus, so status re-renders cannot flicker them.

### Fixed
- **Plugin live-image pushes are throttled** to one background push every 5 seconds. Identical images, unchanged state indexes and repeated titles are skipped, and background pushes no longer toggle the Push button or footer. This stops the constant full-page pushes and the Push-button flicker.

### Tests
- 102 → **104**.

## 0.10.4 — 2026-11-02

### Fixed
- **Add Back key now uses the bundled back arrow SVG** instead of the old ↩️ emoji. Existing Back keys with that emoji are treated as automatic and pick up the SVG too.
- **The child-page folder icon’s plus is larger and centered** in the folder body.

### Changed
- **Page settings shows when it is active** and pulses the inspector when pressed again, so pressing it while the panel is already open no longer looks like a no-op.

### Tests
- 102 (unchanged).

## 0.10.3 — 2026-11-02

### Changed
- **The Push tooltip appears instantly** on hover or keyboard focus instead of using the delayed native title. It is styled like the app and still explains the auto-push state, the retry state and the disconnected state.

### Tests
- 102 (unchanged).

## 0.10.2 — 2026-11-02

### Fixed
- **The auto-push tooltip on Push now works.** The button keeps its native title and keyboard focus by using `aria-disabled` instead of the `disabled` attribute. It still looks disabled, and clicking it explains why nothing was pushed.

### Tests
- 102 (unchanged).

## 0.10.1 — 2026-11-02

### Changed
- **Deck settings is centered over the editor** instead of sitting beside the inspector. Opening it closes the narrow drawer, and selecting a key closes it.
- **Push is disabled while auto-push is on and the deck is in sync.** Its tooltip explains that changes go automatically, how to turn auto-push off, and that ⌘S still pushes. It stays available when auto-push is off or a push needs a retry.
- **Subpages are discoverable:** Page settings lists child pages and **New subpage** creates the child plus an open key on the parent and a Back key on the child.
- **Back to parent page** is only offered on subpages, and page targets mark them with ↳.

### Tests
- 102 (unchanged).

## 0.10.0 — 2026-11-02

### Changed
- **Destructive actions use an in-app confirmation** whose Cancel button is focused: Clear page, Delete page, Delete profile, Remove plugin, Delete icon pack and Replace import. The labels name the concrete action, and **Clear page can be undone with ⌘Z**. New page is now the primary control.
- **Pages can be reordered** by dragging them in the sidebar or pressing ⌥↑ / ⌥↓. Next and Previous follow the new order.
- **POP is now “Quick actions”:** the palette takes keyboard focus, supports arrows/Home/End/Enter/Escape, closes when you click away, restores the app you came from before running the action, and shows action icons.
- **Multi and Toggle steps can now run plugin, audio, timer, brightness and close actions.** Every step type has inline controls, and steps reorder by drag or ↑/↓.

### Fixed
- **A zero-millisecond delay step stays a delay** across save and reload.

### Tests
- 100 → **102**.

## 0.9.0 — 2026-11-02

### Changed
- **Page settings stay reachable below 1180 px:** a toolbar button opens the inspector drawer without a selected key; the drawer is 360 px wide, starts below the toolbar and has a scrim. Push stays usable while editing.
- **Plugin live images no longer get the app caption** printed over them by default. “Show caption” is an explicit opt-in and persists across reloads.
- **Unsynced edits are visible:** with auto-push off or no deck connected, the editor shows “unsynced changes” and a dot on Push until a successful push.
- **Missing plugins are flagged:** the inspector names the unavailable plugin, keeps its stored settings and offers Open Store / Clear action; the key face shows a warning badge.

### Fixed
- **Multi Action waits for each step** — text and hotkeys finish before the next step — and stops after a failed one.
- **Sequences are independent per key** and are cancelled when the page or profile changes.

### Tests
- 99 → **100**.

## 0.8.12 — 2026-11-02

### Changed
- **The wide-key inspector shows a live preview** of the clock, stats or wallpaper panel; “Background” is now “Page wallpaper”.
- **Installed keeps its group headers visible while scrolling** and has room at the bottom of the list.
- **The icon library’s empty state uses the full pane** instead of a blank pack column.
- **Store cards show Installed / Update** without opening the detail view.
- **Installing Rosetta asks for confirmation** before opening Terminal.
- **Short windows (≤620 px)** hide the stage hint and let the stage scroll.

## 0.8.11 — 2026-11-02

### Security
- **Store redirects are constrained:** every hop must be HTTPS; a credential-bearing POST redirected to another origin is refused; and credentials never cross an origin or transport change.

### Fixed
- **The Stream Deck inspector retry works again** when the action is not registered yet (the shared bridge used to omit the retry entirely when the payload was null).
- **A first run is no longer reported as a damaged config**, while an existing empty config is reported as reset instead of silently replaced.
- **Plugin-local views ignore query/hash** when resolving a file.

### Changed
- **Tabs are keyboard-operable** (roving tabindex, Arrow/Home/End) across settings, store and Installed.
- **A plugin inspector keeps a 120 px placeholder** and offers **Retry** after 5 s instead of collapsing the panel.
- **Icon tiles have readable accessible names** instead of the raw filename.
- **Copy:** “Reveal in Finder”, “Top rated”, “Add key combination”, “20 icons”, and “OpenAction” casing.

### CI
- GitHub Actions are pinned to commit SHAs.

### Tests
- 97 → **99**.

## 0.8.10 — 2026-11-02

### Changed
- **One disconnected-state vocabulary:** the pill reads “No deck” / “In use”, the device card “No deck connected” / “Deck in use”, the button “Connect deck”, and the deck footer “no deck”.
- **A connect banner** above the deck explains “Connect your D200. If Ulanzi Studio is open, quit it.” with a **Reconnect** button.
- **Connection and push state are live regions**, so screen readers announce changes.
- **The page title** enforces the same 40-character limit and uniqueness rule as the inspector.
- **Hotkeys render as macOS glyphs** (⌘ ⇧ 4) in the inspector and gain a **Test** button.
- **Page-indicator keys** hide press triggers and appearance controls; the key face draws only the number and dots.
- **Every unsupported plugin has a reason** (“No compatible code for this Mac”, “Needs Rosetta”) instead of a bare “Not supported”.
- **Update notes keep their line breaks.**
- **Editing tips** are reachable from a “?” toolbar button at any window width, not only in Page settings.
- **Clear page** is disabled when the page has no keys.

### Tests
- 96 → **97**: the hotkey formatter.

## 0.8.9 — 2026-11-02

### Security
- **Marketplace responses and downloads are bounded while streaming**, so a hostile or broken endpoint cannot allocate the whole body before the size check. JSON requests have a 20 s deadline and HEAD checks 15 s.
- **Diagnostics redact nested secret names**, not only top-level token/password/API-key fields.

### Fixed
- **Re-enabling automatic updates now reschedules them.** The renderer's debounced save meant main still saw the old value when it rescheduled.
- **“Install Rosetta, then Reload all” now works** — reload clears the negative Rosetta/Wine caches instead of keeping them for the process lifetime.
- **Page and profile switches clear pending hold/double timers**, so a departed page's action cannot fire.
- **A zero sound volume stays zero** instead of becoming full volume.
- **`ULANZI_NO_DECK=1` no longer starts the real key-capture helper.**
- **The native “Check for Updates…” menu item** now shows its result in the app instead of discarding it.

### CI
- The release workflow runs **lint and typecheck** before packaging, not just tests.

### Tests
- 90 → **96**.

## 0.8.8 — 2026-11-02

### Fixed
- The import walker now treats a bare plugin step’s `action` (its UUID) as data rather than a nested action, so shorthand plugin steps are visited correctly.

## 0.8.7 — 2026-11-02

### Fixed
- **Key capture reports the real state.** It no longer says “Capturing keys” before the helper has seized the Deck: it shows starting / waiting for the Deck / the specific permission or busy error, and only switches to “Capturing keys” on a confirmed `seized` record. Helper output is parsed line-by-line, so chunk boundaries no longer hide a record.
- **Ulanzi plugin global settings are persisted** and survive a restart.
- **Nested plugin actions now run.** Plugin actions inside Multi, Toggle and POP steps, and on hold/double triggers, are registered with the host instead of failing with “Plugin action is not ready yet”.

### Tests
- 88 → **90**: nested plugin sync and Ulanzi global-settings persistence.

## 0.8.6 — 2026-11-02

### Security
- **WebSocket admission is now an allowlist.** Only an absent `Origin` (SDK child processes) and the app’s own inspector schemes (`file:`, `ulanzi-pi:`, `sd-pi:`) are accepted; opaque `null` and web/extension origins are rejected.

### Fixed
- **The five-crash limit now holds.** A plugin that connects and immediately crashes no longer resets its crash counter on every reconnect, and a plugin that gave up stays stopped until an explicit **Reload**.

### Tests
- 85 → **88**: recent vs. stable reconnects, the give-up state, and the Origin allowlist.

## 0.8.5 — 2026-11-02

### Security
- **Imported shorthand command steps are covered by consent.** Multi, toggle and POP steps written as bare actions (instead of `{action: …}`) are now included in the shell-command scan and `imported` marking, so they can no longer become executable commands after a reload without confirmation.

### Fixed
- **A malformed plugin manifest no longer aborts startup.** The host logs the bad manifest and keeps scanning; error listeners are attached before the first scan.
- **Installing a plugin from its own folder no longer deletes it.** Installs are staged before the old copy is replaced, so a failed copy also preserves the previous working version.
- **One malformed page no longer discards the configuration.** Pages are filtered before migration, and backup recovery restores file-backed icons and backgrounds as image data.
- **A failed plugin port bind no longer launches plugins** against a dead port, and shutdown invalidates pending launches.
- **Restarting a plugin waits for the previous process to exit** before starting the replacement; reloaded processes stay tracked for shutdown escalation.

### Tests
- 75 → **85**. The new audit suite covers import consent, malformed pages, backup images, self-install, port failure, shutdown, restart races and bad manifests.

## 0.8.4 — 2026-11-01

### Changed
- **Toasts** render above dialogs and carry a success/error glyph.
- **The sidebar scrolls its page list**, so the device card, Store and Installed stay reachable with many pages.
- **Deck settings** sits beside the inspector (8px gap) instead of overlapping it by 48px.
- **Dialogs size to their content** (profile, hotkey, update); only list dialogs keep a fixed height.
- **Dialogs focus the primary field and return focus** to the trigger when closed.
- **Grid keys have accessible names**; the page-delete button is visible on focus and labelled.
- **Store empty states** name the search and offer **Clear search**.
- **Update failures** are humanised (“Couldn’t reach GitHub. Check your connection and try again.”).
- Labels: **Deck brightness**, **Toggle two actions**, and per-type value labels (Text to type, Command, Sound file, Duration…).
- The empty-key “+” is brighter, and import counts are pluralised.

### Fixed
- The brightness step input is usable again (was 22px wide).
- The profile select no longer clips its label at 1080.
- The profile dialog hides Export/Import when creating a profile.

## 0.8.3 — 2026-11-01

### Changed
- **Keys with a plugin live image** no longer offer the icon controls (Library, File, drop zone, Remove). The inspector shows “Live image from plugin” and explains that a custom icon is kept but hidden while the plugin is drawing.

## 0.8.2 — 2026-11-01

### Changed
- **Plugins without a property inspector** no longer show a raw JSON settings box by default. The inspector now says “This action has no settings page” and offers an **Advanced: edit settings JSON** disclosure, which opens automatically only when the action already has settings.

## 0.8.1 — 2026-11-01

### Fixed
- **Stream Deck plugins install from the Store again.** The install handler used `downloadPluginPackage` without importing it, so every OpenAction install failed with “downloadPluginPackage is not defined”.
- **Plugin file/folder dialogs no longer throw.** The extracted plugin-host wiring still referenced the old `win` variable; it now uses the lazy `getWin()`.

### Changed
- ESLint checks `no-undef` on the Node-side files (`main.js`, `ipc.js`, `plugin-hosts.js`, `lib/`). Both regressions above were found by that check.

## 0.8.0 — 2026-11-01

### Changed
- **One plugin-host lifecycle.** `lib/plugin-host.js` now owns discovery, the WebSocket server and port fallback, spawn/exit/backoff, settings persistence, install/import/remove, reload/restart and shutdown. `plugins.js` and `streamdeck-plugins.js` are protocol adapters: manifest reader, spawn command and messages.
- Plugin stdout/stderr go through one stream handler with the same 1 MB rotation rules for both hosts.

### Fixed
- `reloadOne()` now removes only the affected plugin's actions. It previously deleted a map entry keyed by plugin UUID, so stale actions could keep the plugin running until the next sync.

## 0.7.1 — 2026-11-01

### Changed
- **`lib/` is type-checked** with `tsc --checkJs` in CI. The first pass caught a Windows-only comparison that could never match (`process.platform !== 'windows'`).
- **Dependabot** watches npm (weekly, minor/patch grouped) and GitHub Actions (monthly).
- **Native helpers are built, not committed.** `npm start` / `npm run dev` compile them first, and the packaged bundle no longer ships tests, scripts, native sources or build intermediates.
- **One settings default object** feeds new configs, migrations and validation.
- **Tighter CSP**: `object-src 'none'` and `base-uri 'none'`.
- **Key-by-key logging is opt-in** with `ULANZI_LOG_KEYS=1`, so a stuck key cannot flood the log.

### Fixed
- `renderChrome()` no longer throws when there is no active page.

## 0.7.0 — 2026-11-01

### Changed
- **Smaller main process.** `main.js` dropped from ~1,900 to ~660 lines: IPC lives in `ipc.js`, both plugin hosts in `plugin-hosts.js`, and the inspector themes in `lib/pi-themes.js`.
- **One inspector protocol handler** for `ulanzi-pi://` and `sd-pi://` (`lib/plugin-protocol.js`), with the same path containment for both.
- **One inspector bridge** for height reporting, link handling and the Stream Deck socket connect (`lib/pi-theme.js`).
- **Shared metadata**: MIME types (`lib/mime.js`), grid geometry (`lib/geometry.js`), action types/labels/groups and media keys (`lib/actions-meta.js`), version comparison (`lib/version.js`).
- **IPC channel names** are declared once in `lib/channels.js`. The sandboxed preload cannot require it, so a test verifies every preload literal matches a declared channel and has a handler.
- **One HTML-plugin window helper** (`lib/html-window.js`) used by both hosts.

### Fixed
- Inspector height reporting is now a single implementation, so the two schemes cannot drift apart again.

## 0.6.2 — 2026-11-01

### Security
- Favicon lookups refuse loopback, link-local and private addresses, and re-check every redirect.
- Marketplace redirects drop the session token when the destination host is not Ulanzi's.
- Plugin “open local file” requests must resolve inside the plugin's own folder.

### Fixed
- Quitting asks plugins to stop, then force-kills anything still alive after 1.5 s, so a plugin cannot survive and keep the deck busy.
- Installing, importing or removing one plugin restarts only that plugin instead of every plugin.
- Manual plugin installs (folder or ZIP) show the same trust warning as the store.
- A failed plugin port bind no longer leaves the plugin marked as running, and inspector sockets are cleared on reload.
- Ulanzi profile import caps pages (200) and embedded images (64 MB) before parsing.
- Process-level errors and unhandled rejections are written to the log.

## 0.6.1 — 2026-11-01

### Security
- Importing a profile that contains shell commands now lists them and asks for confirmation. Imported commands stay marked on the key and in the inspector until you edit them.
- Icon-pack ids are contained: `..` and path separators are rejected, so a malformed id can no longer read or delete files outside the icons folder.
- Every IPC handler now refuses calls from anything but the app window, and the window/navigation checks compare resolved paths instead of substrings.
- The main window and the POP window run with the Chromium sandbox enabled.
- Action settings embedded in Stream Deck property inspectors escape `</script>`, so a setting cannot break out of the injected script.

### Fixed
- A HID scan error no longer overwrites `Deck.status()` and breaks the UI on launch.
- One malformed page no longer discards the whole configuration. Loading from the backup (or resetting) is now reported in the app.
- The key-capture helper restarts with backoff and reports its state under **Deck settings → Display**.
- Frontmost-app polling no longer blocks the main thread with synchronous process spawns.
- Links and help buttons in Stream Deck property inspectors open again.
- The Ulanzi store compares versions numerically, so `1.0` and `1.0.0` no longer show a phantom update.
- Choosing an unreadable image reports an error instead of failing silently.

### Changed
- CI now runs ESLint (duplicate keys, unreachable code, unused locals) and the workflow has read-only permissions.
- Removed dead code: unused preload/IPC surface, the unused POP preset icon, the superseded `build-hidseize.sh`, and the vestigial deck read timer.

## 0.6.0 — 2026-11-01

### Features
- **Installed → Reload** restarts a single plugin (its process, sockets and crash counter) without reloading the others.
- A failing **Run command** now shows a toast with the command's error (last stderr line or exit code) instead of failing silently.

## 0.5.0 — 2026-11-01

### Features
- **Settings…** (⌘,) in the app menu opens **Deck settings**, like the ⚙︎ Deck button.
- **About** is now an in-app dialog, opened from the app menu or **Deck settings → App**. It shows the version, “Made by Eduardo Falcão Lima”, a link to **edufalcao.com** and the GitHub repository, and the MIT licence.

## 0.4.0 — 2026-11-01

### Features
- The Icon section has an explicit **File** button next to **Library**, so choosing an image file no longer depends on knowing the drop zone is clickable (the drop zone still works the same way).
- **Favicon** (renamed from “Use icon”) now falls back to the domain root when a deep page has no icon of its own — e.g. `github.com/org/repo` → `github.com/favicon.ico`.
- URL keys also get a **Favicon** button in the Icon section, so the site icon can be (re)applied without going back to the URL field.

## 0.3.2 — 2026-11-01

### Fixes
- Drop-downs no longer clip their text when a plugin fixes the select height (e.g. Claude Code Usage's Instance and Accent color): vertical padding and line-height are normalised while the custom chevron is kept.

## 0.3.1 — 2026-11-01

### Fixes
- Plugins that only refresh when their settings change (e.g. **Currency**) now load their value on startup and when a key is placed: the host includes a fresh `forceRefresh` timestamp in the `add` message, so the plugin fetches immediately instead of waiting for its next interval.
- Inspector controls use border-box sizing and can shrink inside flex rows (`min-width: 0`), so selects and text inputs no longer overflow the right edge of the panel (e.g. Audio Mute's Device and PTT/PTM drop-downs).
- Drop-downs in plugin inspectors show their arrow again: the dark theme replaced the native select background and removed the platform chevron, so a custom one is drawn now (Ulanzi and Stream Deck inspectors alike).
- Ulanzi plugin inspectors now save settings and reach their plugin when another app owns the default plugin port: the Ulanzi host falls back to the next free port (3907, 3908…) instead of retrying 3906 forever and letting inspectors talk to Ulanzi Studio's server. This fixes OpenWeather not saving and not loading weather.
- Inspector frames are allowed to use `localStorage` (some inspectors, e.g. OpenWeather, write the API key there before sending the settings; the sandbox exception used to abort the save).
- Ulanzi inspectors no longer grow to a huge blank block: full-height wrappers (`.udpi-wrapper`) are measured by their content instead of their own frame height.
- An empty `setImage` from a plugin now restores the action's manifest image instead of clearing it to the generic plugin icon. This fixes macOS Controls' **Show text under icon**: for example **Emoji & Symbols** now shows the emoji with its “Emoji” caption instead of the plugin icon with no label.

### UI
- Rebalanced the window: the sidebar is narrower (300 px) and the inspector wider (440 px), so plugin settings get the room they need — the key action buttons fit on one line and Audio Mute's device list is no longer truncated.
- Action icons redrawn to match the official app: **Parent Page**, **Subpage**, **Text**, **Multi Action**, **Multi Action Switch**, **Random Action**, **Feature Popup**, **Play Audio** and **Stop Audio**.
- Multi actions now show a different icon for run-in-order / alternate / random, sound actions differ for play and stop, and a **Go to page** key that opens a subpage uses the folder icon.
- Refined the **Random Action** (shuffle curves), **Preset Popup** (ring plus refresh arrows whose body matches the outer ring) and **Multi Action Switch** (stacked cards with swap arrows) icons to match the official glyphs.
- Added a **Preset Popup** icon asset; our POP is still a single action, so it is not used yet.

## 0.3.0 — 2026-11-01

### Features
- **Check for Updates…** in the app menu compares the installed version with the latest GitHub release, shows the release notes and opens the release page. It only notifies — installing the new version is still manual.
- Updates are also checked on launch and then every 1, 6, 12 or 24 hours, configurable in **Deck settings → App**, which now shows the current version, a **Check…** button and the last result. Background checks never interrupt: they show a toast and an update line in that tab.
- The update dialog scrolls long release notes (it used to grow with the changelog and could run off-screen).

## 0.2.0 — 2026-10-31

### Features
- **Store → Stream Deck Plugins** now uses only the OpenAction catalogue. The stale community Elgato mirror (frozen in April 2024) was dropped, which also removes the 111 duplicate entries it contributed.
- **Installed** plugin list is grouped into **Ulanzi** and **Stream Deck / OpenAction** sections, alphabetically, matching the Store's source split.
- Stream Deck property inspectors follow the app theme (dark background/fields) instead of the plugin's default grey, and settings are re-sent after the inspector connects so controls reflect the key's stored settings.
- **Store** now has **Ulanzi Plugins / Ulanzi Icons / Stream Deck Plugins** tabs; the Stream Deck tab browses the OpenAction catalogue, search by name/author/ID, install with one click and update app-owned plugins. Downloads are HTTPS-only, size-capped and path-validated.
- **Stream Deck SDK / OpenAction plugin support**: discovers `.sdPlugin` plugins from this app, OpenDeck and Elgato folders; runs Node, HTML and native macOS plugins (Windows-only plugins through Wine when available); installs `.sdPlugin`, `.streamdeckplugin` and ZIP packages; supports property inspectors, per-state images/titles/state, per-action and global settings, `sendToPlugin`/`sendToPropertyInspector`, real key-down/up events, `showAlert`/`showOk`, profile switching and device brightness. Existing Ulanzi plugins keep working alongside them.

### UI
- **Go to page** and **Switch profile** have their own icons again, based on the official app: a split square with an arrow, and two toggle switches. **Back to parent page** gets an up-arrow square so it no longer shares the “go to page” icon.
- **Previous page** / **Next page** now use a rounded square with an arrow, like the official Ulanzi app, so they are no longer confused with the media previous/next track icons.
- Removing a key's icon now falls back to the action's own icon (page arrows, media, plugin…), as the key looked before a custom icon was added. The **Remove** button only appears when the key actually has a custom icon.
- New **plugin** action icon (plug inside a circle), drawn in white and scaled to match the other action icons.
- Copy fixes: the Accessibility state reads **Granted** / **Not granted** (with a proper warning colour) instead of lowercase text, and **Deck** is capitalised everywhere in the interface (**No Deck found**, **Reconnect Deck**, hints and tooltips).
- The Installed toolbar fits on one row again: **Install folder…**, **Install .zip…**, **Reload all**, plus a **⋯** menu with **Open plugins folder**, **Open Stream Deck folder** and **Open plugin log**.

### Fixes
- The Stream Deck store no longer offers a phantom **Update** when the installed plugin and the latest release are the same version written differently (`1.0.0` vs `1.0`). Versions are now compared numerically, component by component.
- Property inspectors now connect when the plugin action was just added. The inspector iframe used to open before the action was registered with the plugin host, so it loaded without connection details: settings changes were never sent to the plugin (Control Center kept toggling Wi-Fi, mute kept its old mode, "show text" did nothing), `sendToPlugin` never reached the plugin (Open App stayed on "Loading…", Slack's help button did nothing) and the log had no inspector traffic. The action is now synced before the inspector opens, and an inspector that still lacks connection details reloads itself.
- Property inspectors that render nothing no longer leave a large blank **Settings** block: the panel collapses until the inspector reports content, and full-height layouts no longer make the iframe grow to the maximum height.
- Added a Stream Deck plugin log (`streamdeck.log` in the app data folder, **Installed → Open plugin log**) recording plugin spawn/exit, host↔plugin and host↔inspector messages, and plugin stderr, to diagnose plugins whose settings or property inspectors misbehave.
- Intel-only (x86_64) plugins are detected on Apple Silicon. When Rosetta is missing they are marked **Needs Rosetta** in Installed, with an **Install Rosetta…** button, instead of silently failing to start; pressing one of their keys explains what is missing. This is why the Elgato **CPU** plugin showed only its static icon.
- Stream Deck plugins are no longer started twice when several of their actions sync in the same tick. The duplicate process competed with the first for the same contexts, so property-inspector requests (e.g. macOS Controls' app list) went to the wrong process and settings changes only reached one copy — mute, Control Center and other key actions kept using their old settings.
- A plugin that registers a second connection now replaces the old socket instead of leaving two active connections.

## 0.1.1 — 2026-10-31

### UI
- Every action now uses its bundled SVG by default: added `sound.svg` and `pop.svg`, and plugin actions use `plugin.svg` instead of the 🔌 emoji.
- Page indicator now draws its page number/dots instead of showing an imported icon or emoji; its icon/text controls are hidden in the inspector.
- Choosing **Plugin action** starts with **Choose a plugin…** (and **Choose an action…**) instead of auto-selecting the first installed plugin, and the Settings field stays hidden until both are chosen.
- Scrollbars in the app and inside plugin property inspectors now share one style: 12 px, a visible track, an 8 px rounded thumb and brighter hover/active states.
- Inspector actions now sit at the top, under the panel title, with a separator before the form: **Duplicate / Pin / Clear key** for keys and **Clear page / Duplicate / New page** for page settings. No more scrolling to the bottom to reach them.
- Pinning a key no longer deselects it: the inspector stays on that slot and switches to **Unpin**; the pinned banner sits below the buttons so they no longer move.

## 0.1.0 — 2026-10-31

- DMG filename uses dashes so GitHub Releases keeps the same name as the checksum file.

### Features
- The 2×1 wide key is now editable: **Clock**, **System stats** (live CPU / memory / GPU from this Mac) or **Background** (page image, no clock). The preview matches the panel, and the choice is sent to the deck on every push/page change.
- Pressing the physical wide key cycles Clock → System stats → Background and the dashboard follows, so the preview always mirrors the panel the device is showing.
- The wide-key preview matches the firmware panel: Clock is the analog dial (live second hand) with the digital time on the right; System stats is three centred CPU / RAM / GPU columns; Background is the empty page image.
- Pinned keys can always be removed: Page settings lists every pinned slot with an **Unpin** button, even when a page key overrides it.
- POP keys (`com.ulanzi.deck.popkey.pop`) import as **POP menus** and open a small action palette at the pointer; child actions are editable in the inspector.
- Profiles can be created, renamed and deleted in-app (unique names); pages are unique per profile.
- Profiles can be linked to an app and follow the frontmost window (`lsappinfo`, no extra permissions).
- Pinned keys: pin a key to every page, overridable per page, with plugin action state kept in sync.
- Standby screen: clock over a wallpaper after an idle timeout; the first key press only wakes the deck.
- Timer action (countdown on the key, optional completion sound) and key-brightness action.
- Page/profile backgrounds plus “Snapshot page”; one image is sliced across the 13 square keys.
- Plugin `selectdialog` is answered with a native file/folder picker; encoder feedback calls are accepted.
- Import profiles from the official app as new profiles, with name collision handling.
- Key editing shortcuts: ⌘C copy, ⌘V paste (fresh plugin action ids), Delete/Backspace clear, ⌘Z undo.
- Plugin protocol sends the action UUID for action-scoped messages, fixing multi-instance plugins (Claude Usage 5h/weekly).

### Fixes
- Key background colour has a **Reset to default** link that appears once the colour is changed.
- The key inspector has **Icon / Text** tabs: a key shows either a custom or automatic image or its text, never both. **Remove** clears the icon (including the automatic app icon) and leaves the key on the Icon tab showing a “No icon” placeholder; switching to Text stays an explicit choice.
- Hold / double press “Switch to page” now seeds a target page, so the action works right after choosing the type (older empty targets advance to the next page).
- Every page picker (Go to page, parent, press triggers, Multi/POP step pages) is limited to the active profile, cannot form cycles, and subpages are indented with a “↳” in the sidebar.
- Subpages are easy to leave: a back arrow in the toolbar, “Back to parent” in Page settings, and **Add Back key** for a physical page/back key.
- Deck settings close button no longer sits under the window drag region; the popover closes on ×, outside click and Escape.
- “Grant…” always opens the Accessibility pane, including when permission is already granted.
- The empty-slot “+” no longer shows through configured keys (e.g. Page Indicator).
- The deck re-sends the current page after **screen unlock / wake**, mirroring Ulanzi Studio's `SendUnlockedData`; the wide-key clock stays at 5 s while screen sleep is off (60 s when a sleep timeout is set) so the deck's stored standby image does not linger.
- Media keys now mirror Ulanzi Studio's `MediaKeysBridge` exactly: prime the HID event queue with a Command key-up, then post the NX_SYSDEFINED key-down/up with no gap. The old 12 ms gap made macOS treat volume/mute as held (volume ran to the end, mute flickered).

### Security
- Plugin WebSocket rejects browser origins and connections for unknown plugin UUIDs.
- Marketplace session token is only sent to `*.ulanzistudio.com`; downloads are capped at 128 MB.
- Plugin install sanitises `manifest.UUID` and checks the destination stays inside the plugins folder.
- App/close/hotkey actions use `execFile` argument arrays (no shell interpolation); URL schemes are allowlisted.
- Window navigation/redirects are restricted to the app page; window-open and IPC senders are validated.
- Inspector iframes are sandboxed; CORS relaxation only applies to inspector frames.
- Installing a plugin from the store asks for confirmation first.

### Reliability
- Unreferenced images in `Images/` are pruned on save; files still referenced by the current config or its `.bak` are kept.
- Single-instance lock (skipped in dev runs), renderer crash recovery, plugin spawn error handling.
- Plugin port retry, restart backoff (max five attempts/minute), queued messages flushed on connect.
- Plugin global settings persist across restarts; `state` text updates key captions.
- Config keeps a `.bak`, preserves corrupt files and falls back to the backup.
- Press-trigger editor is wired (hold / double press); duplicate plugin keys get a fresh action id.
- Image cache is bounded; press timers are cleared on navigation; HID discovery cannot crash the loop.

### UI
- Closing the editor hides its Dock icon; the app stays in the menu bar and the icon returns when the window is reopened.
- The deck status now sits with the right-side controls and reads **Connected / Disconnected**; the primary button is **Push to Deck**.
- The profile row now holds **Import**, **New profile** and a properly centred **⋯ Manage** button; Import uses a clear download/import icon instead of the ambiguous `⤓` glyph.
- The app opens wider (up to 1600 px, clamped to the screen) with the middle stage growing while the side rails keep their width.
- Deck settings are now a 440 px tabbed sheet: **Display** (brightness, sleep, standby, lock), **Device** (auto-push, firmware, reconnect) and **App** (launch at login, Accessibility).
- Sidebar and inspector now share the same rail width (368 px, 320 px on narrower windows); the brand reads “Ulanzi Deck OPEN” on one line.
- Responsive toolbar at the 1080 px minimum; Push never wraps; truthful offline state.
- Accessible dialogs (roles, focus trap, Escape), visible focus rings, live toast region.
- Higher-contrast primary buttons and tertiary text; fixed-height modals.
- Real app icons resolved from app names; trigger badges (`H`, `2×`) on key tiles.
- Icon library ignores macOS `._*` files.

### Tooling
- Tagged releases now build an unsigned universal DMG on GitHub Actions and attach it with `SHA256SUMS.txt`; the workflow can also be run manually for an artifact.
- Unit tests (`npm test`) for protocol framing, config migration/recovery, wide-key modes and plugin install validation.
- GitHub Actions CI; universal (arm64 + x86_64) native helpers; DMG script.
- Build from a fresh clone is documented end-to-end (unsigned): `npm start`, arm64/universal packaging, `install-app`, DMG, Gatekeeper/quarantine and first-run permissions.
- `package:all` now runs the native-helper build and post-package copy steps; `install-app` picks universal on Intel and `make:dmg` accepts any packaged architecture.
