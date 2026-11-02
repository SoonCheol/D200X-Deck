---
name: Ulanzi Deck Open release
description: Cut a release of Ulanzi Deck Open — preflight checks, version bump, CHANGELOG, tag, CI and unsigned-DMG monitoring, release-asset verification, and local install. Use this whenever the user asks to release, publish, tag, bump a version, cut a DMG, install the app, or check a stalled "Unsigned DMG" run for this repository, even if they only say "ship it" or "new release".
---

# Ulanzi Deck Open release

This repository ships a macOS Electron app. Releases are unsigned DMGs built by
GitHub Actions from a tag. CI runs on `main`; the **Unsigned DMG** workflow runs
on `v*` tags, publishes the DMG + `SHA256SUMS.txt`, and builds the release notes
from the matching `CHANGELOG.md` section.

Work from the repository root. Never commit secrets.

## Stop conditions

Pause and ask before continuing if:

- the working tree has changes that are not part of this release;
- tests, lint or typecheck fail;
- the tag already exists or the release is already published;
- the installed app does not report the released version.

Never move, delete or force-push a published tag.

## 1. Preflight

```sh
git status --short
git fetch --tags
git describe --tags --abbrev=0
git log --oneline "$(git describe --tags --abbrev=0)"..HEAD
```

The tree must be clean **before** the release commit. A tag only contains
committed code: if a change is still in the working tree, commit it first (run
the checks again) or the release will silently miss it.

Run the full gate:

```sh
cd app
npm test
npm run lint
npm run typecheck
```

Do not run `npm install`; the lockfile is current.

Choose the version:

- **patch** for fixes, polish and small editor improvements;
- **minor** for a new milestone or a substantial new capability;
- **major** only when the user explicitly asks.

Do not reuse an existing tag.

## 2. Version, changelog and roadmap

1. Update `app/package.json`.
2. Update **both** `version` occurrences in `app/package-lock.json` (the root
   package and the package entry).
3. Add a section at the top of `CHANGELOG.md`:

   ```markdown
   ## X.Y.Z — YYYY-MM-DD

   ### Changed
   - ...

   ### Fixed
   - ...

   ### Tests
   - <old> → **<new>**
   ```

   The header must be exactly `## X.Y.Z` followed by whitespace. The release
   workflow extracts the notes with an `awk` match on that header; a different
   format produces an empty release body.
4. Add a short `### Shipped in X.Y.Z` section to `docs/ROADMAP.md`.
5. Inspect the diff. Only the release files should be present:

   ```sh
   git diff --stat
   git status --short
   ```

   If code changes appear here, commit them separately first. This is the
   failure that shipped an incomplete 0.10.3 tag.
6. Commit:

   ```sh
   git add CHANGELOG.md docs/ROADMAP.md app/package.json app/package-lock.json
   git commit -m "Release X.Y.Z"
   ```

## 3. Publish

```sh
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

The tag name is `vX.Y.Z`; the workflow strips the leading `v` to match the
changelog section. Push `main` and the tag separately so CI and the DMG run can
be identified.

If the tag exists but the release does not, first verify the tag points at the
release commit:

```sh
git rev-parse vX.Y.Z^{commit}
git log --oneline -1
```

If it does, rerun the failed workflow. Do not retag.

## 4. Watch CI and the unsigned DMG

```sh
gh run list --workflow CI --limit 1
gh run watch <ci-run-id> --exit-status

gh run list --workflow "Unsigned DMG" --limit 1
gh run watch <dmg-run-id> --exit-status
```

CI must pass.

### Runner capacity

The macOS arm64 hosted runners are capacity-constrained. A run that ends after
about 15 minutes with:

```text
The job was not acquired by Runner of type hosted even after multiple attempts
```

is an infrastructure failure, not a code failure. Rerun it:

```sh
gh run rerun <dmg-run-id> --failed
```

Repeat until a runner is acquired. This can take several attempts and several
15-minute queues; the 0.10.5 release needed multiple retries. Do not retag and
do not "fix" the code for this error.

`gh run watch` can time out while the job is still queued. Check
`gh run list --workflow "Unsigned DMG" --limit 1` and
`gh run view <run-id>` before assuming failure.

If the build fails for a real error, read the failed log, fix it on `main`, and
cut the next patch. Do not rewrite the published tag:

```sh
gh run view <run-id> --log-failed
```

## 5. Verify the release assets

```sh
gh release view vX.Y.Z --json assets --jq '[.assets[]|{name,size}]'
```

The release must contain:

- `Ulanzi-Deck-Open-X.Y.Z.dmg`
- `SHA256SUMS.txt`

Also check that the release body contains the changelog section. The workflow
already appends the unsigned-build/quarantine note.

## 6. Install and verify locally

```sh
cd app
npm run install-app
defaults read ~/Applications/Ulanzi\ Deck\ Open.app/Contents/Info.plist CFBundleShortVersionString
pgrep -f "Ulanzi Deck Open.app/Contents/MacOS"
```

`install-app` packages from the current source (arm64 on Apple Silicon,
universal on Intel), stops the running app, copies to `~/Applications`,
registers the bundle with LaunchServices/Spotlight and launches it.

The installed version must equal `X.Y.Z` and the process must be running. The
build is unsigned; first launch may be quarantined. Do not change the user's
real config just to verify the release.

## 7. Report

Give the user:

- release URL: `https://github.com/edufalcao/ulanzi-deck-open/releases/tag/vX.Y.Z`;
- version, test count, CI/DMG result and verified assets;
- installed version and running state;
- any runner retries or other infrastructure delays.

## Reference files

- `.github/workflows/ci.yml` — tests, lint and typecheck.
- `.github/workflows/release.yml` — unsigned DMG build and release publishing.
- `app/scripts/install.sh` — package, stop, install, register and launch.
- `app/package.json` / `app/package-lock.json` — version fields.
- `CHANGELOG.md` — release notes source.
- `docs/ROADMAP.md` — shipped-summary section.

## Known traps

- A release tag cannot include uncommitted code. Commit and test before the
  release commit.
- `app/package-lock.json` has two version fields; update both.
- The `CHANGELOG.md` header is parsed by `awk`; keep `## X.Y.Z — date`.
- The DMG workflow's "not acquired by Runner" message is runner capacity. Rerun
  it; do not retag or change code for it.
- `gh run watch` can time out while queued. Check the run list/status.
- The app is unsigned and not notarized; installation and first launch can
  involve quarantine prompts.
- The release does not use `dist/` from a previous local build; `install-app`
  repackages the current source.
