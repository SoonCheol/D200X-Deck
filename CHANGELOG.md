# Changelog

## Unreleased

### Features
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
- Single-instance lock (skipped in dev runs), renderer crash recovery, plugin spawn error handling.
- Plugin port retry, restart backoff (max five attempts/minute), queued messages flushed on connect.
- Plugin global settings persist across restarts; `state` text updates key captions.
- Config keeps a `.bak`, preserves corrupt files and falls back to the backup.
- Press-trigger editor is wired (hold / double press); duplicate plugin keys get a fresh action id.
- Image cache is bounded; press timers are cleared on navigation; HID discovery cannot crash the loop.

### UI
- Responsive toolbar at the 1080 px minimum; Push never wraps; truthful offline state.
- Accessible dialogs (roles, focus trap, Escape), visible focus rings, live toast region.
- Higher-contrast primary buttons and tertiary text; fixed-height modals.
- Real app icons resolved from app names; trigger badges (`H`, `2×`) on key tiles.
- Icon library ignores macOS `._*` files.

### Tooling
- Unit tests (`npm test`) for protocol framing, config migration/recovery and plugin install validation.
- GitHub Actions CI; universal (arm64 + x86_64) native helpers; DMG script.
