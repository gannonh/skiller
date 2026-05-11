---
name: releasing-skiller
description: Use when preparing, packaging, tagging, or publishing Skiller Desktop releases, including GitHub release CI, macOS code signing, notarization, release secrets, and desktop version bumps.
---

# Releasing Skiller

Use this for Skiller Desktop releases.

## Release Target

- Version source: `apps/desktop/package.json`
- Tag format: `desktop-vX.Y.Z`
- Workflow: `.github/workflows/desktop-release.yml`
- Product name: `Skiller`
- Bundle id: `com.gannonhall.skiller`

## Workflow

1. Work from `main` with a clean tree.
2. Bump `apps/desktop/package.json`.
3. Write the changelog entry for the release.
4. Update `README.md` for user-facing install, usage, or release changes.
5. Run local checks:
   - `pnpm typecheck`
   - `pnpm --filter @skiller/core test`
   - `pnpm --filter @skiller/desktop test`
   - `pnpm test:e2e`
   - `pnpm --filter @skiller/desktop run desktop:dist:mac`
   - `pnpm --dir apps/desktop exec electron-builder --config electron-builder.yml --linux AppImage deb --x64`
6. Open and merge a release PR.
7. On merge to `main`, CI creates `desktop-vX.Y.Z` and publishes macOS and Linux artifacts.

## Changelog and Release Notes

- Add a release entry before tagging.
- Use the changelog entry as the GitHub Release notes content.
- Include only user-facing changes, fixes, known issues, and install notes.
- Keep internal implementation details out unless users need them.
- Update `README.md` when the release changes installation, setup, commands, supported platforms, or visible behavior.

Read `references/desktop-release.md` before changing release CI or troubleshooting signing.
