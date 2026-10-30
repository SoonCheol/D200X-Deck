#!/bin/sh
# Build, install and register Ulanzi Deck Open in ~/Applications.
#
# Registering the bundle with LaunchServices and Spotlight matters: a copy that
# was never scanned does not show up in Spotlight's Applications or Launchpad.
set -e
cd "$(dirname "$0")/.."

APP_NAME="Ulanzi Deck Open"
DEST="$HOME/Applications/$APP_NAME.app"
BUILT="dist/$APP_NAME-darwin-arm64/$APP_NAME.app"

echo "==> packaging"
npm run package

echo "==> stopping running instance"
pkill -f "$DEST/Contents/MacOS" 2>/dev/null || true
sleep 1

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
