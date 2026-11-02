# Ulanzi Deck Open — UI/UX audit

**Build:** 0.8.0 (dev build from `6a86d3c`), macOS, Electron
**Windows tested:** 1600×900, 1180×800, 1080×700, 1080×600
**Config:** frozen copies of the demo profile (`/tmp/uiux-config-f`, 19 plugins; `/tmp/uiux-config-b`, one icon pack) — never the real config or installed app
**Screenshots:** `/tmp/uiux-audit/` (81 images)
**Date:** 2026-11-01

---

## 1. Executive summary

**Verdict: a visually confident editor with a strong core, but the polish collapses at the edges — narrow windows, plugin keys, modals and accessibility are not production-grade.**

At 1600×900 the app looks like a finished product: the dark three-pane layout is clear, the deck mock is convincing, the action taxonomy is sensible and the iconography is mostly coherent. The key-editing loop (select → edit → live preview → push) is fast and understandable.

The failures are concentrated where daily use actually happens:

1. **Page-level editing disappears below 1180px.** The inspector becomes a drawer that only opens for a key. There is no way to open Page settings at 1080 (or on a 1024×768 display or half-screen window), so backgrounds, parent pages, auto-exit and duplicate are unreachable.
2. **Plugin keys are visually corrupted by the app's own caption.** The renderer draws the user caption over plugin-rendered live images. In the demo the Claude key reads “Reset in 42m” with “Claude 5h” printed on top; the currency key has two “USD → BRL” lines. At 1180 the 80px key is illegible.
3. **The Deck settings popover overlaps the inspector** by 48px at ≥1360 (hard-coded `right:392px` against a 440px inspector), and at 1080 it sits behind the inspector drawer, leaving clipped fragments of both panels visible.
4. **Nothing tells you the deck is out of sync.** With auto-push off (the demo default) you can edit every key while “synced 18:57” stays on screen. The Push button never shows a dirty state.
5. **The sidebar breaks with many pages.** The page list has no height bound, so 14 pages push Plugins/Store and the device card off-screen — the connection status disappears for power users.
6. **Toasts render behind modals.** Install/remove/import results are invisible because the toast is z-index 50 and every modal is 80.
7. **Accessibility is the weakest axis.** All 14 grid keys are announced as “1”…“14” (the slot badge is the accessible name), and each page row contributes an invisible `×` delete button to the tab order.
8. **At 1080 the inspector drawer covers the Push button and 3.5 columns of the deck.** With auto-push off you must close the drawer to push.
9. **Destructive page actions use the stock Chromium `confirm()`** (OK is default) with no undo, and “Clear page” is the first, most prominent button in Page settings.
10. **A key pointing at a removed plugin looks completely normal.** The key keeps its icon/caption and the inspector silently falls back to “Choose a plugin…”, with no “plugin missing” warning or recovery action — the common outcome of importing a profile without its plugins.
11. **Modals never restore focus**, initial focus lands on the close “×”, and profile/hotkey dialogs are hard-coded to 720px tall with 200–250px of dead space.

There is no crash/data-corruption bug in the audited paths. The severity is “the app fights you at common sizes and hides feedback”, not “the app loses your work” — with the exception of Clear page, which is one Enter away from irreversible loss.

---

## 2. Scorecard

| Area | Score | One-sentence reason |
|---|---|---|
| **Visual design** | **6.5 / 10** | Attractive dark system and good depth, undermined by caption collisions, four icon languages and a 9–30px type scale with 15 steps. |
| **Layout** | **4.5 / 10** | The 1600 layout is good; the 1179 cliff, unreachable page settings, sidebar overflow, 48px sheet overlap and fixed-height modals are structural. |
| **Interaction** | **5.5 / 10** | Core editing works and is fast; no dirty state, no page/step reordering, mouse-only POP, native confirms, focus not restored. |
| **Consistency** | **5.5 / 10** | Terminology drifts (“Key brightness” changes the deck, “Hotkey switch” is a toggle, “VALUE” for everything), and the disconnected state has five names. |
| **Accessibility** | **3.5 / 10** | Unnamed grid, invisible focusable delete, no focus return, no live status, tabs without arrow keys, unfocusable POP. |
| **Copy / empty states** | **5.5 / 10** | Plugin/icon empty states teach the next step; store empty states, raw errors, “1 pages” and generic labels do not. |
| **Error / edge states** | **4.5 / 10** | “Needs Rosetta” is handled well; missing plugins, plugin crashes, offline store and update failures are raw or silent. |
| **Overall** | **5.1 / 10** | Strong bones, weak edges. Fix the ten items in §1 and this is an 8. |

---

## 3. Findings

### HIGH

#### H1. Page settings are unreachable at ≤1179px
**Where:** Page settings / inspector — `renderer/inspector.js:443`, `renderer/inspector.js:1378`, `renderer/styles.css:1206`, `renderer/styles.css:1216`
**What:** At ≤1179 the inspector becomes `position:fixed` with `transform:translateX(105%)` and only `.open` reveals it. `renderInspector()` removes `.open` whenever `state.selected === null`, and the Page-settings branch returns before the drawer-open code. At 1080×700 with no key selected the inspector is simply gone (`76-page-settings-1080.png`); Escape after selecting a key closes the drawer and leaves no Page settings (`77-selected-then-esc-1080.png`). There is no toolbar/menu entry to open it.
**Why it matters:** On any window under 1180px (half-screen, a 1024×768 display, or a resized window) users cannot set a parent page, auto-exit, page background/snapshot, duplicate a page or clear a page. Only the page-name field in the toolbar still works. This is a functional loss of half the page model on common window sizes.
**Fix:** Add a persistent “Page settings” button in the toolbar (or make the page title open the drawer with `selected=null`). Keep the drawer openable with no selection, add a backdrop and a close button. Make the drawer width 360px so it covers less of the deck.
**Effort:** M · **Confidence:** high

#### H2. Plugin live images get the app caption printed over them
**Where:** Grid key rendering — `renderer/render.js:292-311`; demo keys 0/3/4; screenshots `30-main-1600-demo.png`, `34-key-plugin-sd.png`, `77-selected-then-esc-1080.png`, `86-key-1180.png`
**What:** `drawKey()` always draws `key.label` at `h-13` behind a 0.78-black gradient, even when the face is a plugin-supplied live image. In the demo:
- Claude key: plugin image says “Reset in 42m”; the app prints “Claude 5h” on the same line (`crop-claude.png`).
- Currency key: plugin image has “USD → BRL 19:00”; the app prints “USD → BRL” over it.
- At 1180 (80–88px keys) both lines collapse into an unreadable smear.
**Why it matters:** Stream Deck/Ulanzi plugins draw complete faces including their own labels; the extra caption is duplicated text on the most information-dense keys. This is the default state of the shipped demo, not an edge case.
**Fix:** Default `font.showLabel=false` when the effective icon comes from a plugin live image (or when `action.type === 'plugin'`); expose “Show caption” as an opt-in. Skip the bottom gradient when no caption is drawn. Consider a per-plugin manifest flag.
**Effort:** S/M · **Confidence:** high

