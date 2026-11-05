# ulanzi-deck-open

An open-source desktop app for the **Ulanzi D200** (14 buttons: 13 square 196×196 keys
plus one 2×1 wide key, USB `0x2207:0x0019`). It replaces Ulanzi Studio for editing pages
and triggering actions, and it talks to the deck directly over HID — no vendor app
required.

![Main window](docs/screenshots/main.png)

_The editor, the plugin manager and the store all run against the deck live._

## Features

* **Live editor** — mirrors the device: 13 square keys + one 2×1 wide key
  (slot `3_2`, index 13).
* **Profiles & pages** — multiple profiles, each with its own pages; profiles can be
  linked to an app so the deck follows the frontmost window. Page/profile wallpapers and
  “snapshot page” backgrounds are sliced across the keys.
* **Keys** — emoji or text, captions, background colour, a custom image (click or
  drag & drop), or a native **tile** face with an accent bar, glyph, title and
  subtitle; with the glyph left empty, the key's image takes its place. Tile text
  lives in `config.json`, so script-generated profiles stay small and editable.
  Per-key caption size/weight/alignment/colour is supported (official fonts are
  imported); choose the face with the **Icon / Text / Tile** tabs.
* **Wide key** — choose **Clock** (analog dial + digital time), **System stats** (live
  CPU / RAM / GPU) or **Background** (page image). Pressing the physical wide key cycles
  the three panels and the dashboard follows.
* **Actions** — open an app (searchable in-app picker with real app icons), open a URL
  or a custom app link (`slack://`, `zoommtg://`, `linear://`), run a shell command
  (optionally showing its text or image output on the key on a timer), send a hotkey,
  type text, media keys, close an app, switch page/profile, timer/key brightness, or run
  an existing Ulanzi plugin action.
* **Multi actions** — sequence / alternate / random steps with delays, plus a two-way
  Hotkey Switch.
* **Press triggers** — separate actions for tap, hold and double press.
* **Pinned keys** — pin an action to every page, with per-page overrides.
* **Backup & share** — export a profile to one `.ulanzideckprofile` file and import it
  back as a new profile, or replace the existing profile with the same name. Replace keeps
  the imported page IDs when they do not collide, so script-generated profiles can be
  regenerated and reimported.
* **Launch at login** — start in the menu bar; subpages can auto-return to their parent
  after an idle timeout.
* **POP menus** — import and use POP keys: press one to get a compact action palette at
  the pointer (up to 9 actions).
* **Device control** — brightness (0–100 %), screen sleep timeout, clock sync, standby
  clock/wallpaper, optional lock-screen image/clock, and message/caption styling.
* **Plugins** — runs **Ulanzi** plugins and **Stream Deck SDK / OpenAction** plugins:
  Node, HTML and native macOS binaries, with live images/titles, states, per-action and
  global settings, property inspectors, and real key-down/key-up events. It scans
  Ulanzi Studio, Elgato Stream Deck and OpenDeck plugin folders; `.sdPlugin` folders and
  `.streamdeckplugin`/`.zip` packages can be installed into the app. Windows-only
  plugins run through Wine when Wine is installed. **Store → OpenAction Plugins**
  browses the OpenAction catalogue with one-click install/update. See
  [`docs/PLUGINS.md`](docs/PLUGINS.md).
* **Plugin Store** — browse the official Ulanzi Studio marketplace from the sidebar:
  categories (profiles, plugins, icons), search, sorting, plugin details, and one-click
  install into this app.
* **Icon library** — download icon packs from the Store, manage them in
  **Installed → Icons**, and apply any icon to a key.
* **Import from Ulanzi Studio** — bring pages and keys over from a live Ulanzi profile or
  an exported `.ulanziDeckProfile`/ZIP: actions, hotkeys, plugin settings and icons are
  converted; unsupported actions are kept as placeholders instead of being dropped.
* **Hotkeys** — a proper picker (modifiers, letters, symbols, function keys, F keys,
  numpad) plus physical key capture.
* **Drag to rearrange** — drag a key onto another to swap them.
* **Keyboard shortcuts** — ⌘C/⌘V copy & paste keys, Delete/Backspace clears, ⌘Z undoes.
* **Lives in the menu bar** — closing the window hides it and removes its Dock icon;
  the icon returns while the editor is open. Cmd+Q asks for confirmation before quitting.
* **Packaged macOS app** — build an unsigned `.app` or `.dmg` locally with the commands
  below. No Apple Developer account is needed.

The window, the editor and the device all update from the same config, so what you see is
what the deck shows (labels are rendered into the images).

## Requirements

* **macOS 13 or newer.** Apple Silicon is the default build; Intel Macs can build the
  universal app.
* **Node.js 22.13 or newer** (`node -v`).
* **Xcode Command Line Tools** — `xcode-select --install`. Needed for `clang`/`lipo`
  when the native helpers are rebuilt, and for `hdiutil` when making a DMG.
* The D200 connected over USB. **Quit Ulanzi Studio first** — the deck's control
  interface is exclusive.

## Build from source (unsigned)

