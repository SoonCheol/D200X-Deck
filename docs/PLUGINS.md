# Plugin host

The app runs two plugin ecosystems:

* **Ulanzi plugins** (`.ulanziPlugin`) — the vendor's Node/HTML SDK.
* **Stream Deck SDK / OpenAction plugins** (`.sdPlugin`) — Node, HTML or native
  binaries, including plugins made for Elgato Stream Deck, OpenDeck and OpenAction.

This is what lets keys from both ecosystems (news, weather, agent status, OBS,
home automation, …) keep working while the D200 itself is driven by our app.

## Plugin sources

| Source | Location | Managed |
| --- | --- | --- |
| **This app — Ulanzi** | `~/Library/Application Support/Ulanzi Deck Open/Plugins` | install / update / remove |
| **This app — Stream Deck** | `~/Library/Application Support/Ulanzi Deck Open/StreamDeckPlugins` | install / remove |
| **Ulanzi Studio** | `~/Library/Application Support/Ulanzi/UlanziDeck/Plugins` | read-only, shown as **Read-only** |
| **Elgato Stream Deck** | `~/Library/Application Support/com.elgato.StreamDeck/Plugins` | read-only, shown as **Read-only** |
| **OpenDeck** | `~/Library/Application Support/opendeck/plugins` | read-only, shown as **Read-only** |

App-installed plugins shadow a read-only plugin with the same UUID. A read-only plugin
can be adopted with **Copy** in the plugin manager: it is copied into this app's folder
and from then on can be edited or removed here.

Install **`.sdPlugin`** folders, `.streamdeckplugin` packages or ordinary ZIPs from
**Installed → Plugins**. The installer detects the SDK from the manifest/folder and
puts it in the matching app folder.

## Stream Deck / OpenAction host

The host implements the Stream Deck SDK WebSocket protocol, so plugin authors do not
need an adapter:

* **Manifest:** `manifest.json` with `Actions`, `States`, `CodePath`/`CodePathMac` /
  `CodePaths`, `PropertyInspectorPath`, `OS`, `Category`.
* **Code kinds:** `.js`/`.mjs`/`.cjs` (Node), `.html` (hidden BrowserWindow), native
  macOS executables. Windows-only binaries run through Wine when `wine` is installed.
* **Spawn:** `-port <port> -pluginUUID <uuid> -registerEvent registerPlugin -info <json>`.
* **Protocol:** `registerPlugin`, `willAppear`, `willDisappear`, `keyDown`, `keyUp`,
  `setImage`, `setTitle`, `setState`, `setSettings`, `getSettings`,
  `setGlobalSettings`, `getGlobalSettings`, `sendToPlugin`,
  `sendToPropertyInspector`, `showAlert`, `showOk`, `openUrl`, `logMessage`, plus the
  OpenAction extensions `switchProfile` and `deviceBrightness`. Encoder-only calls
  (`setFeedback`, `setFeedbackLayout`, dial events) are accepted and ignored on the
  D200.
* **Contexts:** every key action gets a stable context (its action UUID). Images and
  titles are tracked per state; `setState` switches the key.
* **Key events:** Stream Deck action keys receive real physical `keyDown`/`keyUp`, so
  plugins can implement their own tap/hold/double logic.

Native plugin binaries are third-party executables. Only install plugins you trust;
macOS may also ask you to allow a downloaded binary in Privacy & Security.

## OpenAction Store

**Store → OpenAction Plugins** lists the **OpenAction** catalogue
(`openactionapi.github.io`), the same registry the Tacto/OpenAction marketplace uses.
Every entry points at a GitHub repository, and packages are resolved from that
repository's latest release, so versions are always current.

The Store tabs are **Ulanzi Plugins**, **Ulanzi Icons** and **OpenAction
Plugins**. Search by name, author or ID and click **Install**. Installed plugins are compared by
version; **Update** replaces the app-owned copy. No account is required. This is a
third-party/community index, not the official Elgato store.

The store deliberately does not ship the community Elgato marketplace mirror
(`plugins.amankhanna.me`): its catalogue and packages were frozen in April 2024 and
its upstream CDN is gone, so it could only offer stale versions. Plugins you install
with the Elgato app are still picked up from Elgato's plugin folder.