#### H3. Deck settings overlaps the inspector (48px) and hides behind the drawer
**Where:** `renderer/styles.css:1170` (`right:392px`), `renderer/styles.css:45` (`--inspector:440px`), `renderer/styles.css:1216` (drawer z 70)
**What:** Measured at 1600: sheet spans **768–1208**, inspector spans **1160–1600** → **48px overlap**. The sheet covers the left edge of Page settings, clipping “Clear page” and “PAGE NAME” (`74-update-error.png`, `75-light-controls.png`). At 1080 the sheet (`right:24`, 440 wide) and the inspector drawer overlap; the drawer (z 70) sits on top of the sheet (z 40), leaving clipped sheet labels visible at x=616–640 (`56-settings-1080-demo.png`).
**Why it matters:** The most-used settings surface visually collides with the editor on every window ≥1360, and at laptop sizes two panels fight for the same space.
**Fix:** `right: calc(var(--inspector) + 8px)` instead of 392px. When the drawer is open at ≤1179, either close the sheet or render it as a full-width sheet. At 1359→1360 the current constant jumps from an 8px gap to a 48px overlap.
**Effort:** S · **Confidence:** high

#### H4. No dirty/unsynced state; the “synced” label lies
**Where:** `renderer/ui.js:497-536` (`schedulePush` returns when `autoPush` is false), `renderer/ui.js:520-536`; demo config `autoPush:false`; `80-deck-connected.png`
**What:** With auto-push off, editing a key calls `commit()` → `schedulePush()` → immediate return. `#push-state` is only written by `pushNow()`, so it keeps “synced 18:57” indefinitely. The Push button has no dot/badge/disabled state. I edited a label and the status still read “synced 18:57” (eval returned `synced 18:57 | autoPush=false`). The only sync text is 9.5px uppercase at the bottom of the deck shell.
**Why it matters:** Users cannot tell whether the physical deck matches the editor. They either walk away with a stale deck or push redundantly. This is the core trust signal of a deck editor.
**Fix:** Set a `dirty` flag in `commit()` whenever auto-push is off; render “Unsynced changes” in the toolbar (and a dot on Push); clear it on successful push. Move the sync line to 11px and make it a status pill. Make the offline CTA a secondary “Connect Deck” button with the reason inline (not only a tooltip).
**Effort:** M · **Confidence:** high

#### H5. Sidebar overflows with many pages; footer disappears
**Where:** `renderer/styles.css:58` (flex column), `renderer/styles.css:108` (`.page-list{overflow:auto}` with no flex/min-height), `renderer/styles.css:141` (`margin-top:auto` footer); `72-many-pages.png`
**What:** With 14 pages the page list grows to ~574px and pushes “Plugins & Icons”, Installed/Store, and the device card below the 900px window. In `72-many-pages.png` the device card is gone and the Plugins header is at y=875. There is no visible scrollbar on the sidebar.
**Why it matters:** The users with the most pages lose the connection status, the reconnect button and the store entry points — exactly the controls they need most.
**Fix:** `.page-list{flex:1 1 auto; min-height:0}`; `.sidebar-foot{flex:none}`; add a subtle top/bottom fade. Optionally cap the list and add a “+ N more” row.
**Effort:** S · **Confidence:** high

#### H6. Toasts render behind modals
**Where:** `renderer/styles.css:519` (toast z 50), `renderer/styles.css:557` (modal z 80); `63-toast-behind-modal.png`
**What:** I fired `toast("Installed MIDI plugin")` with the Store open; it is completely invisible behind the backdrop. Install/remove/import/reload success and failure messages all use this toast.
**Why it matters:** The user performs an action inside a modal and gets no feedback; failures look like nothing happened. This is especially bad for install/download operations that take seconds.
**Fix:** Raise `.toast` to z-index 100 (or portal it inside the top modal); add a success/error icon and use the existing `.bad` color more strongly. Keep `role=status`.
**Effort:** S · **Confidence:** high

#### H7. The key grid has no accessible names; an invisible delete is a tab stop
**Where:** `renderer/ui.js:140-153` (key button + badge), `renderer/ui.js:106-115` (page delete), `renderer/styles.css:134-139` (`opacity:0`, hover only)
**What:** Every grid key is a `<button>` containing a canvas and a `span.badge` with “1”…“14”. The computed accessible name is the slot number — I read `innerText` for the first four keys: `["1","2","3","4"]`. The per-page delete `×` is `opacity:0` until hover, has no `:focus` rule, but is focusable: focusing it yields `opacity:0` and a 2px outline that is also invisible.
**Why it matters:** A screen-reader user hears “1 button” for the Safari key and cannot identify any key. A keyboard user tabs into an invisible control and loses their place.
**Fix:** `btn.setAttribute('aria-label', `${label || 'Empty key'} — ${actionLabel}, key ${i+1}`)`, `aria-hidden="true"` on the badge; make `.del` visible on `:focus-visible` and give it `aria-label="Delete page X"`. Consider a roving tabindex for the grid (one tab stop + arrows).
**Effort:** S/M · **Confidence:** high

#### H8. Modal focus is never returned; initial focus lands on the close “×”
**Where:** `renderer/app.js:1458-1502` (`MODAL_CLOSERS`, `focusModal`), `renderer/app.js:1490-1500` (Tab wrap only)
**What:** Measured: opening Store focuses `#store-modal-close`; opening About focuses `#about-close`; Escape closes and `document.activeElement` becomes `BODY`. Tab wrapping from the last element back to the first works. No closer stores/restores the trigger.
**Why it matters:** Keyboard users lose their place after every dialog and the first Tab goes to “close” instead of the task (search, name, install).
**Fix:** Store `document.activeElement` in `focusModal` and restore it in each closer; focus the primary input/action (`#store-search`, `#profile-name`, first source) instead of the X; keep the X last in DOM order.
**Effort:** S · **Confidence:** high

#### H9. Destructive page actions use native `confirm()` with an affirmative default and no undo
**Where:** `renderer/inspector.js:610` (Clear page), `renderer/ui.js:614` (Delete page), `renderer/app.js:598` (Delete profile), `renderer/import-ui.js:123` (Replace import), `renderer/pickers.js:323/448`
**What:** “Clear page” is the first and widest-emphasis button in Page settings (`30-main-1600-demo.png`). It calls `confirm()`, which renders a stock Chromium dialog with OK/Cancel (OK is default). Clear page has no undo — unlike Clear key, which toasts “Key cleared — ⌘Z to undo”. The same native dialog is used for delete page/profile, remove plugin, delete icon pack and replace import.
**Why it matters:** One Enter after clicking the first button wipes 13 configured keys. The dialog doesn’t say “Clear”, doesn’t match the dark UI, and there is no recovery.
**Fix:** In-app confirm modal with a danger primary labelled “Clear 13 keys” and Cancel as the default/focused button; snapshot the page for ⌘Z; move the destructive button to the right and style it as secondary/danger.
**Effort:** M · **Confidence:** high

#### H10. The 1080 inspector drawer covers the primary action and most of the deck
**Where:** `renderer/styles.css:1216` (fixed 440px drawer), `04-key-1080.png`, `56-settings-1080-demo.png`
**What:** At 1080, selecting a key opens a drawer from x=640 to 1080. It covers the toolbar’s “Deck” and “Push to Deck” buttons (x≈944–1017) and 3.5 of 5 columns. There is no scrim and no way to push without closing the drawer; auto-push is off by default.
**Why it matters:** Editing and pushing cannot be done in one view on a laptop-sized window. The user must close the drawer (losing context) to push, then reopen it.
**Fix:** Keep the inspector in the grid at 1080 (stage 400–450px is still usable) or make the drawer 360px and keep a sticky toolbar above it. Add a scrim and a “Push” action in the drawer header.
**Effort:** M · **Confidence:** high

