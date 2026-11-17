# Bundled icon packs

Place the unmodified `DeckForge_IoT_Icons.streamDeckIconPack` archive in this directory. It is packaged with DeckForge Windows builds and loaded at runtime as the read-only `DeckForge IoT Icons` library by Airburst (106 icons). The source archive must retain `manifest.json`, `icons.json`, and `icons/` entries. User-installed packs under `%APPDATA%\DeckForge\Resources\IconPacks` remain separate and are never overwritten.

This README is not a substitute for the binary archive. A build without the archive does **not** include the IoT pack.
