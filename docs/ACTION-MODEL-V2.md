# Action model v2

Scope agreed for the next block: bring the action vocabulary up to what Ulanzi Studio
ships, minus the Soundboard (deferred to v3). Order of work overall:

`action model v2 → profiles → editor UX → import`

## What v2 covers

| Official feature | Ours in v2 |
| --- | --- |
| System: Open / Close / Website / Text / Hotkey / Multimedia / Hotkey Switch | new `close`, `text`, `media`, `toggle` + existing `app`/`url`/`hotkey` |
| Multi Action: routine, routine2 (switch), random, delay | `multi` with `sequence` / `alternate` / `random` steps + `delay` |
| Action Trigger: action combination, trigger action | per-key `holdAction` / `doubleAction` (tap stays `action`) |
| Pages: prev/next/goto | already there |
| Pages: indicator, parent/subpage, switch profile | **after profiles** (block B) |
| OBS Studio | **v3** |
| Ulanzi Connect (lightmaster) | later — Bluetooth LE (below); the D200 is USB only |
| Ulanzi TC002 | later — Bluetooth LE (below) |
| Soundboard | **v3** |

## Data model (config v5)

Keys keep their current shape and gain two optional triggers. Everything is additive,
so v4 configs migrate with no work.

```json
"0": {
  "emoji": "🎬", "label": "Record", "color": "#1b2130", "icon": null,
  "action":       { "type": "obs", "op": "record.toggle" },
  "holdAction":   { "type": "media", "op": "next" },
  "doubleAction": { "type": "multi", "mode": "sequence", "steps": [
      { "action": { "type": "text", "value": "hello" } },
      { "delay": 250 },
      { "action": { "type": "hotkey", "value": "cmd+shift+4" } }
  ]},
  "holdMs": 500
}
```

### Action types

| `type` | Fields | Notes |
| --- | --- | --- |
| `none` | – | |
| `app` | `value` (app path/name) | existing |
| `url` | `value` | existing |
| `hotkey` | `value` (`cmd+shift+3`) | existing |
| `command` | `value` (shell) | existing |
| `text` | `value` | types into the frontmost app (System Events) |
| `media` | `op`: `playpause`/`next`/`prev`/`volumeup`/`volumedown`/`mute` | via a small `mediakey` helper (CGEvent NX keys) |
| `close` | `value` (app name/bundle) | `tell application "X" to quit` |
| `page` | `op`: `next`/`prev`/`goto`, `value` (page id) | existing, gains `op` |
| `plugin` | `uuid`, `action`, `actionid`, `settings` | existing |
| `multi` | `mode`: `sequence`/`alternate`/`random`, `steps[]` | replaces the official multi-action family |
| `toggle` | `value` (two actions via `steps`) | official “Hotkey Switch”: alternates state each press |
| `obs` | `op`, `params` | see OBS below |

`steps[]` entries are either `{ "action": <Action> }` or `{ "delay": <ms> }`.

### Press triggers

The deck already reports down/up, so the renderer owns a per-key state machine:

* `tap` → `action` (fires on key up before `holdMs`; executes on down for actions that
  should feel instant, see below)
* `hold` → `holdAction` fires once when held past `holdMs` (default 500 ms), `action`
  is suppressed on release
* `double` → `doubleAction` fires when a second tap lands within 300 ms; the first tap’s
  `action` is deferred by 300 ms in that case

Compatibility rule: keys with no `holdAction`/`doubleAction` behave exactly as today
(fire on down, no delay).

### Execution engine

`app/lib/actions.js` becomes a small scheduler:

* one serial queue per key (a running multi-action is cancelled by a new press,
  matching the official app)
* `multi` sequence: run steps in order, `delay` steps await, abort on page change
* `alternate`: remembers the last index per key (`key.actionState`) and advances
* `random`: picks a step, never the same twice in a row
* failures surface as a toast and stop the sequence

## Bundled action icons

Actions come with a small set of bundled SVG icons (`app/renderer/assets/actions/`,
white line art, MIT) that are drawn on the key when it has no custom image, matching
the official app's look instead of relying on platform emoji:

`page-next`, `page-prev`, `page-goto`, `media-playpause`, `media-next`, `media-prev`,
`media-volumeup`, `media-volumedown`, `media-mute`, `text`, `hotkey`, `app`, `url`,
`command`, `close`, `plugin`, `multi`, `toggle`.