#### H11. A key pointing at a removed plugin looks normal and silently resets the inspector
**Where:** `renderer/inspector.js:780-800`; `84-missing-plugin.png`
**What:** With `action.plugin` set to an unknown UUID, the key renders the generic plugin icon plus its caption, and the inspector shows “Choose a plugin…”, “Choose an action…” and “Choose a plugin and an action to configure its settings.” There is no “plugin missing” warning, no reinstall link and no remove action; pressing the key only produces a runtime toast.
**Why it matters:** Imported profiles routinely reference plugins that aren’t installed; the user sees a configured-looking key that silently does nothing and an inspector that looks like an unconfigured new key. The stored settings are still there but invisible.
**Fix:** Detect `action.plugin && !plugin` and show a warning block (“Plugin ‘X’ isn’t installed” + [Open Store] [Clear action]) plus a warning badge on the key face. Keep the stored settings until the user clears them.
**Effort:** S/M · **Confidence:** high

---

### MEDIUM

#### M1. Brightness step field collapses to 22px
**Where:** `renderer/inspector.js:730-737`, `renderer/styles.css:458` (`.field .row .input{flex:1;min-width:0}`), `renderer/styles.css:474` (`.select{width:100%}`); `18-brightness.png`
**What:** Measured: select **355.6px**, step input **22px**, with a stranded “%”. The `<select>` takes the whole row because `width:100%`; the flex input shrinks to nothing.
**Why it matters:** The Brightness action cannot be configured — the step value is invisible and effectively uneditable.
**Fix:** `.field .row > .select{flex:0 0 auto;width:auto}` or `#insp-brightness-step{flex:0 0 64px}`.
**Effort:** S · **Confidence:** high

#### M2. Fixed 720px modal height leaves large voids
**Where:** `renderer/styles.css:684` (global `.modal-card{height:min(720px,…)}`), `:627` (update 560), `:1297` (profile width); `46-profile-new.png`, `47-profile-edit.png`, `50-hotkey-modal.png`, `53-update.png`
**What:** Measured profile card **480×720** with ~250px of empty space below “Delete profile”; the hotkey modal has ~200px below its footer; the update card is 560 tall with a blank notes area. Import and About override `height:auto`; the rest inherit the global 720px.
**Why it matters:** Dialogs look unfinished, waste vertical space, and on 700px-tall windows they are 620px and still mostly empty.
**Fix:** Remove the global height; set `height:auto;max-height:min(720px,calc(100vh-80px))` for profile/hotkey/update; keep 720 only for list modals (store/installed/icons).
**Effort:** S · **Confidence:** high

#### M3. Type scale is fragmented and too small
**Where:** `renderer/styles.css` — 15 distinct sizes (9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 14, 15, 17, 18, 22, 30)
**What:** Labels/hints are 10px, device labels and sync status 9.5px, version 10px, stage hint 11px; uppercase labels use 1.1–1.4px letter-spacing at 10px. Contrast passes (muted 6.1:1 on panel), but size does not.
**Why it matters:** The most important status (sync, connection, hints) is the smallest text on screen; low-vision users and high-DPI scaling suffer.
**Fix:** Consolidate to 11/12/13/15/22. Raise hints to 11px and sync/device meta to 11px. Reserve 9.5 only for decorative device labels.
**Effort:** M · **Confidence:** high

#### M4. Four icon languages in one screen
**Where:** `renderer/index.html:58-66` (🔌/🛍), `renderer/index.html` “⚙︎ Deck”, action SVGs, app icons, plugin live images, `renderer/pop.js` emoji, text glyphs “+ × ⋯ ⟳”
**What:** `30-main-1600-demo.png`: tiny colored emoji in the sidebar next to monochrome SVG action icons and full-color app icons; a text gear in the toolbar; POP uses emoji only; “+”, “×”, “⋯” and “⟳” are text glyphs with different weights.
**Why it matters:** The UI reads as assembled from parts; the sidebar is the first thing a new user sees.
**Fix:** Replace sidebar emoji and the gear with the existing SVG set (plug, bag, gear); use action icons or app icons in POP; unify “+ / × / ⋯” as SVGs.
**Effort:** M · **Confidence:** high

#### M5. Action labels are misleading or generic
**Where:** `lib/actions-meta.js:43` (`toggle: 'Hotkey switch'`), `:47` (`brightness: 'Key brightness'`), `renderer/press.js:107-118` (it changes deck brightness), `renderer/inspector.js` value labels
**What:** “Hotkey switch” is actually a two-action toggle (`82-toggle.png`); “Key brightness” changes the whole deck’s brightness; the value field is “VALUE” for text/command/sound/close/timer but “Application/URL/Combination/Navigation/Steps/About” elsewhere (`17-timer.png`, `20-close.png`, `11-sound.png`).
**Why it matters:** Users can’t find the toggle action and misread key brightness as per-key; “VALUE” doesn’t say what to enter.
**Fix:** Rename to “Toggle two actions” and “Deck brightness”; add per-type labels (“Text to type”, “Command”, “Sound file”, “Application”, “Duration (seconds)”).
**Effort:** S · **Confidence:** high

#### M6. Five names for the disconnected state
**Where:** `renderer/ui.js:51-60`, `renderer/index.html`; `01-main-1600.png`, `79-deck-busy.png`
**What:** “DISCONNECTED” pill, “No Deck found / Disconnected” card, “NOT CONNECTED” under the deck, “Deck offline” button. In the busy state the card says “Deck busy / Ulanzi Studio is using it” while the pill still says “DISCONNECTED” and the footer says “NOT CONNECTED”.
**Why it matters:** Users can’t tell whether the deck is absent, busy or broken; the most actionable state (another app holds the device) is the least reflected.
**Fix:** One state model — Connected / No deck / In use by Ulanzi Studio / Error — used consistently in the pill, card, footer and button. Pill should read “In use” in the busy state.
**Effort:** S/M · **Confidence:** high

#### M7. Pages cannot be reordered
**Where:** `renderer/ui.js:90-130` (page list); `72-many-pages.png`
**What:** There are no drag handles or up/down controls. Array order drives Next/Previous page navigation.
**Why it matters:** Users must delete and recreate pages to change deck navigation order — a destructive workaround.
**Fix:** Make page rows draggable (DnD already exists for keys) or add Move up/down in a row menu; persist order.
**Effort:** M · **Confidence:** high

#### M8. Multi/toggle editor can’t include most action types and can’t reorder steps
**Where:** `lib/actions-meta.js:69-77` (`MULTI_STEP_TYPES`), `renderer/inspector.js:139-181`; `81-multi.png`
**What:** Step types are only hotkey/media/text/app/url/command/page — no plugin, sound, timer, brightness, close or pop. There is no drag handle or up/down; reordering means delete + re-add.
**Why it matters:** The flagship “Multi action” can’t sequence a plugin or a sound, and long sequences are painful to edit.
**Fix:** Reuse the main `ACTION_GROUPS` (minus recursive multi/pop) and add drag reordering with a visible handle.
**Effort:** M/L · **Confidence:** high

#### M9. Page indicator offers dead controls and still draws the caption
**Where:** `renderer/inspector.js:894-907`, `renderer/render.js:292`; `16-indicator.png`
**What:** Copy says “It cannot be pressed” and “Icon/text settings are ignored”, yet “Press triggers” (hold/double) and the caption field are shown/enabled, and the caption “Safari” is drawn over the indicator.
**Why it matters:** Contradictory UI; users configure triggers that never fire, and the key face is wrong.
**Fix:** Hide Press triggers and caption/face/color controls for indicator; draw only number/dots. If a caption is wanted, make it explicit.
**Effort:** S · **Confidence:** high

#### M10. Store empty / no-result states are unhelpful
**Where:** `renderer/store-ui.js:270`; `73-store-no-results.png`
**What:** “No plugins found.” centered mid-panel with “0 of 0” stranded at y=372, no “clear search” or suggestion; the 720px card stays mostly empty. Icon search no-results (`61-icon-search-empty.png`) is better worded but also has no clear action.
**Why it matters:** A failed search looks like an empty store, and the count looks like debug output.
**Fix:** Centered empty state: “No plugins match ‘zzzzz’” + [Clear search] + “Browse categories”; hide the count at 0; shrink the card when empty.
**Effort:** S · **Confidence:** high

