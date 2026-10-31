#!/bin/sh
# Copy the native helpers, tray images and app icon into every packaged bundle.
set -eu
cd "$(dirname "$0")/.."

find dist -name electron.icns -exec cp build/icon.icns {} \;
find dist -maxdepth 2 -name "*.app" | while read -r app; do
  mkdir -p "$app/Contents/Resources/bin"
  cp bin/hidseize "$app/Contents/Resources/bin/"
  cp bin/mediakey "$app/Contents/Resources/bin/"
  cp bin/hotkey "$app/Contents/Resources/bin/"
  cp build/tray.png "$app/Contents/Resources/tray.png"
  cp build/tray@2x.png "$app/Contents/Resources/tray@2x.png"
done
