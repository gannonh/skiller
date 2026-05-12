## Agent Skills

## Commands

```bash
pnpm install
pnpm dev                 # Build core/desktop and launch Electron with Vite renderer
pnpm dev:renderer        # Start renderer-only Vite preview on 127.0.0.1:5173
pnpm cli -- --help       # Run the CLI from source
pnpm check               # typecheck, coverage, e2e, build
pnpm test:e2e            # Playwright renderer tests from ./e2e
```

## Architecture

- `packages/core`: filesystem, config, manifest validation, scanning, installs, sync, update, and skills.sh client logic.
- `packages/cli`: Commander CLI backed by `@skiller/core`.
- `apps/desktop`: Electron app. Main-process code lives in `src/main`, the preload bridge in `src/preload.cts`, and React renderer pages in `src/renderer`.
- `packages/ui`: shared shadcn/ui primitives imported as `@workspace/ui/components/...`.

## Git

- Do not use `git push --no-verify`. Fix local hook failures before pushing.

## Testing

- `.husky/pre-push` runs `pnpm check`; fix hook failures before pushing.
- Playwright tests use `playwright.config.ts`, start `pnpm --filter @skiller/desktop dev:renderer -- --port 5173`, and exercise the renderer preview API.

### agent-browser

- Use agent-browser to test electron app functionality, identify any issues or bugs and provide UAT evidence.
- Load the electron skill whenever using: `agent-browser skills get electron`

## shadcn/ui

- Treat `apps/desktop` as the shadcn app workspace and `packages/ui` as the shared UI package.
- Run shadcn commands from repo root with `-c apps/desktop`.
- Shared primitives live in `packages/ui/src/components` and import as `@workspace/ui/components/...`.
- Keep `apps/desktop/components.json` and `packages/ui/components.json` aligned on `style`, `baseColor`, and `iconLibrary`.
- Use `apply`, not `init`, when switching presets in this existing app:

```bash
pnpm dlx shadcn@latest add button -c apps/desktop
pnpm dlx shadcn@latest apply <preset> -c apps/desktop --yes
```
