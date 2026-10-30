#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p bin
clang -O2 -framework IOKit -framework CoreFoundation -o bin/hidseize native/hidseize.c
clang -O2 -framework Cocoa -o bin/mediakey native/mediakey.m
echo "built bin/hidseize bin/mediakey"
