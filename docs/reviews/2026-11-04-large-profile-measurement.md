# Large-profile measurement — 2026-11-04

## Why

The 1.0 plan (architecture audit §1.0) makes lazy image refs (L5/L8) conditional
on measuring a representative large profile first. The store already keeps
images on disk as `file:<name>` refs, but `config:state` expands every ref back
to a base64 data URL before handing the config to the renderer, so the startup
payload is proportional to image bytes.

## Method

`app/scripts/measure-config.js` copies a real profile (or generates a synthetic
one), loads it through the real `lib/store.js` path, and measures the exact JSON
the renderer receives. Synthetic keys use 392×392 images: 12 KB icon-pack-style
icons, 250 KB photo-style icons for 10% of keys, and 180 KB page backgrounds —
roughly a power user with a mix of icon packs, app icons and photos.

Run it with `npm run measure:config` or point it at a profile:

```sh
npm run measure:config -- --config "$HOME/Library/Application Support/Ulanzi Deck Open"
```

## Results before L8

| Profile | Pages / keys | Images on disk | Payload to renderer | `store.load()` | `stringify` |
| --- | --- | --- | --- | --- | --- |
| This machine's real profile | 4 / 41 | 0.15 MB | **0.22 MB** | 9 ms | 0.6 ms |
| Large mixed (20 pages, 10% photos) | 20 / 260 | 13.0 MB | **25.9 MB** | 56 ms | 54 ms |
| Photo-heavy (20 pages, every key a photo) | 20 / 260 | 90.5 MB | **133.8 MB** | 59 ms | 298 ms |

The generated config file itself is 66 KB in both synthetic runs (282 `file:`
refs); everything else is image data, inflated ~1.5–2× by base64.

## Results after L8

| Profile | Payload to renderer | `store.load()` | `stringify` |
| --- | --- | --- | --- |
| This machine's real profile | **0.01 MB** | 9 ms | 0.0 ms |
| Large mixed | **0.04 MB** | 4 ms | 0.1 ms |
| Photo-heavy | **0.04 MB** | 6 ms | 0.1 ms |

`load()` now does one `stat` per ref (to drop missing or invalid names) instead
of reading and base64-encoding every image; the payload is the config JSON with
`file:` refs. The renderer resolves them through `ulanzi-image://images/<name>`.

## What it means

- A normal profile is not a problem: 0.22 MB and 9 ms.
- A large but plausible profile already costs **26 MB and ~110 ms of synchronous
  work** before Electron's IPC structured clone, and the photo-heavy case is
  **134 MB / ~300 ms**.
- The config without images is only ~66 KB, so a lazy-image scheme would remove
  essentially all of the payload.

## Decision

**L5 was already done** (images live on disk and the config file is small).
**L8 is implemented on main** (unreleased at the time of writing): the store
keeps `file:<name>` refs for the running config, the renderer loads them through
a private CORS-enabled scheme, and profile export still expands them into data
URLs so exported profiles remain self-contained.

The scheme is `ulanzi-image://images/<sha1>.<ext>`; names are validated and the
handler never joins a caller-supplied path. The renderer sets
`crossOrigin="anonymous"` for those images so `drawImage()` keeps the key
canvases untainted and `toDataURL()` still works when pushing a page.
