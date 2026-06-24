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

1. Work from a clean tree. If already on a feature branch, use that branch for the release PR. If on `main`, create a release branch named `release/desktop-vX.Y.Z` before changing files.
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
6. Update `AGENTS.md` if the release introduces agent context worth preserving, such as major architecture changes or ADR-level decisions. Do not add obvious, standard, or one-off implementation details.
7. Open the release PR using `references/release-pr-template.md`.
8. Update the user on release PR status and wait for next steps. Do not merge without prior user approval.
9. On merge to `main`, CI creates `desktop-vX.Y.Z` and publishes macOS and Linux artifacts.

## Changelog and Release Notes

- Add a release entry before tagging.
- Use the changelog entry as the GitHub Release notes content.
- Include only user-facing changes, fixes, known issues, and install notes.
- Keep internal implementation details out unless users need them.
- Update `README.md` when the release changes installation, setup, commands, supported platforms, or visible behavior.

Read `references/desktop-release.md` before changing release CI or troubleshooting signing. Use `references/release-pr-template.md` when opening release PRs.
