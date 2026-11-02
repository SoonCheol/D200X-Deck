# 0.10.0 — editing depth and safe destructive actions

Status: shipped 2026-11-02 in **0.10.0**. Scope: the last open UI High (H9),
the three remaining editor Mediums (M7, M8, M14), and the hierarchy fix from
M34. The two audits were re-triaged against the changelog first; the result is
below so this plan does not reopen shipped findings.

Sources:
[`reviews/2026-11-01-uiux-audit.md`](reviews/2026-11-01-uiux-audit.md),
[`reviews/2026-11-02-architecture-audit-2.md`](reviews/2026-11-02-architecture-audit-2.md),
and [`ROADMAP.md`](ROADMAP.md).

## Triage against 0.9.0

### UI audit

All Highs are shipped except **H9**:

| Finding | Status |
| --- | --- |
| H1, H2, H4, H10, H11 | 0.9.0 |
| H3, H5, H6, H7, H8 | 0.8.4 |
| **H9 — destructive actions use native `confirm()` with no undo** | **open** |

H9 was outside the 0.9.0 scope. 0.8.10 only disabled Clear page on an empty
page (M34); the dialog, the hierarchy and the missing undo are unchanged.

Mediums still open:

| Finding | Notes |
| --- | --- |
| **M7 — pages cannot be reordered** | in scope |
| **M8 — Multi/Toggle editor lacks types and reordering** | in scope |
| **M14 — POP is mouse-only** | in scope |
| **M3 — fragmented type scale** | 0.11.0 polish |
| **M4 — four icon languages** | 0.11.0 polish |
| **M16 — 1179 px breakpoint cliff** | 0.11.0 polish |
| **M27 — store detail is sparse** | 0.11.0 polish |
| **M34 — New page not primary** | folded into H9 |

The rest shipped: M1/M2/M5/M10/M11/M17/M20/M22/M28 in 0.8.4; M6/M9/M13/M19/
M23/M24/M30/M33/M35 in 0.8.10; M12/M15/M29 in 0.8.11; M18/M21/M25/M26/M31/
M32 in 0.8.12. UI lows L7–L12 are cosmetic and stay backlog.

### Architecture audit

Open findings, deferred to the architecture batch:

| Finding | Notes |
| --- | --- |
| M3 — process generations share lifecycle state | stale exit can clear a newer socket; restart is per UUID |
| M18 — synchronous archive extraction | `unzip`/main-thread expansion before size checks |
| M24 — no fake-Electron IPC harness | extracted helpers are tested, wiring is not |
| L3 — own-format export/import is not a round trip | drops `wideMode`, `autoExitSeconds`, profile icon |
| L4 — unmapped import data is lost on reload | `normalizeKey()` drops `sourceAction` |
| L6 — resolved catalogue releases never expire | ten-minute item cache only |
| Renderer `no-undef` | shared globals are still unchecked |
| L8 — full-image config IPC | waits for the 1.0 measurement; not a bug fix |

Everything else shipped: H1/H2/M1/M2/M4/M5/M8/M9 in 0.8.5; M6/M7 in 0.8.6;
M10/M11/M12 in 0.8.7; M13/M14 in 0.9.0; M15/M17/M19–M23/L5/L7/L9 in 0.8.9;
M16/L1/L2/M25/L10 in 0.8.11.

## Ground rules

- macOS-only Electron app, MIT. No copied third-party code or secrets.
- Before each commit: `cd app && npm test && npm run lint && npm run typecheck`.
- Runtime checks copy the demo config, never the real one:
  `cp -R /tmp/sdapp /tmp/0100-config` and run with
  `ULANZI_NO_DECK=1 ULANZI_CONFIG_DIR=/tmp/0100-config`.
- One focused commit per item, then release 0.10.0 with the usual flow
  (bump `app/package.json` + lock, CHANGELOG section, “Release 0.10.0”, tag,
  push, `gh run watch`, `npm run install-app`).
- Keep the existing visual language and code style.

## 1. H9 — safe destructive actions

