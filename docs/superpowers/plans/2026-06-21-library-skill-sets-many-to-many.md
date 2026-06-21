# Library Skill Sets: Many-to-Many + Modal UI

**Status:** Implemented (2026-06-21)

**Goal:** Migrate skill-to-set membership from one-to-many (`skillSetId` on skills) to many-to-many (`skillIds` on sets), add per-set targets, and replace inline skill set controls with create/edit and per-skill membership modals on the Library page.

## Summary of changes

### Data model

- `SkillSetMetadata` now stores `skillIds: string[]` and `targets: TargetConfig[]`.
- `skillSetId` removed from `SkillMetadata`; membership lives on sets.
- Manifest migration on read converts legacy `skillSetId` into set `skillIds`.

### Core APIs

- `saveSkillSet({ id?, name, skillIds, targets })` replaces create/rename.
- `setSkillMembership(skillId, skillSetIds)` replaces assign.
- Scanner routes enabled skills to per-set targets (union across sets) with global-target fallback.

### Desktop UI

- **Create New Skill Set** button opens `SkillSetEditorDialog` (name, skill picker table, targets).
- Skill set rows use **Edit** instead of rename.
- Library table **Skill Sets** button opens `SkillMembershipDialog` for M2M assignment.

See the full implementation plan in the agent artifacts for architecture diagrams and file-level detail.
