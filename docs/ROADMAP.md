# Roadmap

> **Status (2026-11-02):** the original build-out is shipped. The remaining work is
> driven by the two audits in [`reviews/`](reviews/) and the unimplemented
> platform features listed at the end of this file. See
> [`../CHANGELOG.md`](../CHANGELOG.md) for the shipped list.

## Current plan (from the 2026-11-01 audits)

Sources: [`reviews/2026-11-01-architecture-audit.md`](reviews/2026-11-01-architecture-audit.md),
[`reviews/2026-11-01-uiux-audit.md`](reviews/2026-11-01-uiux-audit.md) and
[`reviews/2026-11-02-architecture-audit-2.md`](reviews/2026-11-02-architecture-audit-2.md).
The 0.9.0 UI batch is shipped; [`PLAN-0.10.0.md`](PLAN-0.10.0.md) re-triages
both audits and lists what remains.

### Shipped in 0.9.0 — the five structural UI issues

1. **H1 — Page settings at ≤1179 px.** Add a persistent Page-settings entry and let
   the drawer open with no key selected; add a scrim.
2. **H2 — Caption over plugin live images.** Do not draw the app caption when the
   key face comes from a plugin; make “Show caption” opt-in.
3. **H4 — Dirty/unsynced state.** Track edits when auto-push is off, show
   “Unsynced changes” and a dot on Push; clear it after a successful push.
4. **H10 — 1080 drawer.** Keep Push reachable while editing (sticky toolbar or
   smaller drawer with a Push action in its header).
5. **H11 — Missing-plugin keys.** Warn in the inspector and on the key, with
   Open Store / Clear action.

### Shipped in 0.10.0 — editing depth and safe destructive actions

Plan: [`PLAN-0.10.0.md`](PLAN-0.10.0.md). Triage of the two audits is in that
file; H9 is the last open High.

1. **H9 — safe destructive actions.** Replace native confirms with an in-app
   modal (Cancel focused), name the concrete action, add Clear-page undo and
   make New page primary.
2. **M7 — page reorder.** Drag rows or `Alt+↑/↓`; persist and keep Next/Previous
   in step.
3. **M14 — POP keyboard access.** Focus the palette, arrow/Enter/Escape, close
   on blur, restore the previous app, show action icons and rename it “Quick
   actions”.
4. **M8 — complete Multi/Toggle steps.** Plugin, sound, timer, brightness and
   close steps, plus drag and ↑/↓ reordering.

### Shipped in 0.10.1 — settings, Push and subpages

- **Deck settings is centered** over the editor, closes the narrow drawer and
  closes when a key is selected.
- **Push is disabled while auto-push keeps the deck in sync**, with a tooltip
  explaining how to push manually (⌘S). It stays available for retries and
  when auto-push is off.
- **Subpages are discoverable:** Page settings lists children, and **New
  subpage** creates the child plus an open key on the parent and a Back key.
- **Back to parent page** is offered only on subpages; page targets mark them
  with ↳.

### Shipped in 0.10.2 — Push tooltip fix

- **The auto-push tooltip now appears.** Push uses `aria-disabled` instead of
  the native `disabled` attribute, so it stays hoverable and focusable; clicking
  it explains why nothing was pushed. It is still visually disabled.

### Shipped in 0.10.3 — instant Push tooltip

- The Push tooltip appears **instantly** on hover or keyboard focus, is styled
  like the app, and replaces the delayed native title.

### Next: architecture batch

- M3 per-generation child/socket ownership; M18 bounded extraction off main.
- M24 fake-Electron IPC harness; L3/L4 round trips; L6 release-cache expiry.
- Renderer `no-undef` with explicit cross-file contracts.

### Then: visual and store polish

- Store detail and remaining card state (M27).
- 1179 breakpoint (M16); type-scale consolidation (M3); icon-language cleanup
  (M4).
- Remaining copy/nits from §8 of the UI report.

### Later: 1.0

- **3.3** Renderer modules + explicit store (optional, highest risk).
- **L5/L8** Send config images as `file:` refs and resolve them lazily, after a
  representative large-profile measurement.
- **L13 / L14** are done (helpers built from source; bundle trimmed).

### Unimplemented platform features

Firmware update, Python plugins, multi-device support (D200X / Dial / AU05) and
OBS Studio actions. These were on the original roadmap and are unchanged.

---

Original planning notes for what comes after the store work. Ordered by value: import
first (it makes the app usable for existing Ulanzi Studio users), then the
actions/behaviour that the official app has and we don't, then editor polish.

