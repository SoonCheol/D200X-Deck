# Plugin host

![Plugin manager](screenshots/plugins.png)

The app can run existing **Node.js Ulanzi plugins** unchanged. This is the compatibility
layer that lets keys from the vendor ecosystem (news, weather, agent status, …) keep
working while the deck itself is driven by our app.

## Plugin sources

| Source | Location | Managed |
| --- | --- | --- |
| **This app** | `~/Library/Application Support/Ulanzi Deck Open/Plugins` | install / update / remove |
| **Ulanzi Studio** | `~/Library/Application Support/Ulanzi/UlanziDeck/Plugins` | read-only, shown with 🔒 |

App-installed plugins shadow a Ulanzi Studio plugin with the same UUID. A read-only
plugin can be adopted with **Copy** in the plugin manager: it is copied into this
app's folder and from then on can be edited or removed here.

## Plugin settings (property inspectors)

Plugins ship an HTML property inspector (`PropertyInspectorPath` in the manifest). The
key inspector renders it in an iframe, with the same query parameters the official app
uses (`actionId`, `key`, `port`, `address`, `language`), and bridges the Ulanzi SDK
protocol over the existing WebSocket host:

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
configs stay compatible. Actions without an inspector still fall back to the JSON
editor.

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

* **Plugins** — this app's plugins (install / reload / remove) plus read-only 🔒
  plugins installed by Ulanzi Studio, which can be copied into this app.
* **Icons** — icon packs downloaded here (delete allowed) and packs found in Ulanzi
  Studio's own `Icons` folder, shown read-only so they stay intact.

## How it works

1. On startup the app scans:
   * `~/Library/Application Support/Ulanzi/UlanziDeck/Plugins/*.ulanziPlugin`
   * `<userData>/Plugins/*.ulanziPlugin`
2. Each `manifest.json` is parsed. Plugins with `"Type": "JavaScript"` and a `.js`
   `CodePath` are marked compatible. (HTML plugins are listed but disabled.)
3. A plugin process is spawned lazily when an action from it is used:

   ```
   <Electron binary> <CodePath> 127.0.0.1 3906 en-US <appVersion>
   ```

   with `ELECTRON_RUN_AS_NODE=1`, cwd = plugin directory. This is the same contract
   Ulanzi Studio uses (`node app.js <host> <port> <lang> <version>`), so the shipped
   SDK connects unchanged.
4. The app runs a WebSocket server on `127.0.0.1:3906`. The plugin sends:

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

Click **Plugins** in the sidebar:

* **Install folder…** — pick a `.ulanziPlugin` directory (or a folder containing one)
* **Install .zip…** — pick a plugin ZIP; it is unpacked into the app's plugin folder
* **Reload all** — restarts every plugin process and rescans
* **Open plugins folder** — reveals `~/Library/Application Support/Ulanzi Deck Open/Plugins`
* **Show** — reveals the plugin on disk
* **Remove** — only for plugins installed by this app (Ulanzi's folder is read-only)

Installed plugins are copied to the app's own plugin folder, so they survive Ulanzi
Studio updates. When both locations contain the same UUID, the app's copy wins.

Crashed plugins are restarted with exponential backoff (capped at five attempts per
minute), and on reconnect all `add`/`setactive` messages are replayed.

## Using a plugin key

In the key inspector choose **Plugin action**, then the plugin and action. If the action
ships a property inspector, its form is embedded in the panel; otherwise settings are
edited as JSON. The key shows the plugin’s live image; pressing it sends `run`.

## Limitations (current)

* JavaScript plugins run as child processes; HTML plugins (`CodePath` ending in
  `.html`) run in a hidden BrowserWindow and connect to the same host over WebSocket.
* Encoder-only calls (`setFeedback`, `setFeedbackLayout`, `rotateEvent`) are accepted but
  have no visible effect on the D200, which has no dials.
* Port 3906 is fixed; it must be free (quit Ulanzi Studio). The host retries every 10 s
  if it was busy at launch.

## Reference

The SDK used by plugins is `ulanzi-api/libs/ulanziApi.js` inside a plugin directory.
The `code` field is a trap: **host → plugin messages must not include `code`**, or the
SDK drops them (it only processes `code` messages when `cmdType === "REQUEST"`).
