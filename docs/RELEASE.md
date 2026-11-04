# Building and distributing the app

The app ships unsigned. That is intentional: building from source requires no Apple
Developer account, certificate, or notarization. This document covers both the local
source build and what to expect when a build is shared with someone else.

See [`../README.md`](../README.md#build-from-source-unsigned) for the short version.

## Prerequisites

* macOS 13 or newer.
* Node.js 22.13 or newer.
* Xcode Command Line Tools: `xcode-select --install`.
* No Apple account, signing identity, or notarization credentials.

## From a fresh clone

```bash
git clone https://github.com/edufalcao/ulanzi-deck-open.git
cd ulanzi-deck-open/app
npm install
npm test
npm start
```

`npm start` builds the native helpers (`bin/hidseize`, `bin/hotkey`, `bin/mediakey`)
from `native/` first, so they are not committed to the repository. `npm run
build:native` rebuilds them on demand; the packaging scripts rebuild them
automatically for both architectures.

## Package an app

```bash
cd app
npm run package        # arm64 only
npm run package:all    # universal (arm64 + x86_64)
```

Output:

```
app/dist/Ulanzi Deck Open-darwin-arm64/Ulanzi Deck Open.app
app/dist/Ulanzi Deck Open-darwin-universal/Ulanzi Deck Open.app
```

`npm run package` runs `scripts/build-helpers.sh` first and
`scripts/after-package.sh` afterwards. Those scripts build the helpers for arm64 and
x86_64, lipo them into universal binaries, and copy the helpers, tray images and icon
into the bundle. The same pre/post hooks exist for `package:all`.

To put the app in `~/Applications` and register it with Spotlight/Launchpad:

```bash
npm run install-app
```

On Apple Silicon this packages arm64; on Intel it packages the universal bundle. It
replaces an existing copy in `~/Applications` and relaunches the app.

## Automated unsigned DMG (GitHub Actions)

`.github/workflows/release.yml` builds and publishes the unsigned DMG. It runs:

* on every `v*` tag (creates/updates the GitHub Release);
* manually via **Actions → Unsigned DMG → Run workflow** (artifact only).

It checks out the repo on a macOS runner, runs `npm ci` and `npm test`, builds the
universal app, runs `npm run make:dmg`, writes `SHA256SUMS.txt`, uploads the DMG as a
workflow artifact, and (for tags) attaches it to the release. Release notes are taken
from the matching `CHANGELOG.md` section, followed by a Gatekeeper warning.

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release job uses the repository's `GITHUB_TOKEN` with `contents: write`; no other
secrets are required. The resulting DMG is unsigned and not notarized — see the
quarantine instructions below.

## Build a DMG (optional)

```bash
npm run make:dmg
```

The script picks the universal bundle if it exists, otherwise arm64 or x64, and writes
`dist/Ulanzi-Deck-Open-<version>.dmg` with an `Applications` shortcut. The DMG is
unsigned.

## Sharing an unsigned build

A locally built app is not quarantined. A build downloaded from GitHub (Releases, a
DMG, or a ZIP) is quarantined by macOS and will be blocked on first launch. The
recipient can either:

* right-click the app in Finder → **Open** → **Open**, or
* run `xattr -dr com.apple.quarantine "/Applications/Ulanzi Deck Open.app"`.

Document this next to any download link. Do not describe the build as notarized.

The app also needs **Accessibility** (hotkeys/text) and **Input Monitoring** (the
`hidseize` helper) permissions; macOS will prompt on first use. Media keys use the
native `mediakey` helper. If a media key does nothing, grant Accessibility and relaunch.
Keep the app at a stable path (e.g. `/Applications`) so TCC remembers the grant.

## Signing and notarization (future)

If a Developer ID is added later:

1. Join the Apple Developer Program and create a **Developer ID Application**
   certificate.
2. Add signing to packaging (electron-packager/`osx-sign`):
   * `--osx-sign.identity="Developer ID Application: …"`
   * hardened runtime + an entitlements plist
3. Required `Info.plist` usage strings:
   * `NSAppleEventsUsageDescription` — hotkeys and typing text
   * `NSInputMonitoringUsageDescription` — seizing the deck's keyboard interface
4. Notarize and staple:

```bash
xcrun notarytool submit "dist/Ulanzi-Deck-Open.dmg" \
  --apple-id "$APPLE_ID" --team-id "$TEAM_ID" --password "$APP_PASSWORD" --wait
xcrun stapler staple "dist/Ulanzi-Deck-Open.dmg"
```

5. Verify with `spctl -a -vv` and install on a clean macOS account.

Automatic updates also require signing, so they are out of scope while builds are
unsigned.

## Versioning

`app/package.json` is the single version source (the packager reads it). Add an entry to
[`../CHANGELOG.md`](../CHANGELOG.md) for every release and tag the commit (`v0.1.0`).
