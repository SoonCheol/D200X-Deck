# Changelog

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
