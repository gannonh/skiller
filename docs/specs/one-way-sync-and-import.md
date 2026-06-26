---
type: Plan
title: One-Way Target Sync and Opt-In Import
description: Make library->target sync strictly one-way by default and add an opt-in Settings import flow for adopting unmanaged skills from global targets.
tags: [core, scanner, desktop, settings, import]
timestamp: 2026-06-25T00:00:00Z
---

# One-Way Target Sync and Opt-In Import

**Status:** Implemented (2026-06-25)

Related: [Skill provenance plan](/specs/skill-provenance-and-installs.md), [Skill sets M2M](/specs/library-skill-sets-many-to-many.md)

## Problem

`scanTargets` adopted any unmanaged `SKILL.md` directory it found in a target back
into the library on every scan. Because the desktop app also distributes library
skills out to targets (copy mode leaves real folders), a removed skill that still
had copies in targets was re-adopted on the next scan, then re-distributed, then
re-adopted with a `-2`, `-3`, ... suffix. Across several enabled targets this
produced a runaway feedback loop of duplicate skills.

## Change

### Core (`@skiller/core`)

- `scanTargets` is now strictly one-way (library -> targets) by default. The
  adoption of UNKNOWN target folders into the library is gated behind a new
  opt-in `import?: boolean` flag on `ScanTargetsInput`. Re-installing
  already-known skills found as plain folders (converting them to the configured
  install form) remains part of the one-way sync and always runs. `importOnly`
  only takes effect alongside `import`.
- `discoverImportableSkills({ libraryPath, targets })` lists unmanaged skill
  folders in the given (global) targets without writing anything. A folder is
  importable when it is a real directory containing `SKILL.md` (not a symlink)
  whose declared id is not already tracked. Each skill id is offered once.
- `importSkillsFromTargets({ libraryPath, sourcePaths, globalTargetInstallMode })`
  adopts the selected folders into the library and records metadata, rolling back
  the partial copy if validation/save fails. Distribution to targets happens via
  the next normal one-way scan.

### Desktop

- IPC: `import:discover` and `import:apply` handlers; preload exposes
  `discoverImportableSkills` and `importSkills`.
- Background/startup/watcher scans never pass `import`, so they cannot re-adopt
  target folders. The feedback loop is structurally impossible.
- Settings gains an **Import** section: it scans global targets on mount and via a
  **Scan** button, lists unmanaged skills (flagging invalid ones), and supports
  import-all, import-selected, and per-skill import.

## Notes

- Project (skill-set) targets are not surfaced in the import list; only global
  targets (`config.targets`) are scanned for importable skills.
- Symlinked entries are Skiller-managed installs and are never offered for import.
