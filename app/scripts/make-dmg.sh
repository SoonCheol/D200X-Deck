#!/bin/sh
# Build a DMG for the packaged app (unsigned unless signing is configured).
set -eu
cd "$(dirname "$0")/.."
APP="dist/Ulanzi Deck Open-darwin-arm64/Ulanzi Deck Open.app"
[ -d "$APP" ] || { echo "run npm run package first"; exit 1; }
VERSION=$(node -p "require('./package.json').version")
OUT="dist/Ulanzi Deck Open ${VERSION}.dmg"
STAGE=$(mktemp -d)
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
rm -f "$OUT"
hdiutil create -volname "Ulanzi Deck Open" -srcfolder "$STAGE" -ov -format UDZO "$OUT" >/dev/null
rm -rf "$STAGE"
echo "built $OUT"
