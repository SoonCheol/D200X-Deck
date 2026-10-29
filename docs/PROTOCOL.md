# Ulanzi D200 — reverse-engineered notes

Working notes from inspecting **Ulanzi Studio 3.4.8** (`ulanzi.UlanziStudio`) on macOS and
capturing its USB traffic while it drove a **Ulanzi D200**.

Everything below was verified against live traffic unless marked *(unverified)*.

## 1. The device

| | |
|---|---|
| USB VID:PID | `0x2207:0x0019` (Rockchip) |
| Serial (this unit) | `<redacted>` |
| Firmware | `2.0.3` |
| HID collection A | interface 0, usage page `0x0C` (Consumer), usage 1 |
| HID collection B | interface 2, usage page `0x01` (Generic Desktop), usage 6 (Keyboard) |
| Grid | 5 columns × 3 rows, 196×196 px per key |

The control channel used by Ulanzi Studio is **interface 0**, opened with hidapi.
Interface 2 is a keyboard-emulation collection.

## 2. Transport

The device speaks a simple framed protocol on raw HID reports.

* **Host → device**: each `hid_write` is **1025 bytes** = `report_id (0x00)` + **1024 bytes** of stream.
* **Device → host**: each `hid_read` is **1024 bytes**, no report id, same framing.
* The byte stream is split into 1024-byte chunks. **Every frame is zero-padded so the next frame
  starts on a 1024-byte boundary.**

### Frame

```
offset  size  field
0       2     magic = 0x7C 0x7C
2       1     cmd
3       1     proto        (operation / sub-command)
4       4     length       uint32 little-endian, payload length
8       N     payload
8+N     ...   zero padding up to the next 1024-byte boundary
```

## 3. Commands observed

All host → device frames observed so far use `cmd = 0x00`; `proto` selects the operation.

| cmd | proto | direction | meaning | payload |
|---|---|---|---|---|
| 0x00 | 0x01 | → device | upload page package | ZIP (see §4) |
| 0x00 | 0x03 | → device | request device info | empty |
| 0x00 | 0x06 | → device | clock sync | ASCII `1\|MM\|SS\|HH:MM:SS\|0\|24H\|` |
| 0x00 | 0x0A | → device | set brightness | **two ASCII hex digits**, `00`–`ff` (e.g. `d9` = 217) |
| 0x00 | 0x0B | → device | global font/UI config | JSON `{Align,Color,FontName,ShowTitle,Size,Weight}` |
| 0x00 | 0x1A | → device | screen sleep time | ASCII decimal (seconds; `0` = never) |
| 0x01 | 0x01 | ← device | key event | `01 <index> 01 <state>` |
| 0x03 | 0x03 | ← device | device info reply | JSON `{"Dversion","SerialNumber","error"}` |
| 0x03 | 0x0A | ← device | brightness ack | binary byte, the applied value `0`–`255` |

### Key events

Verified by pressing physical keys 1, 2 and 3:

```
7c 7c 01 01 ... 01 00 01 01   key index 0 press
7c 7c 01 01 ... 01 00 01 00   key index 0 release
7c 7c 01 01 ... 01 01 01 01   key index 1 press
7c 7c 01 01 ... 01 02 01 01   key index 2 press
```

Payload:

| offset | meaning |
|---|---|
| 0 | kind: `1` = key/button |
| 1 | key index, 0-based, row-major (`index = row * 5 + col`) |
| 2 | flags (always `1` for key presses so far) |
| 3 | state: `1` = press, `0` = release |

The application's internal `DeckKeyEvent` uses `{type, status}`:
key → `keydown`/`keyup`; knob press → `dialdown`/`dialup`; knob rotate → `dialrotate`.
Knob frames (D200H/X) have not been captured yet; the decoder supports
`kind = 2` with `value = 0` (press) and `1..5` (rotation directions).

## 4. Page package (proto 0x01)

A plain ZIP. Layout:

```
manifest.json
Images/
  <uuid>.png     (196×196, RGB/RGBA)
  <uuid>.svg     (SVG is accepted too)
```

`manifest.json` maps slots to what the device should draw:

```json
{
  "0_0": {
    "State": 0,
    "ViewParam": [
      {
        "Font": {
          "Align": "bottom",
          "Color": 16777215,
          "FontName": "Source Han Sans SC",
          "ShowTitle": true,
          "Size": 10,
          "Weight": 80
        },
        "Icon": "Images/2cd7dc36-....png",
        "Text": ""
      }
    ]
  }
}
```

* Slot key is **`column_row`**, column `0..4` left→right, row `0..2` top→bottom.
* `Icon` is a path inside the ZIP. The device displays the image; the `Text`/`Font` fields make
  the **device** draw a text overlay (the app does not bake the title into the image).
* `"SmallViewMode": 1` appears for special slots (e.g. `3_2`) on some layouts.
* `State` selects a per-state view (multi-state buttons).

Ulanzi Studio builds this ZIP per page, caches it in
`~/Library/Application Support/Ulanzi/UlanziDeck/ProfilesV2/…`, then streams the whole ZIP.

## 5. Application architecture (what we're replacing)

* Qt 6.5.3 / C++ (Qt Widgets + QML + WebEngine). The main binary keeps its symbols
  (`HIDDevice`, `HIDDeviceManager`, `DeckFrame`, `DeviceControlRegistry`, `PluginManager`, …).
* HID via `libhidapi` (bundled). `HIDDevice::sendDataToDeck(cmd, proto, data, len)` builds the
  frame above; `HIDDevice::readLoop()` reads 1024-byte reports and re-emits `DeckFrame`.
* Plugins are **Node.js processes** using a **WebSocket JSON protocol** on `127.0.0.1:3906`.
  This is the most valuable compatibility surface: an open-source host can run existing
  Ulanzi plugins unchanged.
* Profiles/pages live as directories with `manifest.json` + `Images/`; settings in
  `Config/setting.json`, devices in `Config/device.json`.

### Plugin protocol (from the shipped SDK `ulanziApi.js`)

Plugin is spawned as `node app.js <host> <port> <lang> <appVersion>` and connects to
`ws://host:port`. First message: `{code:0, cmd:"connected", uuid}`.

Commands seen in the SDK: `add`, `run`, `clear`, `setImage`, `setTitle`, `setState`, `state`,
`setSettings`, `getSettings`, `didReceiveSettings`, `setGlobalSettings`, `getGlobalSettings`,
`didReceiveGlobalSettings`, `sendToPropertyInspector`, `sendToPlugin`, `keydown`, `keyup`,
`dialdown`, `dialup`, `dialrotate`, `toast`, `openurl`, `logMessage`, `setFeedback`,
`setFeedbackLayout`.

## 6. How the traffic was captured (safe, reproducible)

1. Copy `Ulanzi Studio.app` to a temp dir.
2. Re-sign the copy ad-hoc with
   `com.apple.security.cs.allow-dyld-environment-variables` (the original is hardened and
   strips `DYLD_*`).
3. Launch the copy with a tiny `DYLD_INSERT_LIBRARIES` interposer that wraps
   `hid_write` / `hid_read*` and dumps the raw reports.
4. Reconstruct the 1024-byte stream and parse frames.

The original app and its signature were not modified.

## 7. Open questions

* Whether the D200 needs an explicit "page ready" ack before accepting the next frame
  (not observed: back-to-back frames work).
* Battery/charging status command (the vendor app exposes it for some models; not seen on D200).
* D200H / D200X variants (knob events, different grids) and BLE transport.
* Whether the firmware caches images by filename (our writer uses content hashes to be safe).
