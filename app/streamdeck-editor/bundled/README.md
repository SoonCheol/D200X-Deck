# Bundled icon packs

The two user-provided archives in this directory are bundled without artwork or manifest changes:

- `DeckForge_IoT_COLOR_ON_OFF.streamDeckIconPack`
- `DeckForge_IoT_LINE_ON_OFF.streamDeckIconPack`

They appear first in the library in the order above, then the two Fluent UI packs and user-installed packs. Windows packaging requires both archives and verifies ZIP CRC plus the existing icon-pack parser. Manifest names, authors, icon counts and filenames come from the archives. User-installed packs under `%APPDATA%\DeckForge\Resources\IconPacks` and saved button images remain unchanged.
