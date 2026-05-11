## Agent Skills

## Git

- Do not use `git push --no-verify`. Fix local hook failures before pushing.

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
