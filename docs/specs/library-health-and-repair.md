---
type: Plan
title: Library Health Check and Self-Repair
description: Detect and auto-repair tracked skills whose library copy is missing, empty, invalid, or drifted, and repopulate empty target slots.
tags: [core, scanner, desktop, health, repair, resilience]
timestamp: 2026-06-26T00:00:00Z
---

# Library Health Check and Self-Repair

**Status:** Implemented (2026-06-26)

Related: [One-way sync and import](/specs/one-way-sync-and-import.md), [Skill provenance plan](/specs/skill-provenance-and-installs.md)

## Problem

`pruneMissing` only checked whether a skill's library folder existed, not whether
it still held real content. A folder that lost its `SKILL.md` (empty folder) or
became invalid passed every check, so a partially-deleted library silently stayed
broken, and the empty folders propagated to targets. There was no path that
restored content from a skill's recorded source.

Separately, the copy-mode target sync left an empty folder in Skiller's target
slot untouched (`isSkillDirectory` was false, so `ensureManagedCopy` returned
early), so an empty target copy was never refilled.

## Change

### Core (`@skiller/core`) — `library-health.ts`

- `checkLibraryHealth({ libraryPath, checkContentHash? })` inspects every tracked
  skill's on-disk copy and reports issues with a reason:
  `missing-folder` | `empty-folder` | `invalid` | `hash-mismatch`. Read-only.
- `repairLibrary({ libraryPath, skillIds?, checkContentHash? })` re-fetches the
  unhealthy skills whose recorded source allows it (`github` / `skills.sh`) via
  the existing `updateInstalledSkill` path, restoring content from the source's
  ref. Non-refetchable sources (`local` / `unknown`) are reported as skipped;
  fetch failures are reported as errors. Safe to run repeatedly.

### Scanner

- `ensureManagedCopy` now replaces a directory in Skiller's target slot that is
  empty or missing `SKILL.md` (a broken/partial managed install) with a fresh
  copy, instead of returning early. A folder whose `SKILL.md` declares a
  different skill id is still left alone.

### Desktop

- IPC `library:repair` runs `repairLibrary` and, when skills were restored,
  re-distributes them via a one-way scan; preload exposes `repairLibrary`.
- Background startup runs a best-effort repair before the initial scan and emits
  `background:library-repaired` with repaired/skipped/error counts. Repair never
  blocks startup.
- Settings gains a **Library health** section with a **Repair library** button.

## Notes

- Re-fetch pulls the source's ref (usually HEAD), matching the Updates flow, so a
  restored skill may be newer than the exact lost version.
- Skills whose upstream source removed the path report a clear error rather than
  being silently dropped or corrupted.
