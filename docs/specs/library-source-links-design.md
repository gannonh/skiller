---
type: Spec
title: Library Source Links Design
description: Clickable GitHub-backed Source column URLs that open SKILL.md in the default browser.
tags: [library, desktop, github]
timestamp: 2026-05-16T00:00:00Z
---

# Library Source Links Design

Related: [Library source links plan](/specs/library-source-links.md)

## Goal

Make GitHub-backed Source column URLs in the Library clickable. Clicking the URL opens the matching GitHub page in the user's default browser.

## Scope

- Applies to installed skills with `source.type` of `github` or `skills.sh`.
- Local and unknown sources remain plain text.
- When a source has `githubPath`, the link opens that skill's `SKILL.md` file on GitHub.
- When no `githubPath` exists, the link opens the repository-root `SKILL.md` file on GitHub.

## Design

Add a renderer helper that derives an external source URL from `SkillMetadata`:

- `github` and `skills.sh` sources return a GitHub URL.
- Sources with `githubPath` return `<githubUrl>/blob/<ref>/<githubPath>/SKILL.md`.
- Sources without `githubPath` return `<githubUrl>/blob/<ref>/SKILL.md`.
- If `ref` is absent, use `HEAD`.
- Local and unknown sources return `null`.

Expose an Electron bridge method from preload to the renderer:

- `skillerApi.openExternal(url)` calls an IPC channel.
- The main process handles that channel with Electron `shell.openExternal(url)`.

Update the Library Source column:

- Keep the existing source badge.
- Render GitHub-backed source details as a link-styled button.
- Keep truncation and source sorting unchanged.
- Use accessible labels that identify the skill source being opened.

## Error handling

`openExternal` rejects through IPC if Electron cannot open the URL. The renderer does not silently substitute another action.

## Tests

Add helper tests for source URL generation, including:

- GitHub repository-root `SKILL.md`.
- GitHub source with `githubPath` and `ref`, resolving to `SKILL.md`.
- skills.sh source with `githubPath` and missing `ref`, resolving to `SKILL.md` with `HEAD`.
- Local source returning `null`.
