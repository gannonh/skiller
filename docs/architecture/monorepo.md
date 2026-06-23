---
type: Architecture Note
title: Monorepo Layout
description: Package boundaries and responsibility split across core, CLI, desktop, and shared UI.
tags: [architecture, monorepo, electron]
timestamp: 2026-06-22T00:00:00Z
---

# Monorepo Layout

Related: [Skiller Desktop design](/specs/skiller-desktop-design.md), [Specs roadmap](/specs/index.md)

Skiller is a pnpm workspace with shared TypeScript settings and strict checks at the root.

## Packages

### `packages/core`

Owns filesystem state, config, manifest validation, scanning, installs, sync, update checks, and the skills.sh client. CLI and desktop both call into core; renderer code does not import core directly.

Key modules include `metadata-store`, `installer`, `scanner`, `updater`, `validator`, and `skills-sh-client`.

### `packages/cli`

Commander-based `skiller` CLI backed by `@skiller/core`. Used for headless library operations and scripting.

### `apps/desktop`

Electron app with three layers:

- `src/main` — main process, IPC handlers, tray, background watcher, app update service
- `src/preload.cts` — typed `contextBridge` API exposed to the renderer
- `src/renderer` — Vite React UI (Library, Discover, Targets, Updates, Settings)

### `packages/ui`

Shared shadcn/ui primitives imported as `@workspace/ui/components/...`. Desktop is the shadcn workspace; keep `apps/desktop/components.json` and `packages/ui/components.json` aligned.

## Data flow

1. User actions in the renderer call preload bridge methods.
2. Main-process IPC handlers invoke `@skiller/core` APIs.
3. Core reads and writes the master library (`skiller.manifest.json`, skill folders, symlinks to targets).
4. State changes propagate back to the renderer through IPC responses or subscriptions.

## Testing

- Unit tests: Vitest in `packages/core` and `apps/desktop`
- Renderer e2e: Playwright against `pnpm dev:renderer` preview API
- Pre-push hook runs `pnpm check:pre-push` (typecheck, coverage, release scripts, build). CI runs the same steps plus e2e. The hook skips when `CI=true` (e.g., the release finalize job pushes from an ubuntu runner where Electron can't install).
