#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p bin
clang -O2 -framework IOKit -framework CoreFoundation -o bin/hidseize native/hidseize.c
echo "built bin/hidseize"
