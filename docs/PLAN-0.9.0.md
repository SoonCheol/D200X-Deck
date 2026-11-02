# 0.9.0 — structural UI plan

Status: planned 2026-11-02, from **0.8.12**. Scope: the five remaining High
findings from the UI audit plus the two action-sequencing Mediums from the
architecture audit. Everything here is independent of the deferred renderer
rewrite and image IPC.

Sources:
[`reviews/2026-11-01-uiux-audit.md`](reviews/2026-11-01-uiux-audit.md),
[`reviews/2026-11-02-architecture-audit-2.md`](reviews/2026-11-02-architecture-audit-2.md),
and [`ROADMAP.md`](ROADMAP.md).

## Ground rules

- macOS-only Electron app, MIT. No copied third-party code or secrets.
- Before each commit: `cd app && npm test && npm run lint && npm run typecheck`.
- Runtime checks: copy the demo config and never touch the real one:
  `cp -R /tmp/sdapp /tmp/090-config` and run with
  `ULANZI_NO_DECK=1 ULANZI_CONFIG_DIR=/tmp/090-config`.
- One focused commit per item, then release 0.9.0 with the usual flow
  (bump `app/package.json` + lock, CHANGELOG section, commit “Release 0.9.0”,
  tag, push, `gh run watch`, `npm run install-app`).
- Keep the existing visual language and code style.

## 1 + 2. H1 and H10 — inspector at narrow widths

**Problem:** below 1180 px the inspector is a drawer that only opens for a key;
Page settings is unreachable. At 1080 the 440 px drawer covers the toolbar’s
Push button and 3.5 deck columns.

**Target:**
- A persistent **Page settings** entry in the toolbar (`#page-settings-btn`)
  that sets `state.selected = null`, opens the drawer, and renders Page settings.
- `renderInspector()` must not remove `.open` just because `selected === null`;
  only the explicit close button/scrim should close it.
- Drawer width 360 px (from 440), top offset below the toolbar so the toolbar
  stays clickable; toolbar above the drawer in z-order.
- A scrim (`#drawer-scrim`) behind the drawer at ≤1179; click closes.
- Push remains visible and usable while the drawer is open.

**Files:** `renderer/inspector.js`, `renderer/app.js`, `renderer/index.html`,
`renderer/styles.css`.

**Acceptance:** at 1080×700 with no key selected, Page settings opens and is
usable; Push is clickable while the drawer is open; Escape/scrim closes; at
≥1180 the inline inspector is unchanged.

## 3. H2 — plugin live images get the app caption

**Problem:** `drawKey()` always prints `key.label` over a plugin-supplied face.

**Target:**
- `effectiveKey()` marks a key when it applies a plugin live image
  (`liveImage: true`).
- The caption is opt-in for those keys: draw it only when the user explicitly
  enabled it. Add `font.captionExplicit` to the schema (`normalizeKey`) so a
  default `showLabel: true` does not count as consent.
- The inspector’s Show caption checkbox reflects this: unchecked for a live
  image unless `captionExplicit`; toggling sets both.
- Skip the bottom gradient when no caption is drawn.

**Files:** `renderer/app.js` (effectiveKey), `renderer/render.js`,
`renderer/inspector.js`, `lib/store.js` (schema).

**Acceptance:** a plugin key with a live image shows no app caption by default;
enabling Show caption draws it and persists across reload; non-plugin keys are
unchanged.

## 4. H4 — dirty/unsynced state

**Problem:** with auto-push off, edits still show “synced”.

**Target:**
- `commit()` sets `state.unsynced = true` when auto-push is off or the deck is
  disconnected.
- `pushNow()` clears it on success.
- `#push-state` shows “unsynced changes”; `#push-btn` gets a dot/badge while
  dirty.
- Do not claim “synced” after a failed push.
- Reset the flag on load.

**Files:** `renderer/ui.js`, `renderer/app.js`, `renderer/styles.css`.

**Acceptance:** edit with auto-push off → “unsynced changes” + dot; push →
clears; disconnect/reconnect does not silently clear it.

## 5. H11 — missing-plugin keys look normal

**Problem:** a key whose plugin is not installed renders normally and the
inspector silently falls back to “Choose a plugin…”.

**Target:**
- Detect `action.type === 'plugin' && action.plugin && !plugin` in the inspector.
- Show a warning block: “Plugin ‘X’ isn’t installed”, **Open Store**, **Clear
  action**. Keep the stored settings until the user clears it.
- Draw a warning badge on the key face (reuse the imported-command badge style).
- Do not silently reset the action when the plugin list refreshes.

**Files:** `renderer/inspector.js`, `renderer/render.js`.

**Acceptance:** an unknown plugin UUID shows the badge and warning; Open Store
opens the Stream Deck catalogue; Clear action removes only that action.

## 6. Arch M13 — Multi Action does not await steps or stop on failure

**Problem:** `runMulti` calls `runKeyAction` without awaiting, and a failed step
does not stop the sequence.

**Target:**
- `runKeyAction` becomes async and returns the action result
  (`{ok}`/`{ok:false,error}`); plugin/page/timer/brightness paths return a
  result too.
- `runMulti` awaits each step and stops on `ok === false` (with the existing
  toast from `runKeyAction`).
- Keep launch-only shell actions non-blocking by design; document that their
  result resolves on spawn.

**Files:** `renderer/press.js`.

**Acceptance:** “Type text → hotkey” waits for typing; a failed step prevents
later steps.

## 7. Arch M14 — one global sequence token

**Problem:** a sequence on key B cancels key A, and leaving the page does not
cancel a delayed sequence.

**Target:**
- Per-action run tokens (`WeakMap`) instead of one global token.
- A shared `cancelSequences()` called from `clearPressTimers()` so page/profile
  transitions stop pending sequences.
- Independent keys can run sequences concurrently.

**Files:** `renderer/press.js`, `renderer/ui.js`.

**Acceptance:** two keys run independently; leaving the page stops a delayed
sequence before its next step.

## Order of work

1. H1 + H10 (one layout commit).
2. H2.
3. H4.
4. H11.
5. M13 + M14 (one action-model commit).
6. Release 0.9.0.

## Out of scope (later)

- Page reorder (UI M7), multi/toggle step types + reordering (M8).
- POP keyboard access (M14 UI), type scale (M3), icon language (M4),
  1179 breakpoint (M16), store detail (M27).
- Renderer modules + L5 image IPC; `ipc.js` split; more `main.js`/`ipc.js`
  end-to-end tests.
