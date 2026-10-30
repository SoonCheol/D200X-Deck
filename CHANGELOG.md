# Changelog

## Unreleased

### Features
- Profiles can be created, renamed and deleted in-app (unique names); pages are unique per profile.
- Import profiles from the official app as new profiles, with name collision handling.
- Key editing shortcuts: ⌘C copy, ⌘V paste (fresh plugin action ids), Delete/Backspace clear, ⌘Z undo.
- Plugin protocol sends the action UUID for action-scoped messages, fixing multi-instance plugins (Claude Usage 5h/weekly).

### Fixes
- Deck settings close button no longer sits under the window drag region; the popover closes on ×, outside click and Escape.
- “Grant…” always opens the Accessibility pane, including when permission is already granted.

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
