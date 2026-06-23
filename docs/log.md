# OKF Bundle Log

## 2026-06-23

- Fixed watcher-scanner feedback loop in target directory sync: watcher-triggered scans are now import-only, suppressed during scan execution with a 500ms grace period, and scanner backup artifacts are filtered by the watcher. Updated [monorepo architecture](/architecture/monorepo.md) and release workflow docs.
- Fixed `.github/workflows/release.yml` stable dispatch version stripping to handle capital `V` prefix.
- Finalize job sets `HUSKY=0` and pre-push hook skips when `CI=true` to avoid Electron smoke test failures on ubuntu CI.

## 2026-06-22

- Added release asset renaming and platform-organized GitHub Release download tables.
- Removed Windows references from desktop platform and auto-update docs after dropping Windows from the release pipeline.
- Added CI parity for `pnpm test:release-scripts` and refreshed release docs for `.github/workflows/release.yml`.
- Initialized the OKF bundle from existing `docs/superpowers` specs and plans.
- Migrated eleven concept documents into [specs/](/specs/index.md).
- Added [monorepo architecture](/architecture/monorepo.md) and [desktop release guide](/guides/desktop-release.md).
- Seeded [adrs/](/adrs/index.md) for future architecture decisions.
- Updated [AGENTS.md](https://github.com/gannonh/skiller/blob/main/AGENTS.md) with OKF maintenance instructions.