**Problem:** Clear page, Delete page, Delete profile, Remove plugin, Delete
icon pack and Replace import all call the stock `confirm()`: OK is the default
button, the copy does not name the concrete action, and only Clear key has
undo. At 0 keys Clear page is disabled, but New page is still a neutral third
button.

**Target:**

- A reusable in-app `confirmAction({ title, message, confirmLabel, tone })`
  returning a Promise. `#confirm-modal` follows the existing modal shell:
  `role="dialog"`, `aria-modal`, `data-autofocus` on **Cancel**, Escape and
  backdrop cancel, `focusModal()` returns focus to the trigger. Add it last in
  `anyModalOpen`, `MODAL_CLOSERS` and `topModal` so it stacks above the plugin
  and store dialogs.
- `tone: 'danger'` uses a filled danger button (`.btn.danger-solid`); the
  default Cancel stays secondary and focused.
- Replace the six destructive `confirm()` calls:
  - Clear page — “Clear 13 keys”; message names the page and says ⌘Z restores.
  - Delete page — “Delete page”; no undo, the message says so.
  - Delete profile — “Delete profile”.
  - Remove plugin — “Remove plugin”.
  - Delete icon pack — “Delete pack”.
  - Replace import — “Replace pages”.
- Page settings hierarchy: **New page** primary, **Duplicate** secondary, then
  a right-aligned **Clear N keys** danger button (`flex: 0 0 auto;
  margin-left: auto`), disabled at 0. Move it out of the first slot.
- Clear page snapshots the page keys (deep copy) before clearing.
  `⌘Z` restores keys, selection and re-renders, with a toast. A later key
  clear/paste replaces the snapshot, exactly like `lastCleared` today.
- Keep the security-consent prompts (imported shell commands, Rosetta,
  store install) on the native dialog for this milestone; they are not data
  loss.

**Files:** `renderer/index.html`, `renderer/styles.css`, `renderer/app.js`,
`renderer/inspector.js`, `renderer/ui.js`, `renderer/pickers.js`,
`renderer/import-ui.js`.

**Acceptance:** every destructive action opens the in-app modal with Cancel
focused; Escape cancels; the confirm label is specific; Clear page can be
undone with ⌘Z after the modal closes; New page is the primary control and
Clear is disabled at 0 keys.

## 2. M7 — reorder pages

**Problem:** page array order drives Next/Previous, but there is no way to
change it except deleting and recreating pages.

**Target:**

- Give each row `data-page-id` and make it draggable. Dragging uses a separate
  `application/x-ulanzi-page` type so it cannot be confused with key DnD.
  Drop before/after based on the pointer's midpoint, with a visible insertion
  line.
- A `movePage(pageId, targetId, after)` helper removes the page from
  `state.config.pages` and reinserts it around the target. Pages of other
  profiles keep their relative slots; `profileId`, `parentId` and the active
  page are untouched.
- Keyboard: `Alt+↑` / `Alt+↓` on a focused page row moves it one sibling and
  keeps focus on the moved row after re-render. Add this to the Tips block.
- Persist with `commit(false)` (order affects the deck's Next/Previous, so it
  schedules a push), then `renderPageList()` and refocus.

**Files:** `renderer/ui.js`, `renderer/styles.css`, `renderer/inspector.js`
(Tips copy).

**Acceptance:** dragging a page above/below another changes Next/Previous
immediately and survives a reload; `Alt+↑/↓` does the same with focus kept;
the active page and subpage relationships do not change.

## 3. M14 — POP keyboard access and identity

**Problem:** the POP window is `focusable: false`, so Escape, Tab and arrow
keys never reach it; only the X or the 15 s timeout closes it. It shows emoji
instead of action icons and the header says “POP”.

**Target:**

- `focusable: true`; `show()` and `focus()` on ready. Focus the first item
  after items render.
- Arrow-key grid navigation (3 columns): Left/Right/Up/Down/Home/End move
  focus; Enter/Space activate the focused button; Escape closes. Keep the
  existing click path.
- Close when the window is blurred (click elsewhere), but do not restore focus
  in that case.
