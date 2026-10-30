# Icon options

Design options that were generated for the app icon and the menu bar glyph. The app
currently ships **app icon 4 (Night U)** and **menu bar 4 (letter U)** — the
production assets live in `app/build/icon.icns` and `app/build/tray*.png`.

`preview.png` shows everything side by side.

## App icons (`app-icon-*.png`, 1024×1024)

| File | Description |
| --- | --- |
| `app-icon-1-aurora.png` | blue gradient tile, white keys |
| `app-icon-2-graphite.png` | graphite tile, dark keys, blue wide key (closest to the hardware) |
| `app-icon-3-light.png` | white tile, dark deck with coloured app keys and glyphs |
| `app-icon-4-night-u.png` | deep navy tile, glowing “U” over a ghost key grid — **in use** |

## Menu bar glyphs (template images, 18 px + `@2x`)

| File | Description |
| --- | --- |
| `menubar-1-dots*` | 4×3 dot grid |
| `menubar-2-panel-dots*` | panel outline with a 3×2 grid |
| `menubar-3-deck-wide-key*` | deck layout with the merged wide key |
| `menubar-4-letter-u*` | just the “U” mark — **in use** |

All glyphs are template images: the system paints them black on a light menu bar and
white on a dark one, so only the alpha channel matters.

`svg/` holds the vector sources these PNGs were rendered from.
