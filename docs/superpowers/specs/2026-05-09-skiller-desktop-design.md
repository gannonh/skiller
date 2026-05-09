# Skiller Desktop Design

## Summary

Skiller is a cross-platform desktop app for managing local agent skills. It keeps master skill copies in a user-selected library, defaults to `~/skiller`, watches agent skill directories, imports discovered skills automatically, and enables skills through symlinks.

The app also acts as a desktop browser for skills.sh. Users can search, inspect, install, validate, update, and enable skills from one place.

## Stack

Skiller uses Electron, Node, Vite React, and shadcn/ui.

The project is a monorepo:

- `packages/core`: skill library, scan/import, validation, source tracking, update checks, symlink enablement, and skills.sh API access
- `packages/cli`: `skiller` CLI backed by `packages/core`
- `apps/desktop`: Electron main process, tray, background watcher, IPC, and Vite React renderer

The UI project is initialized with:

```sh
pnpm dlx shadcn@latest init --preset b43eDchzk --base base --template vite --monorepo --pointer
```

## Local Library

The default master library path is `~/skiller`. Setup lets the user choose another path, and settings can change the path later.

Skiller stores each managed skill in the master library with metadata for source, validation, update state, target enablement, and local changes.

## Target Directories

Skiller scans these default target directories:

- `~/.agents/skills`
- `~/.claude/skills`
- `~/.codex/skills`
- `~/.cursor/skills`
- `~/.pi/agent/skills`
- `~/.gemini/skills`
- `~/.copilot/skills`

Users can add custom target directories.

The Electron main process watches target directories continuously while the tray helper is running. On launch and on filesystem changes, Skiller scans targets and imports any real skill folders it finds.

After import, Skiller replaces the discovered target folder with a symlink to the master copy. If a target entry already points to the master copy, Skiller records it as enabled.

V1 uses symlinks as the only enablement method.

## Discovery And Install

Skiller uses the skills.sh API as the primary catalog and install source.

V1 discovery includes:

- leaderboard views
- trending and hot views
- curated and official sections
- search
- skill detail pages
- file preview
- audit status when available
- install into the master library

V1 does not include publishing.

## Updates

Skiller checks for updates on a configurable schedule, default daily. Users can also run a manual check for updates.

Skills are updated only when the user explicitly updates them or enables automatic updates.

Update controls:

- each skill has a "keep updated" toggle
- settings include a global "keep all skills updated" toggle
- the global toggle applies across installed skills

Skiller stores source metadata when it can identify the source:

- skills.sh id
- GitHub repo URL
- commit or ref
- install timestamp
- last checked timestamp
- content hash

Imported local-only skills are marked with an unknown source until the user links a source.

## Validation

Skiller includes a built-in validator based on the official Agent Skills specification at `agentskills.io/specification`.

V1 validation checks:

- skill is a directory
- `SKILL.md` exists at the root
- frontmatter parses
- `name` is present
- `description` is present
- optional `scripts/`, `references/`, and `assets/` paths stay inside the skill directory
- known metadata fields parse cleanly
- unknown metadata fields are preserved

Validation is advisory. Invalid skills can be imported, installed, enabled, and updated. The UI shows a yellow warning status with validation details. The CLI returns validation details in human-readable and JSON formats.

## Desktop UI

The desktop app uses a work-focused shadcn/ui layout.

Primary navigation:

- Library
- Discover
- Targets
- Updates
- Settings

Library shows installed skills, source, enabled targets, validation status, update status, and local changes.

Discover shows skills.sh leaderboard, trending, hot, curated/official, and search views.

Skill detail shows description, source, files, audit status, install, update, and enable actions.

Targets shows default and custom directories, watch status, and enabled skill counts.

Updates shows available updates, per-skill keep-updated toggles, and manual update actions.

Settings shows master library path, scan schedule, global keep-updated toggle, startup behavior, and tray behavior.

## Tray

The tray helper runs continuously when enabled. It handles background scanning, filesystem watching, scheduled update checks, and quick actions.

Tray actions:

- Open Skiller
- Refresh scan
- Check updates
- Show warning and update counts
- Quit

## CLI

The `skiller` CLI uses the same core package as the desktop app.

V1 commands:

- `skiller validate <path>`
- `skiller list`
- `skiller scan`
- `skiller install <source>`
- `skiller update [skill]`
- `skiller enable <skill> --target <target>`
- `skiller disable <skill> --target <target>`

Commands that expose structured state support JSON output.

## Safety

Filesystem operations are staged and recoverable.

Scan, import, update, and enable jobs write structured events to a local activity log. Failed jobs show actionable errors in the UI and can be retried.

For automatic import and symlink replacement, Skiller preserves the original discovered folder until the master copy is verified. After verification, it replaces the target folder with a symlink. If replacement fails, the master copy remains and the target folder remains unchanged.

For updates, Skiller writes the new version to a staging area, validates it, then promotes it to the master library. If promotion fails, the prior master copy remains active.

## Testing

V1 test coverage focuses on core behavior:

- validator fixtures for valid and invalid skills
- scan/import fixtures for each default target path shape
- symlink enablement and replacement behavior
- source metadata parsing and persistence
- skills.sh API client with mocked responses
- update staging and promotion behavior
- CLI JSON output for validate, list, scan, install, and update
- Electron smoke test for app launch, tray availability where supported, and renderer IPC commands

## References

- skills.sh API: https://skills.sh/docs/api
- Vercel skills CLI: https://github.com/vercel-labs/skills
- GitHub `gh skill install`: https://cli.github.com/manual/gh_skill_install
- Agent Skills specification: https://agentskills.io/specification
