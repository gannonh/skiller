---
type: Guide
title: Desktop Release
description: Sign, notarize, package, and publish Skiller Desktop through electron-builder and GitHub Actions.
tags: [release, desktop, ci]
timestamp: 2026-06-22T00:00:00Z
---

# Desktop Release

Related: [App auto update design](/specs/app-auto-update-design.md), [App auto update plan](/specs/app-auto-update.md)

Skiller Desktop uses `electron-builder` and [`.github/workflows/release.yml`](https://github.com/gannonh/skiller/blob/main/.github/workflows/release.yml) to build signed, notarized macOS artifacts and Linux packages, then publish GitHub Releases.

## Workflow triggers

`.github/workflows/release.yml` runs on:

- **Stable tag push** — push `vX.Y.Z` (for example `v0.3.3`)
- **Nightly schedule** — every 3 hours UTC when `main` changed since the last `v*-nightly.*` tag
- **Manual dispatch** — choose `stable` or `nightly`, optional `dry_run`

Stable releases use tags like `v0.3.3`. Nightly prereleases use tags like `v0.3.4-nightly.20260622.7`.

Release automation lives in `scripts/release/` and `scripts/build/release-config.ts`. `pnpm test:release-scripts` covers that logic and runs in `pnpm check` and CI.

## Expected secrets

- `CSC_LINK`: base64 encoded `.p12` certificate with the Developer ID Application certificate and private key.
- `CSC_KEY_PASSWORD`: password used when exporting the `.p12`.
- `APPLE_ID`: Apple ID email for notarization.
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password for `notarytool`.
- `APPLE_TEAM_ID`: Apple developer team id.
- `RELEASE_APP_ID` and `RELEASE_APP_PRIVATE_KEY`: GitHub App used by the stable-release finalize job to commit version bumps back to `main`.

## Creating CSC_LINK

From an existing `.p12`:

```bash
base64 -i signing-cert.p12 -o signing-cert.p12.base64
gh secret set CSC_LINK < signing-cert.p12.base64
```

`CSC_KEY_PASSWORD` is the password chosen when the `.p12` was exported from Keychain Access.

If using the Kata local secrets as a guide, `.secrets/signing-cert.p12.base64` is the shape needed for `CSC_LINK`. Do not print certificate or password values to terminal logs.

## Release behavior

The workflow resolves release metadata, validates macOS signing secrets, builds per-platform artifacts, merges macOS updater manifests with `scripts/release/merge-update-manifests.ts`, and publishes a GitHub Release. Stable releases can run a finalize job that commits the released version back to `apps/desktop/package.json` on `main`.

Release notes should come from the changelog entry for that version. Do not write separate ad hoc release notes during tagging.

Update `README.md` in the release PR when supported platforms, install steps, setup requirements, commands, screenshots, or user-visible behavior changed.

## Local commands

```bash
pnpm --filter @skiller/desktop run desktop:pack
pnpm --filter @skiller/desktop run desktop:dist:mac
pnpm --dir apps/desktop exec electron-builder --config electron-builder.yml --linux AppImage deb --x64
```

## Troubleshooting

- Missing `CSC_LINK` or `CSC_KEY_PASSWORD`: export a Developer ID Application certificate and private key from Keychain as `.p12`, then base64 encode it.
- Notarization failure: verify `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.
- Nightly skipped on schedule: no changes on `main` since the last nightly tag.
- Release script regression: run `pnpm test:release-scripts` locally before pushing.
