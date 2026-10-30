# Building a release

## Package

```bash
cd app
npm run package        # arm64 app in app/dist
npm run package:all    # universal app (helpers are built universal too)
npm run make:dmg       # DMG from the packaged app
```

The native helpers (`bin/hidseize`, `bin/mediakey`) are built by
`scripts/build-helpers.sh` for **arm64 and x86_64** and lipo'd into universal binaries,
so `package:all` is genuinely universal.

## Signing and notarization (TODO once a Developer ID exists)

The app is currently ad-hoc signed, which is fine for local use but means downloaded
builds are quarantined and TCC prompts can reset between builds.

1. Join the Apple Developer Program and create a **Developer ID Application**
   certificate in the account.
2. Add these to `app/package.json` packaging (electron-packager/`osx-sign`):
   - `--osx-sign.identity="Developer ID Application: …"`
   - hardened runtime + `entitlements.plist`
3. Required `Info.plist` usage strings:
   - `NSAppleEventsUsageDescription` — sending hotkeys and typing text
   - `NSInputMonitoringUsageDescription` — seizing the deck's keyboard interface
4. Notarize and staple:

```bash
xcrun notarytool submit "dist/Ulanzi Deck Open.dmg" \
  --apple-id "$APPLE_ID" --team-id "$TEAM_ID" --password "$APP_PASSWORD" --wait
xcrun stapler staple "dist/Ulanzi Deck Open.dmg"
```

5. Verify with `spctl -a -vv` and by installing on a clean macOS account.

## Versioning

`app/package.json` is the single version source (the packager reads it). Add an entry
to `CHANGELOG.md` for every release and tag the commit (`v0.1.0`).