#### M11. Raw technical errors are surfaced
**Where:** `renderer/app.js:636`, `renderer/store-ui.js:207/256`; `74-update-error.png`
**What:** “Could not check for updates: getaddrinfo ENOTFOUND api.github.com”; store errors print `res.error` directly in red.
**Why it matters:** Not actionable for a non-developer; looks broken.
**Fix:** Map errors to human copy (“Couldn’t reach GitHub. Check your connection.”) with a Retry button; log the raw error.
**Effort:** S · **Confidence:** high

#### M12. Tabs are ARIA tabs without keyboard behaviour
**Where:** `renderer/index.html` (settings/store tabs), no arrow-key handler (only grid arrows at `renderer/app.js:1016`)
**What:** `role="tab"` + `aria-selected`, but no `aria-controls`, no roving tabindex, no Left/Right/Home/End. Every tab is a separate Tab stop.
**Why it matters:** Screen-reader/keyboard users expect arrow navigation; the pattern is announced but not implemented.
**Fix:** Implement WAI-ARIA tabs (roving tabindex + arrows) or drop the tab roles and use buttons with `aria-pressed`.
**Effort:** S/M · **Confidence:** high

#### M13. Connection and sync changes are not announced
**Where:** `renderer/ui.js:51-60`, `:520-536`
**What:** `#status-pill` and `#push-state` are plain spans; only the toast has `aria-live`. A deck disconnect or “push failed” is silent to screen readers.
**Why it matters:** Blind users can’t tell whether a push succeeded or the deck dropped.
**Fix:** `role="status" aria-live="polite"` on the pill and push state; announce “Deck disconnected” / “Push failed”.
**Effort:** S · **Confidence:** high

#### M14. POP is mouse-only and uses a separate visual language
**Where:** `ipc.js:905` (`focusable:false`), `renderer/pop.js`, `renderer/pop.html`; `58-pop.png`
**What:** The POP window cannot take focus, so its Escape handler and Tab can never work; there is no outside-click close (only X or the 15s timeout). Items show emoji + label only, not the app/action icons; the header says “POP”.
**Why it matters:** Keyboard users can’t use or dismiss it, and it looks unrelated to the deck.
**Fix:** `focusable:true` + focus the first item; arrow-key grid navigation; Escape/outside click close; render action icons; title the popup with the key caption.
**Effort:** M · **Confidence:** high

#### M15. Plugin property inspector collapses then expands (layout shift)
**Where:** `renderer/app.js:1518-1525`, `renderer/styles.css:1092`; `33-key-plugin-clock.png` vs `33b-clock-pi.png`
**What:** The PI field has `max-height:0` until the iframe reports a height. At 6.5s the Analog Clock inspector had no Settings block; at ~11s the same key showed the Settings block and pushed Press triggers down. If the PI never reports, the section stays invisible with no loading/error.
**Why it matters:** The inspector jumps while the user is reading; a broken PI is indistinguishable from “no settings”.
**Fix:** Reserve a 120px placeholder with “Loading plugin settings…”; show an error/retry after 5s; don’t collapse the whole field.
**Effort:** S/M · **Confidence:** high

#### M16. The 1179px breakpoint is a cliff
**Where:** `renderer/styles.css:1206/1216`; `65-breakpoint-1180.png`, `86-key-1180.png`
**What:** At 1180 the inline inspector leaves a 520px stage and 80–88px keys; at 1179 the inspector vanishes and the stage jumps to ~880. At 1180 the toolbar also wraps to two rows.
**Why it matters:** A 1px resize produces a radically different layout; the 1180 deck is too small to read plugin keys.
**Fix:** A collapsible inspector with a toggle at all widths; lower the breakpoint to ~1100; 360px inspector; keep the toolbar on one row.
**Effort:** M · **Confidence:** high

#### M17. Profile select clips its label at 1080
**Where:** `renderer/styles.css:1295` (`.profile-select{padding:6px 8px}`) vs `:474` (`.select{padding-right:28px}`); `03-main-1080.png`, `76-page-settings-1080.png`
**What:** The custom arrow is drawn at `calc(100%-16px)`; with only 8px right padding the arrow sits on top of “Demo” at 200px sidebar width.
**Why it matters:** The first control in the sidebar looks broken on small windows.
**Fix:** `padding-right:26px` on `.profile-select` (or remove the override).
**Effort:** S · **Confidence:** high

#### M18. Short windows clip without scrolling
**Where:** `renderer/styles.css:26` (`body{overflow:hidden}`), stage; `87-1080x600.png`
**What:** At 1080×600 the stage hint is cut at the bottom and the device nearly touches the window edge; there is no vertical scroll.
**Why it matters:** On a 600px-tall window (or larger UI scale) instructions and the deck footer are lost.
**Fix:** Allow the stage to scroll or scale the device shell with `max-height`; hide the hint below 620px.
**Effort:** S · **Confidence:** medium

#### M19. The toolbar page title bypasses the 40-char limit and uniqueness rule
**Where:** `renderer/app.js:1226`, `renderer/inspector.js:592`, `renderer/index.html:74`
**What:** `#page-title` has no `maxlength` and its input handler sets `page.name` directly; the inspector field uses `uniquePageName` and `maxlength=40`. Duplicate names make “Go to page” ambiguous.
**Why it matters:** The same value has two different rule sets; duplicate page names break navigation labels.
**Fix:** Use `uniquePageName` and `maxlength=40` in the title handler; toast on rename collision.
**Effort:** S · **Confidence:** high

#### M20. Empty keys’ “+” affordance is almost invisible
**Where:** `renderer/render.js:283-289`; `23-empty-page.png`, `88-subpage-empty.png`
**What:** `rgba(255,255,255,0.10)` at 28% of the key height on #1b2130; contrast ≈1.2:1.
**Why it matters:** The only cue that a slot is editable is barely visible; new users may not know keys are clickable.
**Fix:** Raise to 0.22–0.28 white and/or draw a 1px dashed inner border on hover; add “Click to add an action” in the empty inspector.
**Effort:** S · **Confidence:** high

#### M21. Wide-key inspector is a near-empty panel
**Where:** `renderer/inspector.js:386-433`; `21-wide.png`
**What:** Three tabs + two lines, then ~700px of blank; no preview of the clock/stats/background, and “Background” collides with the key background concept.
**Why it matters:** It looks unfinished and the option names are ambiguous.
**Fix:** Add a live preview (reuse the wide canvas), rename “Background” to “Page wallpaper”, and add a hint about where it appears.
**Effort:** S/M · **Confidence:** high

#### M22. New-profile modal offers actions that don’t apply
**Where:** `renderer/app.js:362-380`; `46-profile-new.png`
**What:** “New profile” shows Export…/Import… before a profile exists; both look enabled. Export would export nothing.
**Why it matters:** Users click a dead/misleading action; it clutters the primary task (name + Save).
**Fix:** Hide Export/Import in “new” mode (or disable with a tooltip); keep them in Manage.
**Effort:** S · **Confidence:** high

#### M23. Hotkey formatting differs between modal and inspector
**Where:** `renderer/inspector.js:666`; `08-hotkey.png` vs `50-hotkey-modal.png`
**What:** The modal shows ⌘ ⇧ 4 chips; the inspector button shows “cmd+shift+4”. The code references `#insp-hotkey-test` but never renders a Test button.
**Why it matters:** Inconsistent and less scannable; the raw token looks like a command.
**Fix:** Use the same pretty formatter in the inspector; add a “Test” button.
**Effort:** S · **Confidence:** high