The auto-emoji is still filled in as a fallback; typing a custom emoji switches the
key back to emoji, and any custom image always wins.

## UI

* **Action picker** gains: Text, Media, Close app, Multi action, OBS.
* **Inspector**
  * `text`: input + “type into frontmost app” hint
  * `media`: six-button grid
  * `close`: app picker (reuse the existing one)
  * `multi`: step list (add action / add delay, reorder, remove), mode selector
  * `obs`: operation picker + parameters (scene name, source, etc.)
  * per-key **triggers** section: “On hold” and “On double press”, each opening the
    same action editor
* **OBS settings** panel: host, port, password, connect/disconnect, live status dot.
  Actions stay usable when disconnected but show a warning toast.

## Deferred: OBS Studio (v3)

obs-websocket v5 on `ws://127.0.0.1:4455` (configurable), `Hello`/`Identify`
handshake with SHA-256 challenge when a password is set.

Operations: `record.start/stop/toggle`, `stream.start/stop/toggle`,
`virtualcam.toggle`, `replay.save`, `scene.set` (name), `scene.next`,
`transition.trigger`, `source.mute` (source name), `filter.toggle`.

Connection lives in `app/lib/obs.js`, shared by all OBS keys; state (recording /
streaming) is pushed to the renderer so keys can show a live indicator later.

Note: the store also has a community “OBSWeb” plugin; the native module is what gives
us the official action set (scenes, transitions, replay buffer) without depending on
a third-party plugin.

## Deferred: Ulanzi Connect and TC002 (Bluetooth LE)

Both are **Bluetooth** devices in the official app: it links `QtBluetooth`,
`libUlanziFZBle.dylib` and ships `tc002client`, `tc002discoveryworker`,
`lightmasterplugin`. There is no HTTP/local API to call.

Plan: a `blehelper` (CoreBluetooth, JSON-lines over stdio) modelled on the existing
`hidseize` helper, exposing scan/connect/write/notify; then `lib/connect.js` and
`lib/tc002.js` providers on top. This is a research spike with unknown protocol
details (characteristics, framing), estimated **5–8 days with real risk**.

Decision: these are Bluetooth products and the D200 is USB-only, so they are not
part of v2 or v3. When they come, they need a `blehelper` (CoreBluetooth, JSON lines
over stdio) next to `hidseize`/`mediakey`, then protocol work per device.

## Phases

| Phase | Contents | Est. |
| --- | --- | --- |
| **v2.1** | schema v5, executor, triggers (tap/hold/double), text / media / close / toggle | 3 d |
| **v2.2** | multi-action editor (steps, delay, alternate, random) | 2 d |
| **v2.3** | polish: key-state indicators, error toasts, docs, migration tests | 1 d |
| **v3** | OBS Studio module, Soundboard | 4 d |

## Status

* **Done (v2.1a)** — `text`, `media`, `close` action types (executor + inspector),
  plus the bundled `mediakey` helper for macOS media keys. Verified end-to-end on the
  deck app (`mediakey` toggles mute from inside the app, not just from a shell).
  Choosing a media key pre-fills the key emoji (⏯️ ⏭️ ⏮️ 🔊 🔉 🔇) and keeps it in
  sync with the selected operation unless the emoji was customised.
* **Done (v2.1b)** — press triggers: `holdAction`, `doubleAction`, `holdMs`. The
  renderer owns a per-key state machine (500 ms hold, 300 ms double window, 60 ms
  bounce guard). Verified on the deck: tap → page A, hold → page B, double → page C,
  each firing exactly once.
* **Then (v2.2)** — `multi` (sequence / alternate / random with delay steps) and
  `toggle`, with the step editor.
* **Then (v2.3)** — polish: action state indicators, docs, migration tests.
* **v3** — OBS Studio and Soundboard. **Later** — BLE (Connect / TC002).

## Testing

* Unit: action executor (sequence, delay, alternate, random, cancellation).
* Manual: each action type on the deck; hold/double timing feel; OBS record/stream
  against a local OBS; import of a v4 config.
* Regression: existing keys (app/url/hotkey/plugin) behave identically.

## Open questions

1. Triggers: keep them on the key (`holdAction`/`doubleAction`) or introduce an
   explicit “Action Trigger” action like the official app?
