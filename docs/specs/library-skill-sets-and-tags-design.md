---
type: Spec
title: Library Skill Sets and Tags
description: Desktop Library organization with skill sets, batch enablement, and tag filtering.
tags: [library, skill-sets, tags]
timestamp: 2026-05-12T00:00:00Z
---

# Library Skill Sets and Tags

Related: [Skill sets and tags plan](/specs/library-skill-sets-and-tags.md), superseded in part by [many-to-many skill sets](/specs/library-skill-sets-many-to-many.md)

## Goal

Add local organization tools to the Library so users can group installed skills into skill sets, enable or disable a whole set with one action, and filter skills by user-managed tags.

## Scope

This first pass covers the desktop Library UI and core persistence/actions. CLI commands are out of scope.

Skiller stores user-created skill sets and tags locally.

## Product Behavior

Skill sets:

- A skill can belong to one set or no set.
- Users can create, rename, and delete skill sets.
- Users can assign a skill to one set or clear its set.
- Deleting a set clears membership for skills in that set.
- Empty sets can exist.

Set enablement:

- A set toggle is a batch action over the skills currently assigned to that set.
- Turning a set on enables every member skill.
- Turning a set off disables every member skill.
- Individual skill toggles remain independent after a batch action.
- The set toggle shows on when all member skills are enabled.
- The set toggle shows off when all member skills are disabled.
- The set toggle shows mixed when member skills differ.
- Empty sets show disabled batch toggle controls.

Tags:

- Tags are user-managed local labels on skills.
- A skill can have multiple tags.
- Users can edit a skill's tags from the Library.
- Known tags are derived from current skill tags.
- Tag filters require every selected tag to be present.

Filters:

- Users can filter by skill set.
- Users can filter for ungrouped skills.
- Users can filter by tags.
- Set and tag filters compose together.

## Data Model

The root library manifest remains the source of truth. It gains an ordered `skillSets` list, and skill records gain local organization fields.

```ts
interface SkillSetMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface SkillMetadata {
  id: string;
  name: string;
  skillSetId?: string;
  tags: string[];
}
```

Existing skill metadata fields remain unchanged.

Manifest reads normalize older records:

- Missing `skillSets` becomes `[]`.
- Missing skill `tags` becomes `[]`.
- Missing or unknown `skillSetId` is cleared.
- Duplicate set ids are ignored after the first valid entry.

Tag normalization trims whitespace, collapses internal whitespace to single spaces, lowercases values, drops blank values, and de-duplicates values.

## Core API

`MetadataStore` owns organization writes so library state stays consistent. Add methods for:

- loading a Library state object containing skills, skill sets, and known tags
- creating, renaming, deleting, and listing skill sets
- assigning a skill to one or more sets or clearing all memberships
- replacing a skill's tags
- listing known tags
- filtering skills by set and tags
- setting all skills in a set enabled or disabled

Install, scan, update, and save flows preserve skill set memberships and `tags` when rewriting a skill record.

Batch set enablement should use one manifest write. Desktop should run one target scan after that write.

## Desktop API

Add IPC and preload methods for the organization actions. Mutations return the updated Library state so the renderer can refresh from source of truth after each change.

The Library load response should include:

```ts
interface LibraryState {
  skills: SkillMetadata[];
  skillSets: SkillSetMetadata[];
  tags: string[];
}
```

## UI

The Library page gets an organization area above the table with:

- skill set filters
- tag filters
- create, rename, and delete set controls
- set enablement controls with on, off, and mixed state

The table gains compact controls for:

- assigning or clearing a skill set
- editing a skill's tags
- showing tag badges

The existing skill enabled toggle stays per skill.

The page keeps the existing error pattern: failed mutations keep current UI state, clear pending state, and show the error alert.

If a target scan fails after a successful metadata write, the UI reports the scan error and keeps the saved metadata state.

## Testing

Core tests should cover:

- manifest migration for missing organization fields
- set create, rename, delete, and ordering
- many-to-many membership via `setSkillMembership`
- clearing memberships when deleting a set
- tag normalization
- all-selected-tags filtering
- mixed set enablement state derivation
- batch set enable and disable
- preserving organization fields during metadata saves

Desktop tests should cover:

- IPC and preload wiring for organization actions
- Library loading skills, sets, and tags
- set filtering and ungrouped filtering
- tag filtering with all-selected-tags matching
- set assignment from a skill row
- tag editing from a skill row
- set batch enablement with mocked API responses

## Acceptance Criteria

- Users can create, rename, and delete skill sets in Library.
- Users can assign each skill to zero or more skill sets.
- Users can toggle a set to update all member skill enabled states.
- Users can still toggle individual skills after set batch actions.
- Mixed set state appears when member skill enabled states differ.
- Users can add, edit, and remove tags on skills.
- Users can filter by set, ungrouped skills, and tags.
- Multiple selected tag filters require all selected tags.
- Organization data persists across app restarts.
- Existing libraries load with empty sets and tags.

## v2 Many-to-Many (2026-06-21)

Skill sets now support many-to-many membership and per-set sync targets.

### Data model

```ts
interface SkillSetMetadata {
  id: string;
  name: string;
  skillIds: string[];
  targets: TargetConfig[];
  createdAt: string;
  updatedAt: string;
}
```

- Skills no longer store `skillSetId`.
- Legacy manifests migrate `skillSetId` on skills into the matching set's `skillIds` on read.

### Membership

- A skill may belong to zero or more skill sets.
- `setSkillMembership(skillId, skillSetIds)` replaces single-set assignment.
- `saveSkillSet` creates or updates a set's name, members, and targets together.

### Per-set targets and sync

Each skill set may define its own `targets` list (same shape as global targets). On scan:

- **Grouped skill** in sets with configured targets syncs to the union of enabled targets across those sets.
- **Grouped skill** in sets with empty targets falls back to global enabled targets.
- **Ungrouped skills** continue syncing to global enabled targets only.

### UI

- Create/edit skill sets via a modal with name, sortable skill picker, and target editor.
- Per-skill **Skill Sets** button opens a membership modal for M2M toggles.
- Inline create/rename forms and the per-row skill set `<select>` are removed.
