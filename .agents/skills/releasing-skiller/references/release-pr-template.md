# Release PR Template

Use this template when opening a Skiller Desktop release PR.

Title:

```text
chore(desktop): release X.Y.Z
```

Body:

```markdown
## Summary
- Release Skiller Desktop vX.Y.Z.
- <User-facing release highlight from CHANGELOG.md>.
- Update desktop install links and release notes for `desktop-vX.Y.Z`.

## Release Notes
<Copy the vX.Y.Z CHANGELOG.md entry here, excluding the top-level version heading.>

## Test Plan
- [ ] `pnpm typecheck`
- [ ] `pnpm --filter @skiller/core test`
- [ ] `pnpm --filter @skiller/desktop test`
- [ ] `pnpm test:e2e`
- [ ] `pnpm --filter @skiller/desktop run desktop:dist:mac`
- [ ] `pnpm --dir apps/desktop exec electron-builder --config electron-builder.yml --linux AppImage deb --x64`
- [ ] Push pre-push hook: `pnpm check`
```

After opening the PR, report the PR URL, check status, and any release-specific notes to the user. Wait for explicit approval before merging.