Downloads are HTTPS-only, capped at 128 MB, and ZIP paths are validated before
extraction. Only install plugins you trust; native plugins are executables.

If a plugin's property inspector does not react (empty panel, settings that do
not stick), **Installed → Open plugin log** opens `streamdeck.log` next to the
app's data. It records plugin start/exit, the messages exchanged with the plugin
and its inspector, and the plugin's stderr.

Some older marketplace plugins ship Intel-only (x86_64) binaries. On Apple Silicon
they need Rosetta: the Installed list marks them **Needs Rosetta** and offers an
**Install Rosetta…** button that opens Terminal with
`softwareupdate --install-rosetta --agree-to-license`.

## Plugin settings (property inspectors)

Both SDKs can ship an HTML property inspector (`PropertyInspectorPath` in the
manifest). The key inspector renders it in an iframe.

**Ulanzi** inspectors get the same query parameters the official app uses (`actionId`,
`key`, `port`, `address`, `language`) and bridge the Ulanzi SDK protocol over the
existing WebSocket host:

* inspector → host: `paramfromplugin` (the form saved its value)
* host → plugin: `paramfromapp` (so the key redraws)
* host → inspector: `add` / `paramfromapp`

Inspector files are served through a private `ulanzi-pi://` protocol (not `file://`), so
the app can inject a theme stylesheet that matches the rest of the UI (colours, fonts,
inputs, scrollbars) and a tiny script that reports the form height. The iframe is sized
to its content; an inspector that has not rendered yet is collapsed (not removed) so it
can expand once the plugin fills the form.

The injected theme also normalises field sizing (`box-sizing: border-box`, `min-width: 0`,
`max-width: 100%`), because several plugins hard-code a 219 px minimum width that used to
spill under the scrollbar, and lets the SDK's localization load by serving files from the
`.ulanziPlugin` folder path it expects.