No signing, notarization or Apple account is involved. You are building the app on your
own Mac, so macOS does not apply the “downloaded from the internet” quarantine to the
result.

```bash
git clone https://github.com/edufalcao/ulanzi-deck-open.git
cd ulanzi-deck-open/app
npm install
npm start
```

If you prefer a ZIP, use **Code → Download ZIP** on GitHub, unzip it, then run the same
`npm install` / `npm start` inside the `app` folder.

**npm 12 and newer block dependency install scripts by default.** This project does not
need them: Electron downloads its runtime on first use. If that download is skipped or
fails, run its installer once and start again:

```bash
node node_modules/electron/install.js
npm start
```

For daily use, prefer `npm run install-app` over `npm start` (see below). Launching through
`electron .` identifies the app as **Electron.app** in macOS prompts such as the login-item
and Accessibility dialogs; the installed bundle uses the real **Ulanzi Deck Open** name.

**No Apple Developer account, certificate, signing or notarization is required.**

`npm start` runs the app from source. To build a standalone `.app`:

```bash
npm run package        # Apple Silicon (arm64): dist/Ulanzi Deck Open-darwin-arm64/
npm run package:all    # universal (arm64 + Intel): dist/Ulanzi Deck Open-darwin-universal/
```

Then either open the bundle directly:

```bash
open "dist/Ulanzi Deck Open-darwin-arm64/Ulanzi Deck Open.app"
```

or install it into `~/Applications` and register it with Spotlight/Launchpad:

```bash
npm run install-app    # package + copy to ~/Applications + lsregister + launch
```

`install-app` builds arm64 on Apple Silicon and the universal bundle on Intel. It also
refreshes LaunchServices, so the app appears in Spotlight and Launchpad.

Optional DMG (for sharing the unsigned build with someone else):

```bash
npm run make:dmg       # dist/Ulanzi-Deck-Open-<version>.dmg
```

The DMG contains the app plus an `Applications` shortcut. It is not signed or notarized,
so the recipient must do the Gatekeeper step below.

### If you received a prebuilt unsigned build

Tagged releases (`v*`) are built by `.github/workflows/release.yml` from source and
attached to the GitHub Release as a universal DMG plus `SHA256SUMS.txt`. They are
unsigned. macOS quarantines apps downloaded from a browser or GitHub Releases. Either:

* right-click the app in Finder → **Open** → **Open** again, or
* remove the quarantine flag once:

```bash
xattr -dr com.apple.quarantine "/Applications/Ulanzi Deck Open.app"
```

This is expected for an unsigned build. Signing/notarization is deliberately not part of
the current process, and unsigned builds have **no auto-updater**; installing a newer
build means replacing the app. See [`docs/RELEASE.md`](docs/RELEASE.md) if signing is
added later.

## First run

1. Quit **Ulanzi Studio** (menu bar → Quit).
2. Connect the D200 and launch **Ulanzi Deck Open**.
3. Grant macOS permissions when asked:
   * **Accessibility** — required for hotkeys and typing text. The app offers a
     **Grant…** button in **Deck settings → App**, or use System Settings → Privacy & Security
     → Accessibility (named **Device Control and Data Access** on macOS 27). Media keys use the native `mediakey` helper. If a media key
     does nothing, grant Accessibility and relaunch.
   * **Input Monitoring** — required by the bundled `hidseize` helper so the D200's
     firmware fallback cannot type `www.ulanzistudio.com` into the frontmost app. When
     **Deck settings → App → Key capture** asks for it, press **Grant…**, enable the app in
     Input Monitoring and relaunch.
4. Open-app, URL, shell and page actions need no special permission.

Config lives in `~/Library/Application Support/Ulanzi Deck Open/config.json`. The app
keeps a `.bak` and prunes unreferenced images on save. Reload results are appended to
`~/Library/Logs/Ulanzi Deck Open/reload.log`; failed shell commands and their stderr go to
`~/Library/Logs/Ulanzi Deck Open/commands.log` and flash the key red.

If you generate or edit `config.json` outside the app, use **File → Reload Config from
Disk**. From a script, run `open -n -a "Ulanzi Deck Open" --args --reload-config` against
the running app (`-n` is required so the flag reaches a second process); an invalid file is
copied to `config.json.rejected` and left untouched. `--quit` (or a normal SIGTERM) quits
without the interactive confirmation, and the login shell's `PATH` is used for command
actions so Homebrew tools are found.

## Troubleshooting

* **“Deck busy” / cannot connect** — quit Ulanzi Studio (and any other app using the
  deck). The control interface is exclusive.
* **Hotkeys do nothing** — grant Accessibility, then quit and relaunch the app.
* **The wide key types a URL** — grant Input Monitoring (see above).
* **Key capture says “Not allowed by macOS”** — the kernel refused the keyboard seize
  (`seize 0xe00002c1`, `kIOReturnNotPrivileged`, in `~/Library/Logs/Ulanzi Deck Open/seize.log`).
  No permission setting changes this.
