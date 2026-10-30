# Roadmap

Planning notes for what comes after the store work. Ordered by value: import first
(it makes the app usable for existing Ulanzi Studio users), then the actions/behaviour
that the official app has and we don't, then editor polish.

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
| `3_2` | skipped (firmware panel, read-only) |
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
| Profiles | multiple profiles per device, switch profile action | single config | P1 |
| Multi Action | multi action, switch, random, delay | – | P1 |
| Key behaviour | Action Trigger: short / long / double press, combinations | press only | P1 |
| System actions | Open, Close, Website, Text, Hotkey, Multimedia, Hotkey Switch | open/url/hotkey/command | P1 |
| Soundboard | play / stop audio | – | P2 |
| Pages | prev/next/goto, page indicator, parent/subpage | prev/next/goto | P2 |
| Icon library | browsable icon packs, delete pack | store icon packs only | P2 |
| Plugin properties | per-action property inspector | only plugin-provided UI | P2 |
| Label/font settings | font name, size, alignment, weight | fixed rendering | P2 |
| Screensaver / sleep screen | image/clock screensaver | sleep timeout only | P3 |
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

Next by value: multi-state keys, soundboard, plugin `openview`/`feedback`, screensaver,
marketplace updates, app-linked profiles.

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
   See [`reviews/2026-10-30-official-gap.md`](reviews/2026-10-30-official-gap.md) §5 for
   the remaining edge cases (profiles as first-class objects, V1 profiles, folders).

### v3 and later

* **v3** — OBS Studio (obs-websocket) and Soundboard (play/stop audio).
* **Later** — Ulanzi Connect lights and TC002 display (Bluetooth LE; needs a
  CoreBluetooth helper and protocol reverse-engineering).

## Open questions

* Do you want profiles as a first-class concept, or keep one flat set of pages and
  import each official profile as a group of pages for now?
* For system actions, is AppleScript/System Events acceptable (needs Accessibility),
  or should we add a native helper for media keys?
* Imported keys: keep the official images (copy the files) or keep only the official
  labels and rebuild the icons with our renderer?
* Unmapped actions on import: keep a placeholder key (safe, visible) or drop them
  with a report?