#### M24. “NOT SUPPORTED” plugins have no reason
**Where:** `renderer/pickers.js:372`; `78b-unsupported.png`
**What:** 4K Capture Utility and Advanced Launcher show NOT SUPPORTED with an empty title (no tooltip/reason); only CPU shows “Needs Rosetta” (`78-rosetta.png`).
**Why it matters:** Users can’t tell whether to install Rosetta, update, or give up.
**Fix:** Always provide a `compatReason`; if unknown, say “This plugin uses an unsupported SDK” and link to the log.
**Effort:** S · **Confidence:** high

#### M25. Installed list header/action bar issues
**Where:** `renderer/pickers.js` plugin list, `renderer/styles.css`; `43-installed-scroll.png`, `78-rosetta.png`
**What:** The list scrolls under the fixed action bar; when scrolled the first visible section header (“CPU”) is clipped so only its bottom half shows; rows are cut at the card edge; the Rosetta row’s badges wrap onto a second line and its icon is a dashed placeholder.
**Why it matters:** The list looks broken mid-scroll; the unsupported row is the hardest to scan.
**Fix:** Sticky section headers inside the list; bottom padding on the scroll container; a fixed icon column and intentional badge wrap.
**Effort:** S · **Confidence:** high

#### M26. Icon-library empty state leaves a blank 200px column and a tiny emoji
**Where:** `renderer/store-ui.js:20-30`; `48-icon-library.png`
**What:** With no packs, the left pack column is empty and the right pane shows a 16px 🖼 emoji + text + button.
**Why it matters:** Looks like a rendering failure.
**Fix:** Hide the pack column when empty; center a larger illustration/icon; reuse the “Browse icon packs” CTA.
**Effort:** S · **Confidence:** high

#### M27. Store detail is sparse and detached
**Where:** `renderer/store-ui.js:300-370`; `42-store-detail.png`
**What:** Card shrinks to 980×330; icon/title left, “Back” floating far right; raw plugin id; no screenshots, release notes or installed badge.
**Why it matters:** The detail view doesn’t help decide to install; “Back” is easy to miss.
**Fix:** Back at the top-left of the detail header; add version/size/installed meta and a screenshot if available; drop the raw id or move it to a disclosure.
**Effort:** M · **Confidence:** high

#### M28. Import copy says “1 pages”
**Where:** `renderer/import-ui.js:67`; `45b-import.png`
**What:** “Default Profile / D200 · 1 pages”.
**Why it matters:** Visible grammar error in a trust-sensitive flow.
**Fix:** `${n} page${n === 1 ? '' : 's'}`.
**Effort:** S · **Confidence:** high

#### M29. Icon tiles have no meaningful accessible name
**Where:** `renderer/store-ui.js:79-83`
**What:** `<img alt="">` inside a button; the only name is `title=filename` (“office_excel.png”).
**Why it matters:** Screen-reader users can’t identify icons.
**Fix:** Humanize the filename as `aria-label` (“Excel”) or use the pack’s icon name; add alt text.
**Effort:** S · **Confidence:** medium

#### M30. Update notes are plain text in a fixed 560px card
**Where:** `renderer/app.js:649-660`, `renderer/styles.css:627`; `53-update.png`
**What:** `#update-notes` uses `textContent`; the card is 560 tall with a blank notes area. No download/install button (opens release page).
**Why it matters:** Long release notes may be unreadable; the empty area looks broken.
**Fix:** Render notes as a list (`white-space:pre-wrap`), height auto, add “Copy version”.
**Effort:** S · **Confidence:** medium

#### M31. “Needs Rosetta” install opens Terminal
**Where:** `renderer/pickers.js:417-421`
**What:** The primary button opens Terminal and runs a command; the toast says “Install Rosetta in Terminal, then click Reload all”.
**Why it matters:** Users may not expect a Terminal window; it’s a security-sensitive action.
**Fix:** Explain in a confirm first, or use the system software-update prompt; keep the log.
**Effort:** M · **Confidence:** medium

#### M32. Store cards don’t show installed/update state
**Where:** `renderer/store-ui.js:272-300`; `39-store-ulanzi.png`
**What:** Grid cards show only thumb/title/author; installed state appears only in the detail view.
**Why it matters:** Users may reinstall or miss updates.
**Fix:** Add an “Installed” pill on the card and an “Update” state when the store version is newer.
**Effort:** S/M · **Confidence:** medium

#### M33. No first-run onboarding for the disconnected state
**Where:** init; `01-main-1600.png`, `30-main-1600-demo.png`
**What:** The app opens with a populated demo, “DISCONNECTED”, “Deck offline”, “No Deck found” and “Ctrl/Cmd+S pushes” (disabled). Nothing explains “quit Ulanzi Studio” until you hover the disabled button or press ⌘S.
**Why it matters:** A new user’s first action (push) is disabled with no visible reason.
**Fix:** A one-line banner above the deck: “Connect your D200. If Ulanzi Studio is open, quit it.” with Reconnect; keep the demo keys as a tour.
**Effort:** S · **Confidence:** high

#### M34. “Clear page” enabled on an empty page; “New page” not primary
**Where:** `renderer/inspector.js:451-456`; `88-subpage-empty.png`
**What:** 0/13 keys but Clear page is active; the constructive New page is the third, neutral button.
**Why it matters:** Dead destructive control; wrong hierarchy.
**Fix:** Disable Clear page at 0 keys; make New page secondary/primary depending on emptiness.
**Effort:** S · **Confidence:** high

#### M35. The only editing help is hidden at ≤1179
**Where:** `renderer/inspector.js:540-548`; `76-page-settings-1080.png`
**What:** The Tips block teaches click/drag/⌘C/⌘V/Delete but is unreachable in the drawer layout (see H1).
**Why it matters:** The most useful help disappears exactly when space is tight.
**Fix:** Move the tips to a “?” popover in the toolbar or an empty-state in the stage.
**Effort:** S · **Confidence:** high

---

### LOW

#### L1. “Ctrl/Cmd+S” in a macOS-only app
**Where:** `renderer/index.html:207` — **What:** the stage hint reads “Ctrl/Cmd+S pushes”. **Why:** macOS convention is “⌘S”; the app is macOS-only. **Fix:** “⌘S pushes”. **Effort:** S · **Confidence:** high

#### L2. Store sort label “Most starred”
**Where:** `renderer/index.html` store sort — **What:** “Most starred” is awkward. **Why:** Unclear metric. **Fix:** “Top rated” or “Most popular”. **Effort:** S · **Confidence:** high

#### L3. Ellipsis inconsistency
**Where:** `renderer/pickers.js:272` (“Get icon packs...”) vs buttons using “…” — **What:** three periods vs the ellipsis character. **Why:** Visual inconsistency. **Fix:** use “…” everywhere. **Effort:** S · **Confidence:** high

#### L4. “Add Keyboard Key” / “Press a button”
**Where:** `renderer/index.html` hotkey modal — **What:** “Press a button or add one below.” **Why:** “button” is ambiguous (Deck key vs keyboard key). **Fix:** “Press a key combination, or pick keys below.” **Effort:** S · **Confidence:** high

#### L5. “Show in Finder” vs macOS “Reveal in Finder”
**Where:** `renderer/pickers.js` installed rows — **What:** “Show in Finder”. **Why:** macOS wording is usually “Reveal in Finder”. **Fix:** rename. **Effort:** S · **Confidence:** high

