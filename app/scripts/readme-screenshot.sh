#!/bin/sh
# Regenerate docs/screenshots/main.png from a throwaway demo config.
# Run this from a GUI Terminal (the screenshot harness needs the app's window).
set -eu
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM
node scripts/readme-demo.js "$TMP/config.json"
ULANZI_NO_DECK=1 \
ULANZI_CONFIG_DIR="$TMP" \
ULANZI_SIZE=1600x900 \
ULANZI_SHOT="$PWD/../docs/screenshots/main.png" \
ULANZI_SHOT_DELAY=1800 \
ULANZI_EVAL="document.querySelectorAll('#grid .key')[9]?.click(); 'ok'" \
  npm start
echo "wrote docs/screenshots/main.png"