* **Input Monitoring is still requested after an update** — the app is ad-hoc signed, so its signature changes with each build. Remove and re-add the app in Input Monitoring after installing a new version.
* **The app does not appear in Spotlight/Launchpad** — run `npm run install-app` so
  LaunchServices is refreshed, or open the app once from Finder.
* **`npm run package` fails on clang/lipo** — install the Xcode Command Line Tools:
  `xcode-select --install`.
* **Port 3906 is busy** — quit Ulanzi Studio. The plugin host retries automatically.
* **A Stream Deck plugin does nothing** — check its badge in **Installed → Plugins**:
  “Needs Rosetta” means it only ships an Intel binary — use its **Install Rosetta…**
  button — and “No compatible code for this Mac” means it has no macOS code path.
  Native plugin binaries may also need to be allowed in System Settings → Privacy &
  Security if macOS blocks them.

## Local security

The app is a single-user desktop tool: plugins are local programs that run with your
account and are trusted in the same way as any other program you install.

- **Plugin IPC is loopback-only.** Each plugin host listens on `127.0.0.1` and passes
  the port to its plugins. It rejects browser origins, but it has no per-plugin secret:
  a local process that knows a plugin UUID can register as that plugin, receive its
  settings (including API keys stored in action settings), and replace the running
  plugin's socket. Same-account processes can already do anything your account can;
  the practical boundary is another macOS user on the same Mac, who can reach
  loopback. Do not run untrusted local software or let other users use this account.
- **Application data is owner-only.** `config.json`, `config.json.bak`, the plugin
  settings file and the store token are written with mode `0600` under
  `~/Library/Application Support/Ulanzi Deck Open`, and the directory is `0700`.
- **Plugins may open URLs.** A plugin can ask the host to open an `http(s)` or `mailto`
  link with `shell.openExternal`; treat a plugin's presence as permission to do that.

## Project layout

```
app/                 Electron GUI (the app)
  main.js            window, tray, menu-bar lifecycle
  ipc.js             IPC handlers (config, plugins, store, imports)
  preload.js         context-isolated bridge
  plugin-hosts.js    starts and wires both plugin hosts
  lib/protocol.js    frame encoding/decoding
  lib/deck.js        node-hid transport, read loop, key events, wide-key feed
  lib/page.js        page ZIP builder (content-addressed PNGs)
  lib/store.js       config schema + defaults
  lib/image-url.js   file: refs ↔ ulanzi-image:// URLs
  lib/image-protocol.js  serves Images/ to the renderer
  lib/actions.js     open/hotkey/command execution
  lib/sysstats.js    CPU / RAM / GPU sampling for the wide key
  lib/plugin-host.js shared plugin lifecycle (WebSocket server, spawn, backoff)
  lib/plugins.js     Ulanzi plugin adapter on the shared host
  lib/streamdeck-plugins.js  Stream Deck SDK / OpenAction adapter on the shared host
  renderer/          UI (HTML/CSS/JS, canvas key rendering)
  scripts/           build, package and install helpers
ulanzi_deck/         Python protocol prototype (the app does not use it)
examples/hello.py    Python: draw a numbered page on the deck
docs/PROTOCOL.md     reverse-engineered USB/HID protocol
```

## Roadmap

Still open: firmware updates (risky), Python plugins, multi-device support
(D200H/D200X/Dial/AU05), and OBS Studio actions. See
[`docs/ROADMAP.md`](docs/ROADMAP.md) for the current status and
[`CHANGELOG.md`](CHANGELOG.md) for what has landed.

## Protocol

See [`docs/PROTOCOL.md`](docs/PROTOCOL.md). In short:

```
frame  = 7C 7C | cmd | proto | u32 length | payload   (padded to 1024 bytes)
host   = HID output reports: 0x00 + 1024-byte chunk
device = HID input reports:  1024-byte chunk
```

Pages are a ZIP with `manifest.json` (`"column_row"` → `Icon` / `Text` / `Font`) and
`Images/*.png`. Key events arrive as `cmd=0x01 proto=0x01`, payload
`01 <index> 01 <state>`.

## Development notes

* Electron 45 + `node-hid` (N-API) + `jszip`; no bundler. The renderer is plain
  HTML/CSS/JS.
* `ULANZI_SHOT=/tmp/ui.png` renders the window to a PNG and exits (useful for CI
  screenshots). `ULANZI_CLICK=5` selects a key first; `ULANZI_KEY=7` simulates a
  device key press; `ULANZI_CONFIG_DIR` uses a throwaway config so dev and packaged
  apps can run side by side; `ULANZI_NO_DECK=1` skips the HID connection (useful for
  screenshots and UI work without hardware).
* Run the tests with `npm test` (Node's built-in test runner).
* The Python prototype remains for protocol experiments:
  `python3 -m venv .venv && .venv/bin/pip install pillow && PYTHONPATH=. .venv/bin/python examples/hello.py`.

## Legal

Independent interoperability project. It is **not affiliated with or endorsed by
Ulanzi**. No Ulanzi code, firmware or binary assets are included. Protocol facts were
obtained by observing USB traffic on hardware we own.

MIT licensed. The MIT licence covers this project's code and original assets; third-party
names and trademarks remain the property of their owners.
