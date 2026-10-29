# Plugin host

The app can run existing **Node.js Ulanzi plugins** unchanged. This is the compatibility
layer that lets keys from the vendor ecosystem (news, weather, agent status, …) keep
working while the deck itself is driven by our app.

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

5. For every plugin-backed key the host sends an `add`:

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
| `toast`, `logMessage`, `showAlert` | forwarded to the UI / console |

## Image handling

Plugin images are **not** persisted. They live in memory keyed by `actionid`; on each
`state` message the key canvas is redrawn and the page bundle is pushed to the deck.
The g1 plugin’s SVG (with an embedded JPEG) is passed straight to Chromium’s canvas.

## Using a plugin key

In the key inspector choose **Plugin action**, then the plugin and action. Settings are
edited as JSON for now. The key shows the plugin’s live image; pressing it sends `run`.

## Limitations (current)

* Only `JavaScript` plugins; HTML plugins are listed but cannot run yet.
* No property-inspector UI hosting (`PropertyInspectorPath`). Settings are JSON.
* No multi-action / dial feedback (`setFeedback`, `setFeedbackLayout`).
* Plugin crashes are not auto-restarted until the action is re-synced.
* Port 3906 is fixed; it must be free (quit Ulanzi Studio).

## Reference

The SDK used by plugins is `ulanzi-api/libs/ulanziApi.js` inside a plugin directory.
The `code` field is a trap: **host → plugin messages must not include `code`**, or the
SDK drops them (it only processes `code` messages when `cmdType === "REQUEST"`).
