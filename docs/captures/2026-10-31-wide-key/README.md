# Wide-key / Uclock capture — 2026-10-31

Goal: find the payload the official app uses for the D200 2×1 wide key and for
the Uclock widgets (Social Media / Schedule / DIY / Tool).

## Method

The official app builds a temporary package under:

```
~/Library/Application Support/Ulanzi/UlanziDeck/TempData/<device-serial>/
```

sends it, then deletes it. A watcher (`app/scripts/watch-temp-zips.js`) polls the
directory every 5 ms and:

* hard-links every new `.zip` into a capture folder before the app can unlink it,
* copies each staging directory (manifest + images) as it appears.

Run it before launching Ulanzi Studio, then switch pages / modes in the official
app.

## Captured so far

**Full page** (`protocolID=1`): a ZIP with `manifest.json` and all key images.
Same shape as our `lib/page.js` output.

**Incremental single-key updates** (`protocolID=13`): a ZIP with **one slot** and
one image. Examples are in `proto13-2_1.json`, `proto13-3_1.json`,
`proto13-4_1.json` (slots `2_1`, `3_1`, `4_1`). This is how the official app
updates a single key (e.g. a plugin live image) without re-sending the page.

**No `3_2` payload was observed.** The wide key stayed on
`com.ulanzi.ulanzideck.smallwindow.window` / `SmallViewMode:1`, and the captures
contained normal key slots only. The wide key is the firmware system panel, not
part of the incremental key ZIPs.

## What this means for Uclock

The Uclock entries (`com.ulanzi.clock.applicationmanagement.*`) are **PrivateAPI**
actions, and the app also contains a separate `UclockDeviceManager` /
`uclockdevicemanage` product (BLE/Wi-Fi clock). It is not yet proven that those
widgets can be assigned to the D200 wide key at all. The earlier gap note
(“Uclock populates the wide-key small window”) may have conflated the two
products.

**Confirmed 2026-10-31:** the D200 editor does **not** accept any action on the
wide key. Social Media / Schedule / DIY / Tool cannot be assigned to `3_2`.
The Uclock widgets belong to the separate Uclock device; the D200 wide key is
the firmware system panel. It does have three useful panels — clock, CPU/RAM/GPU
and pure background — which our editor now exposes (see “Panel modes” below).

## Panel modes (2026-10-31)

`SystemSmallWindowsEditor` exposes radio IDs `0/1/2/100/200-203`. The mode is
stored in the page action as `ActionParam.SmallViewMode` and is also the first
field of the proto `0x06` small-window payload. Mapping used by our editor:

| Mode | Meaning |
| --- | --- |
| 1 | clock (default) |
| 0 | CPU + RAM + GPU |
| 2 | pure background (no clock/stats) |
| 100, 200–203 | extra clock layouts |

## Small-window channel

The official code has `UlanziDeck::SendSmallWindowData` and
`SendSmallWinInfoToDeck(cmd, proto, data, sn)`; the wide-key content is a
separate small-window payload, not the page ZIP. Capturing it requires either a
correct wide-key mode trigger or instrumenting those functions. The temp-file
watcher only covers ZIP-based sends.

## Artifacts

* Incremental manifests were observed during capture; the vendor-generated files are
  not committed. The notes above are the interoperability summary.
* `app/scripts/watch-temp-zips.js` — the capture watcher.
