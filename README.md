# Skiller

Skiller is a desktop app and CLI for managing local agent skills.

It keeps a master skill library, syncs enabled skills into configured agent target directories, validates skill structure, and provides discovery through the skills.sh API.

## Status

Skiller is in early development.

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