Status of the items the user raised:

1. **Window brand icon** — done: the sidebar now renders `renderer/assets/brand.png`,
   generated from the shipped Night U app icon, so the window, Dock and About panel
   match.
2. **Feature parity** — scoped below into four blocks.
3. **Import from Ulanzi Studio** — designed below.

---

## 1. Import pages and profiles from Ulanzi Studio

### What the official app stores (verified on this machine)

```
~/Library/Application Support/Ulanzi/UlanziDeck/
  ProfilesV2/<device-uuid>.ulanziProfile/
    manifest.json                 Device{Model,UUID}, Name, Icon, Pages{Current,Pages[]}
    Profiles/<page-uuid>/
      manifest.json               Controllers[Keypad].Actions{ "<col>_<row>": {...} }
      Images/  Files/
```

A key entry:

```json
"3_2": {
  "Action": "com.ulanzi.ulanzideck.page.next",
  "ActionID": "49c0596d-…",
  "ActionParam": {},
  "LinkedTitle": true,
  "Name": "Next page",
  "Plugin": { "Name": "Pages", "UUID": "com.ulanzi.deck.page", "Version": "1.0" },
  "ViewParam": [{ "Icon": "/…/btn_nextPage.png", "IconRel": "" }]
}
```

The slot grid is the same as ours: 5 columns × 3 rows, the wide key is `3_2`
(index 13), so `index = row * 5 + column` maps 1:1 and needs no geometry code.

### Mapping

| Ulanzi | Ours |
| --- | --- |
| profile | set of pages (profiles support comes later, see 2B) |
| page (`Profiles/<uuid>`, plus its `Name`) | page `{ id, name, keys }` |
| key `"x_y"` | page key `index = y*5 + x` |
| `3_2` | skipped on import; the panel is edited in our inspector (clock / stats / background) |
| `Name` / `LinkedTitle` | label + caption |
| `ViewParam[0].Icon` (absolute path) or `IconRel` | key image, copied into the app and stored as a data URL |
| `com.ulanzi.deck.system` → Open / Website / Hotkey | `app` / `url` / `hotkey` |
| `com.ulanzi.deck.page` → prev / next / goto | `page` action |
| any other `Plugin.UUID` + `Action` + `ActionID` | our `plugin` action (uuid, action, actionid, settings from `ActionParam`) |
| unknown/system actions we don't implement yet | **kept as an "unmapped" key** that shows the original name and keeps the raw JSON, so an import never loses data and can be re-run later |

### Work

1. `app/lib/import-ulanzi.js`
   * discover `ProfilesV2/*.ulanziProfile` (only `Device.Model === "D200"` at first)
   * parse the manifest + every page, return `{ profiles: [{ name, pages: [...] }] }`
   * map actions with the table above, resolve image paths, flag unsupported actions
   * copy referenced images out of Ulanzi's folder only when they live inside the
     profile (absolute `System/Plugins/...` paths are read and inlined)
2. IPC: `import:scan` (list profiles/pages with previews), `import:apply`
   (`{ profileIndex, pageIds, mode: "merge" | "replace" }`).
3. UI: **Import from Ulanzi Studio…** in the Pages section of the sidebar, opening a
   modal: profile picker → page list with checkboxes and thumbnails → Import. Warn
   about unmapped actions and unsupported plugins (HTML).
4. Tests: import the real profile on this machine, compare rendered keys with the
   official app, verify page switching still works.

Edge cases to handle: D100/Dial geometries, missing icon files, HTML plugins,
multi-action / key-logic actions (until 2A lands they import as unmapped), duplicate
page names, very large image sets.

**Estimate: 2–3 days.**

---

## 2. Feature parity

What the official app has that we don't (from its `System/Plugins` manifests):

| Area | Official | Ours | Priority |
| --- | --- | --- | --- |
| Profiles | multiple profiles per device, switch profile action, app-linked | done | – |
| Multi Action | multi action, switch, random, delay | done | – |
| Key behaviour | Action Trigger: short / long / double press, combinations | done | – |
| System actions | Open, Close, Website, Text, Hotkey, Multimedia, Hotkey Switch | done (+ timer, key brightness) | – |
| Soundboard | play / stop audio | done | – |
| Pages | prev/next/goto, page indicator, parent/subpage, wallpapers | done | – |
| Icon library | browsable icon packs, delete pack | done | – |
| Plugin properties | per-action property inspector | done | – |
| Label/font settings | font name, size, alignment, weight | fixed rendering | P2 |
| Screensaver / sleep screen | image/clock screensaver | done (clock + wallpaper) | – |
| Marketplace | install / update / uninstall | install only | P2 |
| OBS / Lightmaster / TC002 | vendor plugins | already works through the plugin host | – |
| Firmware update | bundled updater | – | P3 (risky) |
| Multi-device | D100, D200X, Dial, AU05 | D200 only | P3 |
| Account / cloud sync | login, cloud profiles | – | P3 |