#### L6. “OPENACTION” badge casing
**Where:** `renderer/store-ui.js` SD list — **What:** all-caps “OPENACTION” vs “OpenAction” in the subtitle. **Why:** Inconsistent. **Fix:** “OpenAction”. **Effort:** S · **Confidence:** high

#### L7. Menu “Settings…” opens Deck settings
**Where:** `app/main.js:313-318` — **What:** ⌘, opens the Deck settings sheet, not app preferences. **Why:** Violates the macOS convention for ⌘,. **Fix:** rename “Deck Settings…” or split app preferences. **Effort:** S · **Confidence:** high

#### L8. “Key capture” diagnostic row in the Display tab
**Where:** `renderer/index.html` `#seize-row` — **What:** shows “Capturing keys” in the dev build. **Why:** developer-facing row in a user settings panel. **Fix:** hide behind a diagnostics disclosure or only show on failure. **Effort:** S · **Confidence:** high

#### L9. “Accessibility: Granted” still offers “Grant…”
**Where:** `renderer/index.html` App tab; `54-settings-app-demo.png` — **What:** status says Granted but the button is enabled. **Why:** Contradictory; users may click it again. **Fix:** disable/hide the button and style “Granted” green with a check. **Effort:** S · **Confidence:** high

#### L10. Settings rows have inconsistent alignment
**Where:** `renderer/styles.css` `.settings-row`; `54-settings-app-demo.png`, `55-settings-device-demo.png` — **What:** “Auto-push changes” wraps; the checkbox is far right; “Check every” is left-aligned while other controls are right-aligned; the About button sits right after the label. **Why:** The settings sheet looks ungridded. **Fix:** use a consistent two-column grid (label 130px, control 1fr) and keep booleans next to their labels. **Effort:** S · **Confidence:** high

#### L11. Page delete “×” has no undo
**Where:** `renderer/ui.js:604-624` — **What:** Delete page confirms, then deletes permanently. **Why:** No recovery from a misclick. **Fix:** keep a deleted-page snapshot for ⌘Z (as Clear key does). **Effort:** S · **Confidence:** high

#### L12. The page-list subpage glyph reads as “L”
**Where:** `renderer/ui.js:104` (`↳ ` prefix) — **What:** at 13px the arrow renders like an “L” before the name. **Why:** Looks like a typo. **Fix:** use a chevron/indent guide or an SVG. **Effort:** S · **Confidence:** medium

---

### NIT

- **N1.** The stage hint says “drag an image onto a key” but the Tips copy says “196×196 image”; any size works (`renderer/inspector.js:544`). Reword.
- **N2.** “1 pages” is the only plural bug; sweep other counts (`${n} actions`, `0 keys`).
- **N3.** The icon-library pack count “20” has no unit; use “20 icons”.
- **N4.** The store detail shows the raw plugin id in a badge; developer-facing.
- **N5.** The POP header says “POP”; use the key caption or “Quick actions”.
- **N6.** The Rosetta row’s INSTALLED badge wraps to its own line; other rows keep it inline.
- **N7.** The profile modal’s name field has no label (only a placeholder) while other fields have uppercase labels.
- **N8.** “ULANZI” all-caps section header vs “Ulanzi” elsewhere.
- **N9.** The “Key brightness” value row uses “Brighter/Dimmer” + “%” but no unit on the number.
- **N10.** The update modal’s “Later” button is ghost; “Open release page” is primary — correct, but “Later” could be “Remind me later”.

---

## 4. Screen-by-screen inventory

| Screen / modal | Controls | States tested | Issues found |
|---|---|---|---|
| **Main window 1600×900** | sidebar, page list, deck grid, toolbar, inspector | disconnected, connected (simulated), busy (simulated), 13 keys, wide key | H2, H3, H4, M3, M4, M6, M20 |
| **Main 1080×700** | drawer inspector, toolbar, deck | no selection, key selected, drawer closed | H1, H10, M17 |
| **Main 1180×800** | inline inspector, toolbar wrap | key selected | M16 |
| **Main 1080×600** | stage | no selection | M18 |
| **Key inspector** | action select, value, triggers, face tabs, icon, color, caption, font row | none/app/url/command/hotkey/text/media/sound/page/plugin/multi/toggle/indicator/timer/brightness/pop/close | H2, M1, M5, M9, M23 |
| **Plugin inspector (Ulanzi)** | plugin/action selects, PI iframe, icon | Analog Clock (no PI), missing plugin | H11, M15 |
| **Plugin inspector (Stream Deck)** | plugin/action, PI | Claude Code Usage | M15 |
| **Page settings** | clear/duplicate/new, name, parent, auto-exit, background, tips | root page, subpage, empty page | H1, H9, M19, M34, M35 |
| **Wide key inspector** | clock/stats/background tabs | clock, stats | M21 |
| **Deck settings — Display** | brightness, sleep, standby, lock, key capture | disconnected, dev seize | M3, L8, L10 |
| **Deck settings — Device** | auto-push, reconnect, status | disconnected | H3, M6, L10 |
| **Deck settings — App** | launch, accessibility, version, updates, about | granted, update error | H3, L7, L9, M11 |
| **Store — Ulanzi Plugins** | tabs, search, sort, grid, load more | loaded, no results | M10, M32 |
| **Store — Ulanzi Icons** | same | loaded | M32 |
| **Store — Stream Deck** | search, refresh, list, install | loaded, installed | M24, M25 |
| **Store detail** | back, install/download, description | plugin detail | M27 |
| **Installed — Plugins** | install folder/zip, reload, ⋯ menu, rows | 6 Ulanzi + 13 SD, scrolled, menu open, Rosetta | M24, M25, M31 |
| **Installed — Icons** | get packs, open folder | empty | M26 |
| **Import from Ulanzi Studio** | source, pages, mode, choose file, cancel/import | source found, 0 keys | M28 |
| **Profile modal** | name, save, linked app, background, export/import, delete | new, edit | M2, M22 |
| **Icon library** | search, pack list, grid | empty, one pack, no results | M26, M29 |
| **Hotkey modal** | display, categories, keys, cancel/save | cmd+shift+4 | M2, L4, M23 |
| **About** | links, close | open | (good) |
| **Update** | later, release page, notes | update available, check error | M11, M30 |
| **POP window** | 3×N grid, close | 5 actions, empty | M14, N5 |
| **Toasts** | — | success, error, behind modal | H6, M13 |
| **Menu / tray** | app menu, quit confirm | code review | L7 |

---

## 5. Interaction gaps

**Missing**
- No page reordering (M7).
- No step reordering in Multi/Toggle (M8).
- No multi-select of keys (shift-click does nothing; only one `state.selected`).
- No undo for page delete, profile delete, clear page (H9/L11).
- No keyboard navigation for POP (M14) or tabs (M12).
- No “Test action” button for hotkey/text/command/plugin, even though `#insp-hotkey-test` is referenced in code.
- No “installed/update available” state on store cards (M32).
- No plugin-crash indicator: `lib/plugins.js:198` clears a crash record but no UI reads it.
- No way to open Page settings at ≤1179 (H1).
- No “clear search” in store/icons (M10).
- No “open config folder” / “reset settings” (only plugins/log folders).

**Dead or misleading**
- “Deck offline” is a disabled primary CTA; its only explanation is a title tooltip (H4).
- “Export…” on the New-profile modal exports nothing (M22).
- “Grant…” is enabled when Accessibility is already granted (L9).
- “Press triggers” on a Page indicator that cannot be pressed (M9).
- “Clear page” on an empty page (M34).
- “Key brightness” changes the deck, not the key (M5).
- “Hotkey switch” is a toggle, not a hotkey (M5).
- “Favicon” appears twice in the URL inspector (value row and icon row) with identical labels and identical handlers (`renderer/inspector.js:657` and `:849`).
- “About Ulanzi Deck Open…” is left-aligned after its label while every other setting control is right-aligned (L10).

