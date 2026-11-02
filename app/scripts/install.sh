#!/bin/sh
# Build, install and register Ulanzi Deck Open in ~/Applications.
#
# Registering the bundle with LaunchServices and Spotlight matters: a copy that
# was never scanned does not show up in Spotlight's Applications or Launchpad.
set -e
cd "$(dirname "$0")/.."

APP_NAME="Ulanzi Deck Open"
DEST="$HOME/Applications/$APP_NAME.app"

echo "==> packaging"
if [ "$(uname -m)" = "arm64" ]; then
  npm run package
  BUILT="dist/$APP_NAME-darwin-arm64/$APP_NAME.app"
else
  # Intel Macs need the universal bundle (the app is arm64-only otherwise).
  npm run package:all
  BUILT="dist/$APP_NAME-darwin-universal/$APP_NAME.app"
fi

echo "==> stopping running instance"
# SIGTERM triggers the app's quit confirmation (by design), so force it while
# replacing the bundle.
pkill -9 -f "$DEST/Contents/MacOS" 2>/dev/null || true
for i in 1 2 3 4 5; do
  pgrep -f "$DEST/Contents/MacOS" >/dev/null || break
  sleep 1
done

echo "==> installing to $DEST"
rm -rf "$DEST"
cp -R "$BUILT" "$DEST"

echo "==> registering with LaunchServices + Spotlight"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
"$LSREGISTER" -f "$DEST"
mdimport "$DEST"

echo "==> launching"
# Launch through LaunchServices so macOS attaches the app to the GUI session
# and creates its menu bar item. Running the executable directly from a
# terminal/agent session can leave the process alive with no menu bar icon.
if ! open "$DEST"; then
  echo "Could not launch automatically. Open it from Finder: $DEST"
fi

echo "done: $DEST"
