---
type: Spec
title: Skill Provenance and Installs
description: Provenance model and install flows for local, GitHub, skills.sh, and imported skills.
tags: [library, installs, provenance]
timestamp: 2026-05-11T00:00:00Z
---

# Skill Provenance and Installs

Related: [Skill provenance implementation plan](/specs/skill-provenance-and-installs.md)

## Goal

Add clear provenance for library skills so Skiller can install, display, and update skills from known sources.

## Source Types

Skiller stores one source record per library skill:

```ts
type SkillSource =
  | {
      type: "skills.sh";
      skillsShId: string;
      githubUrl: string;
      githubPath?: string;
      ref?: string;
      commit?: string;
    }
  | {
      type: "github";
      githubUrl: string;
      githubPath?: string;
      ref?: string;
      commit?: string;
    }
  | {
      type: "local";
      path: string;
    }
  | {
      type: "unknown";
      discoveredFrom?: string;
    };
```

## Install Flows

Discover is the primary install path for skills.sh entries:

- Discover shows skills.sh leaderboard and search results.
- Each result has an `Install` action.
- Installed results show `Installed`.
- Installed results with an available update can show `Update`.
- Row details can show description, source repo, audit status, validation status, and install/update actions.

Library is for installed skills and non-registry adds:

- `Add from local folder`: copy a selected skill folder into the master library and store `source.type = "local"` with the original path.
- `Add from GitHub`: install from a GitHub repo/path/ref and store direct GitHub source fields.
- A `Browse registry` action can navigate to Discover.

Skills imported during target scans use `source.type = "unknown"` and record the target path they came from when available.

## Update Behavior

Updates apply only to sources with an upstream:

- `skills.sh`: check the registry entry, then fetch the GitHub source declared by that entry.
- `github`: check the configured GitHub ref/path directly.
- `local`: do not participate in background update checks. A later Library action can refresh from the stored local path.
- `unknown`: do not participate in updates.

The Updates page should list only updateable skills by default. Library detail can show source status for every skill.

## Product Model

Discover finds registry skills. Library manages installed skills.

Library should show every installed skill with provenance, validation, enablement, and update status. Discover should show registry availability and install state.

## Manifest

Keep using the root `skiller.manifest.json`. Add any needed fields in place and normalize older records during read.

Recommended display labels:

- `skills.sh`: Registry
- `github`: GitHub
- `local`: Local
- `unknown`: Unknown

## Open Questions

- Should direct GitHub installs support subdirectories in the first version?
- Should local refresh compare hashes before copying?
- Should unknown skills offer a `Link source` action in this pass or a later pass?