### Blocks

**A. Action model v2 (P1) — ~4–5 days**
* `multi` action (folder): list of child actions with optional delay.
* Key press types: our HID layer already delivers down/up, so add
  `{ on: "tap" | "hold" | "double" }` and a small state machine per key.
* System actions: `media` (play/pause, next/prev, volume), `text` (type a string),
  `close` (quit an app), `sound` (play a file).
* Editor: action picker gains these types; inspector shows their fields.

**B. Profiles (P1) — ~3 days**
* Config v5: `profiles: [{ id, name, pages[] }]`, active profile.
* Sidebar: profile switcher; page actions gain "switch profile".
* Makes imports 1:1 with the official model.

**C. Editor UX (P2) — ~4 days**
* Icon library modal backed by the store's `Icons` category (download a pack into
  the app, browse, apply to a key).
* Action property inspector (plugin settings JSON, like Ulanzi's).
* Font/label controls (name, size, weight, alignment) to match the deck rendering.
* Undo/redo, copy/paste keys, multi-select.

**D. Device polish (P2/P3) — ~3 days**
* Screensaver/sleep screen (image or clock) instead of a blank panel.
* Marketplace updates (compare installed version with the store) and uninstall.
* Multiple devices later.

---

## Gap-table progress (official app parity)

Done since the report: import (v1), **Multi Action** (sequence / alternate / random with
delay steps, editor in the inspector), **Hotkey Switch** (`toggle`, two alternating
actions), **text with Enter**.

Also done: **folders/subpages** (page `parentId`, “Back to parent page”, import maps
folder keys to parent links), **Page Indicator** (dots + n/total, mapped from imports),
and **profiles** (config v6: `profiles[]`, sidebar switcher, `Switch profile` page action,
import creates a profile per vendor profile).

Also done: **HTML plugins** (hidden BrowserWindow + same SDK bridge), **Page Indicator**
(big page number + dots), grouped action picker.

Also done: **multi-state keys** (per-state icon/label, plugin `setState` updates the
tile, import keeps every `ViewParam`), **soundboard** (play/stop audio via `afplay`,
volume, imported from vendor profiles), **store updates** (Update button when the
installed version differs).

Also done: plugin `openview` (plugin-local HTML in its own window), `setFeedback*` safely
ignored (no dials on the D200), shifted hotkeys now use virtual key codes, Accessibility
status + Grant action in Deck settings.

Also done: **standby clock/wallpaper**, **app-linked profiles**, **pinned keys**,
**timer / key-brightness actions**, **page & profile backgrounds with snapshot** and the
**plugin `selectdialog`** handler.

Next by value: firmware update (risky), Python plugins, multi-device support, OBS
actions.

## Order of work (agreed)

1. **Action model v2** — system actions, multi-action and press triggers.
   OBS Studio and Soundboard move to v3; Ulanzi Connect / TC002 are Bluetooth
   (BLE) products and go to a later milestone — the D200 itself is USB only.
   Detailed spec: [`ACTION-MODEL-V2.md`](ACTION-MODEL-V2.md).
2. **Profiles** — multiple profiles per device, switch-profile action.
3. **Editor UX** — icon library, action property inspector, fonts, undo.
4. **Import from Ulanzi Studio** — **landed (v1)**: live profiles, exported
   `.ulanziDeckProfile`/ZIP, action/hotkey/plugin-settings mapping, icons copied into
   our image store, wide key skipped, unsupported actions kept as placeholders.

### v3 and later

* **v3** — OBS Studio (obs-websocket) and Soundboard (play/stop audio).
* **Later** — Ulanzi Connect lights and TC002 display (Bluetooth LE; needs a
  CoreBluetooth helper and protocol reverse-engineering).

## Resolved decisions

* Profiles are first-class (config v6) and imports create one profile per vendor
  profile.
* System actions use AppleScript/System Events plus the native `mediakey` helper;
  Accessibility is required for hotkeys/text.
* Imported keys copy the official images into our content-addressed image store.
* Unmapped import actions are kept as visible placeholder keys.
