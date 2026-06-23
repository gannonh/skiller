# Guides Log

## 2026-06-23

- Updated [desktop release guide](/guides/desktop-release.md): finalize job sets `HUSKY=0` to skip pre-push hook in CI (Electron smoke tests can't run on ubuntu).
- Fixed `.github/workflows/release.yml` stable dispatch version stripping to handle capital `V` prefix.

## 2026-06-22

- Added release asset renaming and platform download tables for GitHub Releases via `scripts/release/prepare-github-release.ts`.
- Removed Windows references from release and desktop platform docs after dropping Windows from the release pipeline.
- Updated [desktop release guide](/guides/desktop-release.md) for `.github/workflows/release.yml`, nightly tags, and `pnpm test:release-scripts` coverage.
- Added [desktop release guide](/guides/desktop-release.md) from the releasing-skiller agent skill reference.
