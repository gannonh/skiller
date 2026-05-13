# Changelog

## Skiller Desktop v0.2.2 - 2026-05-13

### Added

- Packaged desktop app updates now download in the background.
- An Update button appears beside the Skiller heading when a downloaded app update is ready, then restarts into the new version when clicked.
- Add from GitHub now accepts `owner/repo` and `@owner/repo` shorthand.

### Fixed

- Desktop releases now publish update metadata for macOS and Linux AppImage builds.

### Install Notes

- Install this release manually. Future packaged app releases can appear through the in-app Update button after they download.
- macOS Apple silicon: download `Skiller-Desktop-arm64.dmg`.
- macOS Intel: download `Skiller-Desktop-x64.dmg`.
- Linux x64: download `Skiller-Desktop-x86_64.AppImage` or `Skiller-Desktop-amd64.deb`.
- Linux arm64: download `Skiller-Desktop-arm64.AppImage` or `Skiller-Desktop-arm64.deb`.

## Skiller Desktop v0.2.1 - 2026-05-12

### Fixed

- Packaged macOS app update checks can find GitHub CLI tokens from common Homebrew `gh` paths.
- Update check failures now show the returned error messages in the Updates view.
- GitHub rate-limit messages now include guidance for `gh`, `GITHUB_TOKEN`, and `SKILLER_GH_PATH`.

### Install Notes

- macOS Apple silicon: download `Skiller-Desktop-arm64.dmg`.
- macOS Intel: download `Skiller-Desktop-x64.dmg`.
- Linux x64: download `Skiller-Desktop-x86_64.AppImage` or `Skiller-Desktop-amd64.deb`.
- Linux arm64: download `Skiller-Desktop-arm64.AppImage` or `Skiller-Desktop-arm64.deb`.

## Skiller Desktop v0.2.0 - 2026-05-12

### Added

- Library organization controls for assigning skills to sets and tags.
- Library sorting and filtering for skill sets and tags.
- Inline tag editing from the Library view.

### Fixed

- Clearer errors when library set toggles cannot scan the selected target.
- More reliable focus behavior while editing tags inline.

### Install Notes

- macOS Apple silicon: download `Skiller-Desktop-arm64.dmg`.
- macOS Intel: download `Skiller-Desktop-x64.dmg`.
- Linux x64: download `Skiller-Desktop-x86_64.AppImage` or `Skiller-Desktop-amd64.deb`.
- Linux arm64: download `Skiller-Desktop-arm64.AppImage` or `Skiller-Desktop-arm64.deb`.

## Skiller Desktop v0.1.0 - 2026-05-11

### Added

- Desktop app for managing a master agent skill library.
- Local folder, GitHub, and skills.sh skill installs.
- skills.sh discovery with search, leaderboard views, and install actions.
- Target directory management for syncing enabled skills into agent skill folders.
- Skill update checks and updates for GitHub and skills.sh installs.
- macOS and Linux release artifacts published from GitHub Releases.

### Install Notes

- macOS Apple silicon: download `Skiller-Desktop-arm64.dmg`.
- macOS Intel: download `Skiller-Desktop-x64.dmg`.
- Linux x64: download `Skiller-Desktop-x86_64.AppImage` or `Skiller-Desktop-amd64.deb`.
- Linux arm64: download `Skiller-Desktop-arm64.AppImage` or `Skiller-Desktop-arm64.deb`.
