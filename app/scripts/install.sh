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
nohup "$DEST/Contents/MacOS/$APP_NAME" >/tmp/ulanziapp.log 2>&1 &

echo "done: $DEST"
