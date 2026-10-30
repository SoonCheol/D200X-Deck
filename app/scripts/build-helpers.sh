#!/bin/sh
# Build the native helpers as universal binaries (arm64 + x86_64).
set -eu
cd "$(dirname "$0")/.."
mkdir -p bin build/helpers

build() {
  name="$1"; src="$2"; shift 2
  for arch in arm64 x86_64; do
    clang -O2 -arch "$arch" "$@" -o "build/helpers/${name}-${arch}" "$src"
  done
  lipo -create "build/helpers/${name}-arm64" "build/helpers/${name}-x86_64" -output "bin/${name}"
  lipo -info "bin/${name}"
}

build hidseize native/hidseize.c -framework IOKit -framework CoreFoundation
build mediakey native/mediakey.m -framework Cocoa
echo "built universal bin/hidseize bin/mediakey"
