---
type: Plan
title: Library Skill Sets Many-to-Many
description: Migrate skill-to-set membership to many-to-many, add per-set targets, and replace inline controls with modals.
tags: [library, skill-sets, desktop]
timestamp: 2026-06-21T00:00:00Z
---

# Library Skill Sets: Many-to-Many + Modal UI

**Status:** Implemented (2026-06-21)

Related: [Skill sets and tags design](/specs/library-skill-sets-and-tags-design.md), [Skill sets and tags plan](/specs/library-skill-sets-and-tags.md)

**Goal:** Migrate skill-to-set membership from one-to-many (`skillSetId` on skills) to many-to-many (`skillIds` on sets), add per-set targets, and replace inline skill set controls with create/edit and per-skill membership modals on the Library page.

## Summary of changes

### Data model

- `SkillSetMetadata` now stores `skillIds: string[]` and `targets: TargetConfig[]`.
- `skillSetId` removed from `SkillMetadata`; membership lives on sets.
- Manifest migration on read converts legacy `skillSetId` into set `skillIds`.

### Core APIs

- `saveSkillSet({ id?, name, skillIds, targets })` replaces create/rename.
- `setSkillMembership(skillId, skillSetIds)` replaces assign.
- Scanner routes enabled skills to global targets; skill-set membership independently routes a skill (enabled or not) to that set's project targets. Skill sets never suppress global distribution.

### Desktop UI

- **Create New Skill Set** button opens `SkillSetEditorDialog` (name, skill picker table, targets).
- Skill set rows use **Edit** instead of rename.
- Library table **Skill Sets** button opens `SkillMembershipDialog` for M2M assignment.

See the full implementation plan in the agent artifacts for architecture diagrams and file-level detail.
