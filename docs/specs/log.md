# Specs Log

## 2026-06-26

- Added a library health check + self-repair: `checkLibraryHealth` / `repairLibrary` detect and re-fetch tracked skills whose copy is missing, empty, invalid, or drifted, run on desktop startup and via a Settings **Repair library** button. Fixed copy-mode sync to repopulate empty target slots instead of leaving them empty. New spec: [library-health-and-repair.md](/specs/library-health-and-repair.md).

## 2026-06-25

- Made `scanTargets` one-way by default and gated target->library adoption behind an opt-in `import` flag, fixing a duplicate-skill feedback loop. Added `discoverImportableSkills` / `importSkillsFromTargets` and a Settings **Import** section (scan on mount + Scan button, import all/selected/individual). New spec: [one-way-sync-and-import.md](/specs/one-way-sync-and-import.md).

## 2026-06-23

- Reworked skill-set target scoping into an additive model: skill sets only carry project targets (no scope field) and never suppress global distribution. Removed per-skill `targetScope` / `SkillTargetScope` and `TargetScope` on `TargetConfig`. The skill enable toggle now gates global-target sync only; project-target sync is driven by skill-set membership. Updated [library-skill-sets-many-to-many.md](/specs/library-skill-sets-many-to-many.md) and [library-skill-sets-and-tags-design.md](/specs/library-skill-sets-and-tags-design.md).

## 2026-06-22

- Migrated superpowers specs and plans into OKF concept documents under `docs/specs/` (`library-skill-sets-and-tags-design.md`, `library-skill-sets-many-to-many.md`, `library-source-links-design.md`, `skill-provenance-and-installs-design.md`, `skiller-desktop-design.md`, `app-auto-update-design.md`, and companion plan docs).
- Added OKF frontmatter, cross-links, and roadmap grouping in [index.md](/specs/index.md).