**Undiscoverable**
- Drag-to-move a key and drag-an-image-onto-a-key are only in the stage hint/tips.
- ⌘C/⌘V/Delete/⌘Z for keys are only in the Page-settings Tips (hidden at ≤1179, M35).
- The per-page delete “×” appears only on hover.
- The ⋯ menu in Installed is the only route to the plugins folder/log.
- The POP key gives no preview of its items in the editor (only a flat action list).

---

## 6. Layout notes (with measurements)

| Element | 1600×900 | 1180×800 | 1080×700 |
|---|---|---|---|
| Sidebar | 300px | 260px | 200px |
| Inspector | 440px (inline) | 400px (inline) | 440px drawer (overlay) |
| Stage | 860px | 520px | 880px |
| Deck shell | 760px | 520px | 760px |
| Key size | ~130px | ~80–88px | ~130px |
| Toolbar | one row | two rows (wraps) | one row |
| Deck settings sheet | 768–1208 (overlaps inspector 1160–1600 by 48px) | ~348–788 (8px gap) | 616–1056, behind drawer (z 40 < 70) |

**Breakpoints:** `@media (max-width:1359px)` shrinks sidebar/inspector; `@media (max-width:1179px)` turns the inspector into a drawer and drops the sidebar to 200px. The 1179→1180 jump is a cliff (M16). The sheet’s `right:392px` is hard-coded for the 400px inspector and is wrong above 1359 (H3).

**Modal sizing:** `.modal-card{height:min(720px, calc(100vh - 80px))}` (`styles.css:684`) applies to profile, hotkey, plugin and store; update overrides to 560; import and about are auto. Profile measured 480×720; hotkey ~640×720; update 760×560. Empty areas of 200–300px (M2).

**Overflow/clipping**
- Sidebar page list has no flex bound → footer off-screen at 14 pages (H5).
- Store grid’s last visible row is cut by the card edge; the installed list cuts rows at the card edge when scrolled (M25).
- At 1080×600 the stage hint is clipped (M18).
- Inspector content scrolls (correct) but the scrollbar is 12px and sits at the window edge; the sticky header is absent.
- The Deck settings sheet covers the inspector’s left 48px at 1600 (H3).
- The store detail card shrinks to 330px, leaving the tab bar floating above a small card (M27).

**Layout shift**
- Plugin PI appears after a few seconds and pushes the inspector down (M15).
- Deck settings tab switch changes the sheet height from 469px (Display) to 215px (Device) — the sheet jumps upward/downward (`25b` vs `55`).
- Selecting a key at 1080 slides a 440px drawer over the deck with no scrim (H10).
- Page list growth pushes the footer (H5).

---

## 7. Accessibility checklist

| Item | Result | Evidence |
|---|---|---|
| Every control keyboard reachable | **Partial** | Grid keys, page items and buttons are tabbable; the POP window is not (`ipc.js:905`); invisible delete is a stop (H7). |
| Visible focus indicator | **Partial** | `:focus-visible` ring exists (`styles.css:1102`), but the page-delete `×` is `opacity:0` when focused (measured); not visually verified for grid keys via harness. |
| Focus order logical | **Fail** | Sidebar → toolbar → 14 grid keys → inspector; each page adds 2 stops; no skip link. Store modal starts on the close X (H8). |
| Focus trapped in modals | **Pass** | Tab from last wraps to first (measured). |
| Focus returned on close | **Fail** | Escape leaves `document.activeElement === BODY` (measured). |
| Modal role/name | **Pass** | `role="dialog" aria-modal="true" aria-labelledby` on all modals. |
| Tabs implement ARIA pattern | **Fail** | `role=tab`/`aria-selected` but no arrow keys, no `aria-controls` (M12). |
| Icon-only buttons have names | **Partial** | `#import-btn` and `#profile-edit` have `aria-label`; `+`, `×`, `⋯`, `⟳` rely on `title`/content and are announced as the glyph (H7). |
| Canvas/grid has names | **Fail** | 14 buttons named “1”…“14” (H7). |
| Live status announced | **Fail** | `#status-pill`, `#push-state` are plain spans; only toast has `aria-live` (M13). |
| Color not sole state cue | **Pass** | Connected/busy/warning use text + color; selected key uses a ring plus the inspector heading. |
| Contrast (muted text) | **Pass** | muted 6.14:1, text-3 5.19–5.67:1, accent 5.64:1, good 10.3:1, bad 6.1:1. |
| Text size | **Fail** | 9–10px for status/hints (M3). |
| Reduced motion | **Pass** | Global `prefers-reduced-motion` override (`styles.css:1119`). |
| POP keyboard/Escape | **Fail** | `focusable:false`; Escape handler unreachable (M14). |
| Form labels | **Partial** | Most fields have `<label>`; the profile name field has only a placeholder; the font row (17/600/Left/color) has no labels. |
| Error announcements | **Fail** | Errors are toasts (`aria-live` polite) but hidden behind modals; no `role=alert`. |

---

## 8. Copy deck

| Current | Proposed | Where |
|---|---|---|
| “Key brightness” | “Deck brightness” | action select |
| “Hotkey switch” | “Toggle two actions” | action select |
| “VALUE” (text) | “Text to type” | inspector |
| “VALUE” (command) | “Command” | inspector |
| “VALUE” (sound) | “Sound file” | inspector |
| “VALUE” (close) | “Application” | inspector |
| “VALUE” (timer) | “Duration (seconds)” | inspector |
| “Ctrl/Cmd+S pushes” | “⌘S pushes” | stage hint |
| “No Deck found / Disconnected” | “No deck connected” (one string) | device card |
| “NOT CONNECTED” | “Not connected” | deck footer |
| “Deck offline” | “Connect deck” (secondary action) | toolbar |
| “Deck busy / Ulanzi Studio is using it” | “In use by Ulanzi Studio — quit it to connect” | device card + pill |
| “Could not check for updates: getaddrinfo ENOTFOUND …” | “Couldn’t reach GitHub. Check your connection and try again.” + Retry | App settings |
| “No plugins found.” + “0 of 0” | “No plugins match ‘zzzzz’.” + Clear search | store |
| “1 pages” | “1 page” | import |
| “Get icon packs...” | “Get icon packs…” | installed icons |
| “Add Keyboard Key” / “Press a button…” | “Add key combination” / “Press a combination, or pick keys below.” | hotkey modal |
| “Most starred” | “Top rated” | store sort |
| “Show in Finder” | “Reveal in Finder” | installed rows |
| “OPENACTION” | “OpenAction” | store badge |
| “Clear page” (dialog OK) | “Clear 13 keys” (danger) / “Cancel” | confirm |
| “Delete page ‘X’?” (native OK) | “Delete ‘X’ and its 13 keys?” / “Delete page” | confirm |
| “POP” (popup title) | key caption or “Quick actions” | POP header |
| “Drag a 196×196 image” | “Drag any image (it’s scaled to 196×196)” | page tips |
| “Accessibility: Granted” + “Grant…” | “Accessibility: Granted ✓” (button hidden) | App tab |
| “Key capture: Capturing keys” | hide in normal builds | Display tab |
| “Ulanzi marketplace · Plugins” | keep (good) | store |
| “The token refreshes automatically when it expires. Click the button to force a refresh.” | keep (plugin copy, good) | Claude PI |

---

## 9. Quick wins (≤30 min each)