Because inspector pages come from that custom scheme, responses from loopback services
(`127.0.0.1` / `localhost`) get permissive CORS headers — some inspectors talk to a local
daemon (AgentDeck's port 9120, for example), which the vendor app allows too.

The settings are persisted on the key (`action.settings`) exactly like before, so
configs stay compatible. Actions without an inspector expose their raw settings behind
**Advanced: edit settings JSON**.

**Stream Deck / OpenAction** inspectors are served through `sd-pi://` and receive the
standard `connectElgatoStreamDeckSocket(port, context, "registerPropertyInspector",
info, actionInfo)` or `connectOpenActionSocket(...)` call. They can send
`setSettings`, `getSettings`, `setGlobalSettings`, `getGlobalSettings`, `sendToPlugin`
and `openUrl` exactly as under the Elgato software. `window.open` links are opened in
the default browser.

## Plugin Store

The **Store** entry in the sidebar talks to the official Ulanzi Studio marketplace
(`https://ugc.ulanzistudio.com/api/api`), the same backend the community site uses:

| Call | Purpose |
| --- | --- |
| `GET /cateList` | categories |
| `GET /list?cateId=&page=&limit=&sort=&isAsc=&searchText=&classify=&source=web&lang=en_US` | paged plugin list |
| `GET /resources?id=` | details (`tResources`), including `uuid` and the ZIP at `files` |
| `GET /down?id=` | download counter |

Browsing and downloading are public; the site's optional account sign-in only adds
a personal session token (stored in `store.json`, mode `600`).

A lot of the older marketplace entries (about 38 of the 63 icon packs) point at files
that no longer exist on Ulanzi's CDN — the URL returns an HTML/XML 404. The detail view
HEAD-checks the file first and marks those items **Unavailable** instead of letting the
download fail. Installing a store
item downloads its ZIP and unpacks it into this app's plugin folder, so it appears in
the plugin manager as **Installed** and can be removed from there.

**Icon packs** (Store → Icons) download into `<userData>/Icons/<pack>/` with a small
`pack.json`. They show up in the inspector's **Choose from library…** picker; picking
an icon downscales it to 392 px and stores it on the key. Profile files
(`.ulanziDeckProfile`) are listed but not installable.

**Installed** (sidebar → Plugins & Icons) has two tabs:

* **Plugins** — this app's plugins (install / reload / remove) plus plugins installed by
  Ulanzi Studio, shown as **Read-only** and copied into this app with **Copy**.
* **Icons** — icon packs downloaded here (delete allowed) and packs found in Ulanzi
  Studio's own `Icons` folder, shown read-only so they stay intact.

## Ulanzi plugin protocol

1. On startup the app scans:
   * `~/Library/Application Support/Ulanzi/UlanziDeck/Plugins/*.ulanziPlugin`
   * `<userData>/Plugins/*.ulanziPlugin`
2. Each `manifest.json` is parsed. JavaScript plugins (`.js` `CodePath`) run as child
   processes; HTML plugins (`.html` `CodePath`) run in a hidden BrowserWindow. Both
   connect to the same WebSocket host and support property inspectors.
3. A plugin process is spawned lazily when an action from it is used:

   ```
   <Electron binary> <CodePath> 127.0.0.1 3906 en-US <appVersion>
   ```

   with `ELECTRON_RUN_AS_NODE=1`, cwd = plugin directory. This is the same contract
   Ulanzi Studio uses (`node app.js <host> <port> <lang> <version>`), so the shipped
   SDK connects unchanged.
4. The app runs a WebSocket server on `127.0.0.1:3906`, falling back to the next free
   port if that one is taken. Plugins must use the port passed on the command line. The
   plugin sends:

   ```json
   {"code":0,"cmd":"connected","uuid":"com.example.plugin"}
   ```

5. For every plugin-backed key the host sends an `add`. **`uuid` must be the action
   UUID, not the plugin UUID**: the SDK builds `context = uuid + "___" + key + "___" +
   actionid`, and plugins use `decodeContext()` to tell their instances apart (e.g. the
   Claude Usage plugin switches between its 5-hour and weekly views on that field).
   Action-scoped messages (`add`, `setactive`, `paramfromapp`, `keydown`, `run`,
   `clear`, `didReceiveSettings`) all carry the action UUID; only `connected` carries
   the plugin UUID.

   ```json
   {
     "cmd":"add",
     "uuid":"com.example.plugin",
     "key":"0_0",
     "actionid":"<instance uuid>",
     "action":"com.example.plugin.action",
     "name":"Action name",
     "param":{ "settings": "..." }
   }
   ```

   The SDK derives a `context` string as `uuid___key___actionid`; plugins use it to
   address their own key instance.

6. Key presses send `keydown`, `run`, then `keyup` (80 ms later). Page switches send
   `setactive` with `active: true/false`; removing a key sends `clear`.

## Messages the host handles

| cmd | behaviour |
|---|---|
| `state` | `param.statelist[]` → image (`type:1` data URL / `type:2` path / `type:3` GIF / `type:0` manifest state) |
| `setImage` | same as `state` |
| `setTitle` | updates the key label |
| `setSettings`, `paramfromplugin` | persists plugin settings in the key config |
| `getSettings` | replies with `didReceiveSettings` |
| `setGlobalSettings` / `getGlobalSettings` | per-plugin global settings map |
| `openurl` | opens a URL (or a file inside the plugin) |
| `openview` | opens an http(s) URL in the browser, or a local HTML view inside the plugin folder |
| `selectdialog` | opens a native file/folder picker and replies with `{type, path, canceled}` to `onSelectdialog` |
| `setFeedback`, `setFeedbackLayout` | accepted and ignored — they are encoder/dial feedback messages and the D200 has no encoder |
| `toast`, `logMessage`, `showAlert` | forwarded to the UI / console |

## Image handling

Plugin images are **not** persisted. They live in memory keyed by `actionid`; on each
`state` message the key canvas is redrawn and the page bundle is pushed to the deck.
The g1 plugin’s SVG (with an embedded JPEG) is passed straight to Chromium’s canvas.

## Managing plugins in the app

Click **Installed** in the sidebar:

* **Install folder…** — pick a `.ulanziPlugin` or `.sdPlugin` directory
* **Install .zip…** — pick a plugin ZIP / `.streamdeckplugin`; the SDK is detected automatically
* **Reload all** — restarts every plugin process and rescans
* **Open plugins folder** — reveals the app's Ulanzi plugin folder
* **Open Stream Deck folder** — reveals the app's `.sdPlugin` folder
* **Show** — reveals the plugin on disk
* **Remove** — only for plugins installed by this app; plugins from Ulanzi Studio,
  Elgato Stream Deck and OpenDeck are read-only (use **Copy** to adopt them)

Installed plugins are copied to the app's own plugin folder, so they survive updates
of the source application. When both locations contain the same UUID, the app's copy
wins. The installer rejects unsafe ZIP paths before extracting.

Crashed plugins are restarted with exponential backoff (capped at five attempts per
minute). On reconnect, Ulanzi plugins get `add`/`setactive` replayed; Stream Deck
plugins get `willAppear` for every active action.

## Using a plugin key

In the key inspector choose **Plugin action**, then the plugin and action. The picker
groups **Stream Deck / OpenAction** and **Ulanzi** plugins. If the action ships a
property inspector, its form is embedded in the panel; otherwise its raw settings live
behind **Advanced: edit settings JSON**. The key shows the plugin’s live image.

* **Ulanzi** keys send `keydown`, `run`, `keyup`.
* **Stream Deck** keys forward the physical `keyDown`/`keyUp`, so plugin-side hold and
  double-press logic works; the host also performs the standard two-state toggle for
  actions that do not disable it.

## Limitations (current)

* The D200 has no encoders or touchscreen, so Stream Deck encoder/dial/touchscreen
  actions are not usable.
* Windows-only Stream Deck plugins need **Wine** installed; otherwise they show
  **No compatible code for this Mac**. Intel-only plugins on Apple Silicon show
  **Needs Rosetta** with an install button.
* The plugin host starts on `127.0.0.1:3906` and falls back to the next free port, so
  plugins must use the port passed on the command line. Stream Deck plugins use a
  dynamic port starting at 57116.
* Python plugins are not supported.
* A read-only plugin (from Ulanzi Studio, Elgato Stream Deck or OpenDeck) is shown as
  **Read-only** until you copy it into this app's plugin folder.
* Plugin catalogues/store fronts from OpenDeck/Elgato are not built in; use
  **Install folder/ZIP**, the Ulanzi Store, or the built-in **Store → OpenAction
  Plugins** tab.

## Developing a Stream Deck / OpenAction plugin

You can develop against the same SDK the plugin ecosystem uses; nothing here requires
OpenDeck to be installed:

1. Create a folder named `com.example.myplugin.sdPlugin` with a `manifest.json`:
   ```json
   {
     "Name": "My Plugin",
     "Author": "You",
     "Version": "1.0.0",
     "Category": "My Plugin",
     "Icon": "icon",
     "OS": [{ "Platform": "mac" }],
     "CodePath": "plugin.js",
     "Actions": [{
       "Name": "Do something",
       "UUID": "com.example.myplugin.do",
       "Icon": "icon",
       "States": [{ "Image": "icon" }],
       "Controllers": ["Keypad"],
       "PropertyInspectorPath": "inspector.html"
     }]
   }
   ```
2. For a Node plugin, read `-port`, `-pluginUUID`, `-registerEvent` and `-info` from
   `process.argv`, connect to `ws://127.0.0.1:<port>`, and send
   `{"event":"registerPlugin","uuid":"com.example.myplugin.sdPlugin"}`.
3. Handle `willAppear`, `keyDown`/`keyUp`, and reply with `setImage`, `setTitle`,
   `setState`, `setSettings`, etc.
4. For an HTML plugin, define `connectElgatoStreamDeckSocket` or
   `connectOpenActionSocket`; the host injects the connection.
5. Install the folder with **Installed → Plugins → Install folder…**. Watch the app
   log for `[sd:My Plugin]` output; use **Reload all** after code changes.

For Rust/OpenAction plugins, use the
[`openaction`](https://crates.io/crates/openaction) crate; OpenDeck’s
`plugins/com.amansprojects.starterpack.sdPlugin` is a working reference (GPL-3.0 —
read it for reference, do not copy it into this MIT project). For JavaScript plugins,
the official Elgato Stream Deck SDK (`streamdeck` npm package) works unchanged.

## Reference

The SDK used by plugins is `ulanzi-api/libs/ulanziApi.js` inside a plugin directory.
The `code` field is a trap: **host → plugin messages must not include `code`**, or the
SDK drops them (it only processes `code` messages when `cmdType === "REQUEST"`).
