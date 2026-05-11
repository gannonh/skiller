# Desktop Release

Skiller Desktop uses `electron-builder` and GitHub Actions to create signed, notarized macOS releases and Linux packages.

## Expected Secrets

- `CSC_LINK`: base64 encoded `.p12` certificate with the Developer ID Application certificate and private key.
- `CSC_KEY_PASSWORD`: password used when exporting the `.p12`.
- `APPLE_ID`: Apple ID email for notarization.
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password for `notarytool`.
- `APPLE_TEAM_ID`: Apple developer team id.

## Creating CSC_LINK

From an existing `.p12`:

```bash
base64 -i signing-cert.p12 -o signing-cert.p12.base64
gh secret set CSC_LINK < signing-cert.p12.base64
```

`CSC_KEY_PASSWORD` is the password chosen when the `.p12` was exported from Keychain Access.

If using the Kata local secrets as a guide, `.secrets/signing-cert.p12.base64` is the shape needed for `CSC_LINK`. Do not print certificate or password values to terminal logs.

## Release Behavior

`.github/workflows/desktop-release.yml` runs on pushes to `main` and manual dispatch. It reads `apps/desktop/package.json`, skips if `desktop-vX.Y.Z` already exists, validates the app, builds macOS `arm64` and `x64`, builds Linux `x64` and `arm64`, notarizes macOS artifacts, then creates the GitHub Release.

Release notes must come from the changelog entry for that version. Do not write separate ad hoc release notes during tagging.

Update `README.md` in the release PR when supported platforms, install steps, setup requirements, commands, screenshots, or user-visible behavior changed.

## Local Commands

```bash
pnpm --filter @skiller/desktop run desktop:pack
pnpm --filter @skiller/desktop run desktop:dist:mac
pnpm --dir apps/desktop exec electron-builder --config electron-builder.yml --linux AppImage deb --x64
```

## Troubleshooting

- Missing `CSC_LINK` or `CSC_KEY_PASSWORD`: export a Developer ID Application certificate and private key from Keychain as `.p12`, then base64 encode it.
- Notarization failure: verify `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.
- CI skips release: the `desktop-vX.Y.Z` tag already exists.
