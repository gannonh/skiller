# Skiller

Skiller is a desktop app and CLI for managing local agent skills.

It keeps a master skill library, syncs enabled skills into configured agent target directories, validates skill structure, and provides discovery through the skills.sh API.

## Status

Skiller is in early development.

## Install

Download Skiller Desktop from the latest GitHub Release:

- macOS Apple silicon: `Skiller-Desktop-arm64.dmg`
- macOS Intel: `Skiller-Desktop-x64.dmg`
- Linux x64: `Skiller-Desktop-x86_64.AppImage` or `Skiller-Desktop-amd64.deb`
- Linux arm64: `Skiller-Desktop-arm64.AppImage` or `Skiller-Desktop-arm64.deb`

The first desktop release is `desktop-v0.1.0`.

## Usage

Use the Library view to install skills from a local folder, GitHub URL, or the skills.sh registry. Use Targets to choose agent skill directories, then sync enabled skills into those targets. Use Updates to check for newer versions of skills installed from GitHub or skills.sh.

## Workspace

This repo is a pnpm monorepo:

- `packages/core`: filesystem, manifest, validation, scanning, sync, update, and skills.sh client logic
- `packages/cli`: command-line interface backed by `packages/core`
- `apps/desktop`: Electron app with a Vite React renderer
- `packages/ui`: shared shadcn/ui workspace components

## Development

Install dependencies:

```sh
pnpm install
```

Run the desktop app:

```sh
pnpm dev
```

Run the CLI:

```sh
pnpm cli -- --help
```

Run checks:

```sh
pnpm check
```

## License

MIT
