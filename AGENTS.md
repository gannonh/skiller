## Agent Skills

## Open Knowledge Format docs

This repository maintains an [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) bundle at `./docs`.

- Use `/okf read` when available, or read `./docs/index.md` directly before substantial work, to understand the current documentation map.
- Follow cross-links into relevant specs, ADRs, runbooks, guides, architecture notes, reference docs, and domain docs before changing related code.
- Keep `./docs/specs/index.md` current as the roadmap for active, planned, blocked, and completed work.
- Add or update ADRs in `./docs/adrs` for durable architecture decisions.
- After substantial work, PRs, behavior changes, architecture decisions, migrations, or documentation moves, update the OKF bundle and add concise entries to the relevant `log.md` files.
- Maintain Markdown cross-links between related OKF concepts so future agents can traverse decisions, specs, architecture, runbooks, guides, and references.
- Every non-reserved Markdown file under `./docs` should have OKF frontmatter with at least a non-empty `type` field. `index.md` and `log.md` are reserved navigation/history files.

## Commands

```bash
pnpm install
pnpm dev                 # Build core/desktop and launch Electron with Vite renderer
pnpm dev:renderer        # Start renderer-only Vite preview on 127.0.0.1:5173
pnpm cli -- --help       # Run the CLI from source
pnpm check               # typecheck, coverage, release scripts, e2e, build
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

- `.husky/pre-push` runs `pnpm check:pre-push` (typecheck, coverage, release scripts, build; no e2e). CI still runs e2e. Fix hook failures before pushing.
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