- Capture the frontmost app before showing (`frontmostApp()`), and after a
  choice, Escape or X, restore it with `actions.openApp(previous.path)` before
  resolving `pop:show` when it is not this app. This preserves “run the chosen
  action in the app the user was in”.
- Send a sanitized `icon` per item (`popItem()` uses `actionIconSrc`), accept
  only `assets/*.svg` paths in main, and render the icon above the label.
  Fall back to the emoji.
- Header/`<title>` become **Quick actions**; add a visible focus ring; cap the
  label to two lines instead of one-line ellipsis.

**Files:** `app/ipc.js`, `app/renderer/pop.js`, `app/renderer/pop.html`,
`app/renderer/press.js`, `app/renderer/styles.css` (only if shared classes are
touched).

**Acceptance:** with another app frontmost, a POP key takes focus, the first
item is focused, arrows move, Enter chooses, Escape and clicking away close,
and focus returns to the previous app before the action runs. Icons appear for
the bundled action types; “Quick actions” replaces “POP”.

## 4. M8 — complete the Multi/Toggle step editor

**Problem:** steps can only be hotkey/media/text/app/url/command/page, and
there is no reorder control. A sequence cannot include a plugin, sound, timer,
brightness or close step.

**Target:**

- Extend `MULTI_STEP_TYPES` with `close`, `sound`, `timer`, `brightness` and
  `plugin`. Do not offer `multi`, `toggle`, `pop` or `indicator` (recursive or
  nonsensical inside a sequence).
- Defaults per type: timer `{ seconds: 300, sound: true }`, brightness
  `{ op: 'up', step: 5 }`, sound `{ op: 'play', value: '', volume: 1 }`,
  plugin `{ sdk, plugin, action, actionid: uuid(), settings: {} }`.
- Each row becomes a two-line card: index + type + grip/move/remove on the
  first line, type-specific controls on the second. Controls:
  - hotkey — existing modal button; media/page — selects.
  - timer — seconds + “Play a sound” checkbox.
  - brightness — Brighter/Dimmer select + step %.
  - sound — Play/Stop select + path input + **Choose…** (`api.pickAudio`).
  - plugin — plugin select + action select, stacked; changing a plugin picks
    its first action, changing an action creates a new `actionid` and clears
    settings.
  - app/url/command/text/close — text input (close uses the app name).
- Reordering:
  - A drag grip (`⠿`) sets `application/x-ulanzi-step`; dropping on a row moves
    the step there.
  - Accessible `↑` / `↓` buttons move one position; after re-render, focus the
    same step's button. Delays are reorderable too.
- Keep the 9-step POP cap and the 12-step Multi cap; keep `collectPluginActions`
  (already walks nested steps) unchanged.
- Add a shared-meta test asserting the new types are present and the recursive
  types are absent.

**Files:** `app/lib/actions-meta.js`, `app/renderer/inspector.js`,
`app/renderer/styles.css`, `app/test/shared-meta.test.js`.

**Acceptance:** a sequence can run a plugin action, a timer, brightness, a
sound and a close step; steps reorder by drag and by ↑/↓ and the order survives
a reload; recursive types are not offered.

## Order of work

1. H9 (one safety commit).
2. M7.
3. M14.
4. M8 (largest; one editor commit).
5. Release 0.10.0.

## Architecture batch

After 0.10.0: M3 (per-generation child/socket ownership), M18 (bounded
extraction off main), M24 (fake-Electron IPC harness), L3/L4 (round trips),
L6 (release-cache expiry), renderer `no-undef` with explicit cross-file
bindings. L8 stays in 1.0 until a representative large profile is measured.

## 0.11.0 — visual and store polish

M3/M4 (type scale, icon language), M16 (breakpoint), M27 (store detail) and
the remaining UI lows. No new structural work.

## Out of scope

- Firmware update, Python plugins, multi-device support (D200X / Dial / AU05),
  OBS actions.
- Renderer module split and L5 lazy image refs (ride on the architecture contracts
  and the 1.0 measurement).
- Native confirmations for security consent (shell commands, Rosetta, store
  install) — they stay native for now.