1. **Toast z-index 100** + error icon (H6) — one CSS line, huge feedback win.
2. **`.page-list{flex:1 1 auto;min-height:0}`** + `.sidebar-foot{flex:none}` (H5).
3. **`right: calc(var(--inspector) + 8px)`** for the settings sheet (H3).
4. **`#insp-brightness-step{flex:0 0 64px}`** (M1).
5. **`padding-right:26px` on `.profile-select`** (M17).
6. **Remove the global 720px `.modal-card` height**; set `height:auto` on profile/hotkey/update (M2).
7. **Pluralize import counts** (M28).
8. **Rename “Key brightness”/“Hotkey switch”** (M5).
9. **Make the page-delete `×` visible on focus** and give it `aria-label` (H7).
10. **Give grid keys `aria-label`** (H7).
11. **Focus the primary field on modal open; restore on close** (H8).
12. **Hide Export/Import on New profile** (M22).
13. **Raise the empty-key “+” to 0.24 white** (M20).
14. **Map the update error to human copy** (M11).
15. **Add “Clear search” to the store empty state** (M10).

---

## 10. What is already good

- **The three-pane model is immediately legible.** Sidebar (profiles/pages) → stage (deck) → inspector is the right architecture, and the device mock sells the product.
- **The deck preview is faithful and useful.** The 5×3 + 2×1 geometry, wide-key clock/stats panel, pressed-state scale and page-indicator dots are all well done.
- **Action taxonomy is strong.** 17 action types grouped into Basic / Device & pages / Apps & links / System / Plugins is a sensible mental model, and the per-type value editors are mostly tailored rather than one JSON blob.
- **Live preview while editing.** Caption, color, font size/weight/align, icon and face tabs update the canvas immediately; this is the best part of the app.
- **Clear key is undoable** with a specific toast (“Key cleared — ⌘Z to undo”) — the right pattern, which Clear page should copy.
- **Plugin handling is unusually deep.** Ulanzi + Stream Deck/OpenAction, property-inspector iframes, “Needs Rosetta”, read-only/copy, per-plugin actions, live images — this is more than most hobby apps.
- **Store is real and pleasant.** 122 plugins, 63 icon packs, search/sort/load-more, a detail view, install state, and a Stream Deck catalogue in one place.
- **The dark theme has genuine depth.** Layered panels, blur, the top radial glow, consistent 1px borders and a restrained blue accent; it doesn’t look like a default Electron app.
- **Quit confirmation is thoughtful** (Cancel default, explains that plugins/hotkeys/clock stop).
- **Reduced-motion is handled globally**, and contrast passes WCAG AA for all muted text.
- **Error copy in the deck path is actionable** (“Deck not connected — quit Ulanzi Studio and reconnect”) — the rest of the app should match it.
- **Icon pack/library flow is complete** (download → pack list → search → apply → downscale), and the empty state teaches the next step.

---

## 11. Appendix

### Method
- Ran the dev build with `ULANZI_NO_DECK=1`, a copied config and the built-in screenshot harness (`ULANZI_SHOT`, `ULANZI_EVAL`). Drove state via the renderer globals (`state.selected`, `renderInspector`, `renderAll`, `toast`, `showUpdateModal`) and via real clicks on the DOM.
- Captured at 1600×900, 1180×800, 1080×700 and 1080×600.
- Measured layout and accessibility in-page: `getBoundingClientRect`, `getComputedStyle`, `document.activeElement`, `innerText`, contrast computed from the CSS tokens.
- POP was captured with `screencapture -l <window id>` while the dev instance's POP window was open (the harness's `capturePage` only covers the main window).
- No source file was modified. The real config and installed app were never written to. Only dev Electron processes started by this audit were killed (`pkill -9 -f "Electron.app/Contents/MacOS/Electron"`).

### Config caveat
The shared `/tmp/uiux-config` was being rewritten by another process during the audit (it produced a different profile at different times), so I froze two snapshots from the stable `/tmp/sdapp` and ran against those:
- `/tmp/uiux-config-f` — the repo demo (`Demo` profile, Main + Subpage, 19 plugins) — used for screenshots 30–88.
- `/tmp/uiux-config-b` — same + one downloaded icon pack (`fade-pack-icon-1029`) — used for 60/61.
The early screenshots (01–29) use a pre-existing 13-key `Default` profile that was in `/tmp/uiux-config` at audit start; they are still valid UI states of the same build. I did not use the installed app's config.

### Screenshots (all in `/tmp/uiux-audit/`)
- **Main/layout:** `01-main-1600.png`, `02-key-app.png`, `03-main-1080.png`, `04-key-1080.png`, `30-main-1600-demo.png`, `31-key-plugin.png`, `32-main-1080-demo.png`, `65-breakpoint-1180.png`, `76-page-settings-1080.png`, `77-selected-then-esc-1080.png`, `86-key-1180.png`, `87-1080x600.png`
- **Actions:** `05-none`, `06-url`, `07-command`, `08-hotkey`, `09-text`, `10-media`, `11-sound`, `12-page`, `13-plugin-ulanzi` (missing plugin), `14-multi` (empty steps), `15-toggle`, `16-indicator`, `17-timer`, `18-brightness`, `19-pop`, `20-close`, `33-key-plugin-clock`, `33b-clock-pi`, `34-key-plugin-sd`, `35-key-pop`, `36-key-sound`, `81-multi`, `82-toggle`, `84-missing-plugin`
- **Page settings/wide:** `21-wide`, `22-page-subpage`, `23-empty-page`, `88-subpage-empty`
- **Deck settings:** `25b-settings`, `26-settings-device`, `27-settings-app`, `28-settings-1080`, `54-settings-app-demo`, `55-settings-device-demo`, `56-settings-1080-demo`
- **Store/installed:** `37-installed`, `38-installed-icons`, `39-store-ulanzi`, `40-store-icons`, `41-store-sd`, `42-store-detail`, `43-installed-scroll`, `44-installed-menu`, `45b-import`, `59-store-icon-detail`, `73-store-no-results`, `78-rosetta`, `78b-unsupported`
- **Profile/import/icons:** `46-profile-new`, `47-profile-edit`, `48-icon-library`, `60-icon-library-pack`, `61-icon-search-empty`, `85b-profile-edit`
- **Modals/POP:** `50-hotkey-modal`, `51-about`, `53-update`, `58-pop`
- **States/toasts:** `63-toast-behind-modal`, `70-toast-push`, `71-toast-empty-pop`, `72-many-pages`, `74-update-error`, `79-deck-busy`, `80-deck-connected`
- **Details:** `crop-claude.png`, `crop-clock.png`

### Not tested / limitations
- **Offline store:** network was available; I did not force an offline state. Code (`store-ui.js:256`) prints `res.error` raw, so M11 applies but the exact offline screen is unverified.
- **No plugins installed:** the demo has 19 plugins and the app also scans the real Ulanzi folder; I could not produce a truly empty Installed list without touching the user's folders. The empty-state copy exists at `pickers.js:352` and is good.
- **Plugin crash:** no UI path to simulate a host exit; code has no crash surface (only `lib/plugins.js:198`).
- **Real deck / push:** `ULANZI_NO_DECK=1`; connected state was simulated for layout only. Push success/failure to hardware, brightness, sleep and standby were not exercised.
- **Native file dialogs** (image picker, export, install folder/zip) cannot be captured by the harness; their entry points were reviewed but the dialogs themselves were not.
- **Menu-bar/tray** interactions and quit confirmation were code-reviewed, not driven (quitting would require killing the app).
- **Light mode:** the app has no `color-scheme` declaration; I attempted a simulated light color scheme but native controls did not visibly change in this build, so I did not claim a finding.
- **Multi-display:** POP positioning is clamped to the cursor's work area (code); the main window's multi-display placement was not tested.
