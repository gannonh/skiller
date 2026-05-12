# Library Skill Sets and Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add desktop Library organization with user-managed skill sets, batch set enablement, and tag filtering.

**Architecture:** Store organization data in the root library manifest through `MetadataStore`. Expose organization mutations through Electron IPC/preload and render the workflow in the existing Library page. Keep CLI behavior unchanged.

**Tech Stack:** TypeScript, Electron IPC, React 19, shadcn/ui primitives, Vitest, fs-extra.

---

## File Structure

- Modify `packages/core/src/types.ts`: add `SkillSetMetadata`, `LibraryState`, and organization fields on `SkillMetadata`.
- Modify `packages/core/src/metadata-store.ts`: read/write manifest skills plus skill sets, normalize old manifests, add organization mutation methods, derive known tags.
- Modify `packages/core/src/metadata-store.test.ts`: cover manifest migration, set CRUD, membership, tag normalization, filtering, and batch enablement.
- Modify `packages/core/src/installer.ts`: preserve `skillSetId` and `tags` on updates, initialize organization fields on installs.
- Modify `packages/core/src/scanner.ts`: initialize organization fields for imported skills.
- Modify `apps/desktop/src/main/ipc.ts`: return `LibraryState` from Library endpoints and add organization handlers.
- Modify `apps/desktop/src/preload.cts`: expose organization methods to the renderer.
- Modify `apps/desktop/src/renderer/lib/api.ts`: update Library types, fallback data, and preview API behavior.
- Modify `apps/desktop/src/renderer/pages/LibraryPage.tsx`: add organization controls, filters, set assignment, tag editing, and batch set toggles.
- Modify `apps/desktop/tests/preload.test.ts`: verify preload exposes the new methods.
- Create `apps/desktop/src/renderer/pages/LibraryPage.test.tsx`: pure helper tests for Library filtering, tag parsing, and set state.

---

### Task 1: Core Organization Types and Manifest Normalization

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/metadata-store.ts`
- Test: `packages/core/src/metadata-store.test.ts`

- [ ] **Step 1: Write failing tests for default organization fields**

Append these tests inside `describe("MetadataStore", () => { ... })` in `packages/core/src/metadata-store.test.ts`:

```ts
  it("defaults manifest organization fields", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const { enabled: _enabled, ...metadata } = metadataFor(skillPath);

    await fs.writeJson(path.join(libraryPath, "skiller.manifest.json"), {
      version: 1,
      skills: [{ ...metadata, enabled: true }]
    });

    await expect(new MetadataStore(libraryPath).libraryState()).resolves.toEqual({
      skills: [{ ...metadataFor(skillPath), tags: [] }],
      skillSets: [],
      tags: []
    });
  });

  it("clears skill set ids that do not exist", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");

    await fs.writeJson(path.join(libraryPath, "skiller.manifest.json"), {
      version: 1,
      skillSets: [],
      skills: [{ ...metadataFor(skillPath), skillSetId: "missing", tags: ["browser"] }]
    });

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([
      { ...metadataFor(skillPath), tags: ["browser"] }
    ]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @skiller/core test -- metadata-store.test.ts
```

Expected: FAIL because `libraryState` does not exist and organization fields are not normalized.

- [ ] **Step 3: Add core types**

Update `packages/core/src/types.ts`:

```ts
export interface SkillSetMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryState {
  skills: SkillMetadata[];
  skillSets: SkillSetMetadata[];
  tags: string[];
}
```

Extend `SkillMetadata`:

```ts
  enabled: boolean;
  skillSetId?: string;
  tags: string[];
  validation: ValidationResult;
```

- [ ] **Step 4: Normalize manifest organization data**

Update `packages/core/src/metadata-store.ts` imports and manifest types:

```ts
import type { LibraryState, SkillMetadata, SkillSetMetadata, SkillSource } from "./types.js";

interface SkillManifest {
  version: 1;
  skills: SkillMetadata[];
  skillSets?: SkillSetMetadata[];
}
```

Add helpers near `normalizeSource`:

```ts
function normalizeTag(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const tag = normalizeTag(item);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }

  return tags;
}

function normalizeSkillSets(value: unknown): SkillSetMetadata[] {
  if (!Array.isArray(value)) return [];
  const skillSets: SkillSetMetadata[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = stringField(record, "id");
    const name = stringField(record, "name");
    const createdAt = stringField(record, "createdAt");
    const updatedAt = stringField(record, "updatedAt");
    if (!id || !name || !createdAt || !updatedAt || seen.has(id)) continue;
    seen.add(id);
    skillSets.push({ id, name, createdAt, updatedAt });
  }

  return skillSets;
}

function knownTags(skills: SkillMetadata[]): string[] {
  return Array.from(new Set(skills.flatMap((skill) => skill.tags))).sort((left, right) => left.localeCompare(right));
}
```

Replace `normalizeMetadata(metadata: SkillMetadata)` with:

```ts
function normalizeMetadata(metadata: SkillMetadata, skillSetIds: Set<string> = new Set()): SkillMetadata {
  const tags = normalizeTags((metadata as SkillMetadata & { tags?: unknown }).tags);
  const skillSetId = stringField(metadata as unknown as Record<string, unknown>, "skillSetId");

  return {
    ...metadata,
    source: normalizeSource(metadata),
    enabled: typeof metadata.enabled === "boolean" ? metadata.enabled : true,
    tags,
    ...(skillSetId && skillSetIds.has(skillSetId) ? { skillSetId } : {})
  };
}
```

Add a private manifest reader and update `list()` to use it:

```ts
  private async readManifest(): Promise<{ skills: SkillMetadata[]; skillSets: SkillSetMetadata[] }> {
    if (!(await fs.pathExists(this.manifestPath()))) {
      const legacyRecords = await this.readLegacyRecords();

      if (legacyRecords.records.length === 0) return { skills: [], skillSets: [] };

      await this.writeManifest(legacyRecords.records, []);
      await this.removeLegacyRecords(legacyRecords.files);
      return { skills: legacyRecords.records.map((record) => normalizeMetadata(record)), skillSets: [] };
    }

    let manifest: SkillManifest;

    try {
      manifest = (await fs.readJson(this.manifestPath())) as SkillManifest;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;

      const legacyRecords = await this.readLegacyRecords();
      if (legacyRecords.records.length === 0) return { skills: [], skillSets: [] };

      await this.writeManifest(legacyRecords.records, []);
      await this.removeLegacyRecords(legacyRecords.files);
      return { skills: legacyRecords.records.map((record) => normalizeMetadata(record)), skillSets: [] };
    }

    const skillSets = normalizeSkillSets(manifest.skillSets);
    const skillSetIds = new Set(skillSets.map((skillSet) => skillSet.id));
    const skills = Array.isArray(manifest.skills)
      ? manifest.skills.map((metadata) => normalizeMetadata(metadata, skillSetIds))
      : [];

    return { skills, skillSets };
  }

  async list(): Promise<SkillMetadata[]> {
    return (await this.readManifest()).skills;
  }

  async libraryState(): Promise<LibraryState> {
    const { skills, skillSets } = await this.readManifest();
    return { skills, skillSets, tags: knownTags(skills) };
  }
```

Change `writeManifest` signature and body:

```ts
  private async writeManifest(skills: SkillMetadata[], skillSets: SkillSetMetadata[] = []): Promise<void> {
    const manifest: SkillManifest = {
      version: 1,
      skills,
      skillSets
    };
```

Update existing calls that need to preserve sets:

```ts
      const currentState = await this.readManifest();
      const currentSkills = currentState.skills;
      ...
      await this.writeManifest(nextSkills, currentState.skillSets);
```

Use the same `currentState.skillSets` preservation in `setEnabled`, `pruneMissing`, and `delete`.

- [ ] **Step 5: Update test helper metadata**

Update `metadataFor` in `packages/core/src/metadata-store.test.ts`:

```ts
    enabled: true,
    tags: []
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
pnpm --filter @skiller/core test -- metadata-store.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/metadata-store.ts packages/core/src/metadata-store.test.ts
git commit -m "feat(core): normalize library organization metadata"
```

---

### Task 2: Core Skill Set and Tag Actions

**Files:**
- Modify: `packages/core/src/metadata-store.ts`
- Test: `packages/core/src/metadata-store.test.ts`

- [ ] **Step 1: Write failing tests for set CRUD, assignment, tags, filters, and batch enablement**

Append these tests in `packages/core/src/metadata-store.test.ts`:

```ts
  it("creates renames and deletes skill sets", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const store = new MetadataStore(libraryPath);

    await store.save(metadataFor(skillPath));
    const created = await store.createSkillSet("Automation");
    expect(created.name).toBe("Automation");

    const renamed = await store.renameSkillSet(created.id, "Browser Automation");
    expect(renamed).toEqual({ ...created, name: "Browser Automation", updatedAt: renamed.updatedAt });

    await store.assignSkillSet("example-skill", created.id);
    expect((await store.list())[0]).toMatchObject({ skillSetId: created.id });

    await store.deleteSkillSet(created.id);
    expect(await store.libraryState()).toEqual({
      skills: [{ ...metadataFor(skillPath), tags: [] }],
      skillSets: [],
      tags: []
    });
  });

  it("normalizes skill tags and filters with all selected tags", async () => {
    const libraryPath = await makeTempDir();
    const firstPath = path.join(libraryPath, "example-skill");
    const secondPath = path.join(libraryPath, "other-skill");
    const store = new MetadataStore(libraryPath);

    await store.save(metadataFor(firstPath));
    await store.save({ ...metadataFor(secondPath), id: "other-skill", name: "Other Skill" });

    await store.replaceSkillTags("example-skill", [" Browser ", "Testing", "browser", "", "UI   QA"]);
    await store.replaceSkillTags("other-skill", ["browser"]);

    expect(await store.libraryState()).toMatchObject({
      tags: ["browser", "testing", "ui qa"]
    });
    expect((await store.filterSkills({ tags: ["browser", "testing"] })).map((skill) => skill.id)).toEqual([
      "example-skill"
    ]);
  });

  it("filters by set and ungrouped skills", async () => {
    const libraryPath = await makeTempDir();
    const firstPath = path.join(libraryPath, "example-skill");
    const secondPath = path.join(libraryPath, "other-skill");
    const store = new MetadataStore(libraryPath);

    await store.save(metadataFor(firstPath));
    await store.save({ ...metadataFor(secondPath), id: "other-skill", name: "Other Skill" });
    const skillSet = await store.createSkillSet("Automation");
    await store.assignSkillSet("example-skill", skillSet.id);

    expect((await store.filterSkills({ skillSetId: skillSet.id })).map((skill) => skill.id)).toEqual(["example-skill"]);
    expect((await store.filterSkills({ ungrouped: true })).map((skill) => skill.id)).toEqual(["other-skill"]);
  });

  it("derives mixed set state and toggles a whole set", async () => {
    const libraryPath = await makeTempDir();
    const firstPath = path.join(libraryPath, "example-skill");
    const secondPath = path.join(libraryPath, "other-skill");
    const store = new MetadataStore(libraryPath);

    await store.save(metadataFor(firstPath));
    await store.save({ ...metadataFor(secondPath), id: "other-skill", name: "Other Skill", enabled: false });
    const skillSet = await store.createSkillSet("Automation");
    await store.assignSkillSet("example-skill", skillSet.id);
    await store.assignSkillSet("other-skill", skillSet.id);

    expect(await store.skillSetEnablement(skillSet.id)).toBe("mixed");
    await store.setSkillSetEnabled(skillSet.id, false);
    expect((await store.filterSkills({ skillSetId: skillSet.id })).map((skill) => skill.enabled)).toEqual([false, false]);
    expect(await store.skillSetEnablement(skillSet.id)).toBe("off");
    await store.setSkillSetEnabled(skillSet.id, true);
    expect((await store.filterSkills({ skillSetId: skillSet.id })).map((skill) => skill.enabled)).toEqual([true, true]);
    expect(await store.skillSetEnablement(skillSet.id)).toBe("on");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @skiller/core test -- metadata-store.test.ts
```

Expected: FAIL because the new organization methods do not exist.

- [ ] **Step 3: Add action types and helpers**

Add near the top of `packages/core/src/metadata-store.ts`:

```ts
export type SkillSetEnablement = "on" | "off" | "mixed";

export interface SkillFilter {
  skillSetId?: string;
  ungrouped?: boolean;
  tags?: string[];
}

function normalizeSkillSetName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) throw new Error("Skill set name cannot be blank");
  return normalized;
}

function slugifySkillSetId(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "") || "skill-set"
  );
}

function uniqueSkillSetId(skillSets: SkillSetMetadata[], name: string): string {
  const base = slugifySkillSetId(name);
  const existingIds = new Set(skillSets.map((skillSet) => skillSet.id));
  let id = base;
  let suffix = 2;

  while (existingIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }

  return id;
}
```

- [ ] **Step 4: Implement organization methods**

Add these methods to `MetadataStore`:

```ts
  async createSkillSet(name: string): Promise<SkillSetMetadata> {
    const normalizedName = normalizeSkillSetName(name);
    return this.withWriteLock(async () => {
      const currentState = await this.readManifest();
      const now = new Date().toISOString();
      const skillSet: SkillSetMetadata = {
        id: uniqueSkillSetId(currentState.skillSets, normalizedName),
        name: normalizedName,
        createdAt: now,
        updatedAt: now
      };

      await this.writeManifest(currentState.skills, [...currentState.skillSets, skillSet]);
      return skillSet;
    });
  }

  async renameSkillSet(skillSetId: string, name: string): Promise<SkillSetMetadata> {
    const normalizedName = normalizeSkillSetName(name);
    return this.withWriteLock(async () => {
      const currentState = await this.readManifest();
      const existing = currentState.skillSets.find((skillSet) => skillSet.id === skillSetId);
      if (!existing) throw new Error(`Skill set not found: ${skillSetId}`);

      const updated = { ...existing, name: normalizedName, updatedAt: new Date().toISOString() };
      await this.writeManifest(
        currentState.skills,
        currentState.skillSets.map((skillSet) => (skillSet.id === skillSetId ? updated : skillSet))
      );
      return updated;
    });
  }

  async deleteSkillSet(skillSetId: string): Promise<SkillSetMetadata> {
    return this.withWriteLock(async () => {
      const currentState = await this.readManifest();
      const existing = currentState.skillSets.find((skillSet) => skillSet.id === skillSetId);
      if (!existing) throw new Error(`Skill set not found: ${skillSetId}`);

      await this.writeManifest(
        currentState.skills.map((skill) => {
          const { skillSetId: currentSkillSetId, ...rest } = skill;
          return currentSkillSetId === skillSetId ? rest : skill;
        }),
        currentState.skillSets.filter((skillSet) => skillSet.id !== skillSetId)
      );
      return existing;
    });
  }

  async assignSkillSet(skillId: string, skillSetId?: string): Promise<SkillMetadata> {
    return this.withWriteLock(async () => {
      const currentState = await this.readManifest();
      const existingSkill = currentState.skills.find((skill) => skill.id === skillId);
      if (!existingSkill) throw new Error(`Skill not found: ${skillId}`);
      if (skillSetId && !currentState.skillSets.some((skillSet) => skillSet.id === skillSetId)) {
        throw new Error(`Skill set not found: ${skillSetId}`);
      }

      const { skillSetId: _currentSkillSetId, ...withoutSet } = existingSkill;
      const updated = skillSetId ? { ...withoutSet, skillSetId } : withoutSet;
      await this.writeManifest(
        currentState.skills.map((skill) => (skill.id === skillId ? updated : skill)),
        currentState.skillSets
      );
      return updated;
    });
  }

  async replaceSkillTags(skillId: string, tags: string[]): Promise<SkillMetadata> {
    return this.withWriteLock(async () => {
      const currentState = await this.readManifest();
      const existingSkill = currentState.skills.find((skill) => skill.id === skillId);
      if (!existingSkill) throw new Error(`Skill not found: ${skillId}`);

      const updated = { ...existingSkill, tags: normalizeTags(tags) };
      await this.writeManifest(
        currentState.skills.map((skill) => (skill.id === skillId ? updated : skill)),
        currentState.skillSets
      );
      return updated;
    });
  }

  async filterSkills(filter: SkillFilter): Promise<SkillMetadata[]> {
    const state = await this.libraryState();
    const filterTags = normalizeTags(filter.tags ?? []);

    return state.skills.filter((skill) => {
      if (filter.ungrouped && skill.skillSetId) return false;
      if (filter.skillSetId && skill.skillSetId !== filter.skillSetId) return false;
      return filterTags.every((tag) => skill.tags.includes(tag));
    });
  }

  async skillSetEnablement(skillSetId: string): Promise<SkillSetEnablement> {
    const state = await this.libraryState();
    if (!state.skillSets.some((skillSet) => skillSet.id === skillSetId)) {
      throw new Error(`Skill set not found: ${skillSetId}`);
    }

    const members = state.skills.filter((skill) => skill.skillSetId === skillSetId);
    if (members.length === 0 || members.every((skill) => !skill.enabled)) return "off";
    if (members.every((skill) => skill.enabled)) return "on";
    return "mixed";
  }

  async setSkillSetEnabled(skillSetId: string, enabled: boolean): Promise<SkillMetadata[]> {
    return this.withWriteLock(async () => {
      const currentState = await this.readManifest();
      if (!currentState.skillSets.some((skillSet) => skillSet.id === skillSetId)) {
        throw new Error(`Skill set not found: ${skillSetId}`);
      }

      const updatedSkills = currentState.skills.map((skill) =>
        skill.skillSetId === skillSetId ? { ...skill, enabled } : skill
      );
      await this.writeManifest(updatedSkills, currentState.skillSets);
      return updatedSkills.filter((skill) => skill.skillSetId === skillSetId);
    });
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
pnpm --filter @skiller/core test -- metadata-store.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/metadata-store.ts packages/core/src/metadata-store.test.ts
git commit -m "feat(core): add library organization actions"
```

---

### Task 3: Preserve Organization Fields in Install and Scan Flows

**Files:**
- Modify: `packages/core/src/installer.ts`
- Modify: `packages/core/src/scanner.ts`
- Test: `packages/core/src/installer.test.ts`
- Test: `packages/core/src/scanner.test.ts`

- [ ] **Step 1: Write failing installer preservation test**

In `packages/core/src/installer.test.ts`, add this test inside `describe("updateInstalledSkill", () => { ... })` after the existing GitHub update test:

```ts
  it("preserves organization fields when updating an installed skill", async () => {
    const library = path.join(tmp, "library");
    await fs.ensureDir(path.join(library, "browser"));
    await fs.writeFile(path.join(library, "browser", "SKILL.md"), "---\nname: browser\ndescription: Old.\n---\n");
    await fs.writeJson(path.join(library, "skiller.manifest.json"), {
      version: 1,
      skillSets: [
        {
          id: "automation",
          name: "Automation",
          createdAt: "2026-05-12T00:00:00.000Z",
          updatedAt: "2026-05-12T00:00:00.000Z"
        }
      ],
      skills: [
        {
          id: "browser",
          name: "browser",
          description: "Old.",
          libraryPath: path.join(library, "browser"),
          source: {
            type: "github",
            githubUrl: "https://github.com/example/skills",
            githubPath: "skills/browser",
            ref: "main",
            commit: "abc123"
          },
          installedAt: "2026-05-09T00:00:00.000Z",
          keepUpdated: true,
          enabled: true,
          skillSetId: "automation",
          tags: ["browser", "testing"],
          validation: { valid: true, issues: [] }
        }
      ]
    });
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "def456" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/def456?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "skills/browser/SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/example/skills/def456/skills/browser/SKILL.md") {
        return new Response("---\nname: browser\ndescription: New.\n---\n");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const updated = await updateInstalledSkill({
      skillId: "browser",
      libraryPath: library,
      fetchImpl
    });

    expect(updated).toMatchObject({
      id: "browser",
      skillSetId: "automation",
      tags: ["browser", "testing"]
    });
  });
```

- [ ] **Step 2: Write failing scanner import default test**

In `packages/core/src/scanner.test.ts`, add an expectation to the imported metadata assertion:

```ts
expect(result.imported[0]).toMatchObject({
  enabled: true,
  tags: []
});
expect(result.imported[0]).not.toHaveProperty("skillSetId");
```

- [ ] **Step 3: Run focused tests to verify they fail**

Run:

```bash
pnpm --filter @skiller/core test -- installer.test.ts scanner.test.ts
```

Expected: FAIL on missing organization preservation or missing default tags.

- [ ] **Step 4: Preserve fields in installer metadata**

Update the `metadata` object in `installSkillFromDirectory` in `packages/core/src/installer.ts`:

```ts
  const metadata: SkillMetadata = {
    id,
    name: skillInfo.name,
    ...(skillInfo.description ? { description: skillInfo.description } : {}),
    libraryPath: librarySkillPath,
    source: input.source,
    installedAt: input.existingMetadata?.installedAt ?? now,
    updatedAt: now,
    ...(input.existingMetadata?.lastCheckedAt ? { lastCheckedAt: now } : {}),
    contentHash: await hashDirectory(librarySkillPath),
    keepUpdated: input.keepUpdated,
    enabled: input.existingMetadata?.enabled ?? true,
    ...(input.existingMetadata?.skillSetId ? { skillSetId: input.existingMetadata.skillSetId } : {}),
    tags: input.existingMetadata?.tags ?? [],
    validation
  };
```

- [ ] **Step 5: Initialize scanner metadata tags**

Update the imported metadata object in `packages/core/src/scanner.ts`:

```ts
            keepUpdated: false,
            validation,
            enabled: true,
            tags: []
```

- [ ] **Step 6: Run focused tests to verify they pass**

Run:

```bash
pnpm --filter @skiller/core test -- installer.test.ts scanner.test.ts metadata-store.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/installer.ts packages/core/src/scanner.ts packages/core/src/installer.test.ts packages/core/src/scanner.test.ts
git commit -m "feat(core): preserve skill organization fields"
```

---

### Task 4: Desktop IPC and Preload Organization API

**Files:**
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/preload.cts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Test: `apps/desktop/tests/preload.test.ts`

- [ ] **Step 1: Write failing preload test**

Update `apps/desktop/tests/preload.test.ts`:

```ts
    expect(preloadSource).toContain("createSkillSet");
    expect(preloadSource).toContain("renameSkillSet");
    expect(preloadSource).toContain("deleteSkillSet");
    expect(preloadSource).toContain("assignSkillSet");
    expect(preloadSource).toContain("replaceSkillTags");
    expect(preloadSource).toContain("setSkillSetEnabled");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @skiller/desktop test -- preload.test.ts
```

Expected: FAIL because preload does not expose organization methods.

- [ ] **Step 3: Add renderer API types**

Update imports and types in `apps/desktop/src/renderer/lib/api.ts`:

```ts
import type { LibraryState, ScanTargetsResult, SkillSetMetadata, SkillSource, SkillerConfig, TargetConfig } from "@skiller/core";

export type { LibraryState, SkillSetMetadata };
```

Update `SkillMetadata`:

```ts
  enabled: boolean;
  skillSetId?: string;
  tags: string[];
  validation: ValidationResult;
```

Update `SkillerApi`:

```ts
  listLibrary: () => Promise<LibraryState>;
  setSkillEnabled: (skillId: string, enabled: boolean) => Promise<LibraryState>;
  createSkillSet: (name: string) => Promise<LibraryState>;
  renameSkillSet: (skillSetId: string, name: string) => Promise<LibraryState>;
  deleteSkillSet: (skillSetId: string) => Promise<LibraryState>;
  assignSkillSet: (skillId: string, skillSetId?: string) => Promise<LibraryState>;
  replaceSkillTags: (skillId: string, tags: string[]) => Promise<LibraryState>;
  setSkillSetEnabled: (skillSetId: string, enabled: boolean) => Promise<LibraryState>;
```

- [ ] **Step 4: Add IPC handlers**

Update the existing Library handlers in `apps/desktop/src/main/ipc.ts`:

```ts
  ipcMain.handle("library:list", async () => {
    const config = await loadConfig();
    return new MetadataStore(expandHome(config.libraryPath)).libraryState();
  });
```

Update `library:set-enabled` return:

```ts
    await store.setEnabled(skillId, enabled);
    await scanConfig(config);
    return store.libraryState();
```

Add handlers after `library:set-enabled`:

```ts
  ipcMain.handle("library:create-skill-set", async (_event, name: string) => {
    const config = await loadConfig();
    const store = new MetadataStore(expandHome(config.libraryPath));
    await store.createSkillSet(name);
    return store.libraryState();
  });

  ipcMain.handle("library:rename-skill-set", async (_event, skillSetId: string, name: string) => {
    const config = await loadConfig();
    const store = new MetadataStore(expandHome(config.libraryPath));
    await store.renameSkillSet(skillSetId, name);
    return store.libraryState();
  });

  ipcMain.handle("library:delete-skill-set", async (_event, skillSetId: string) => {
    const config = await loadConfig();
    const store = new MetadataStore(expandHome(config.libraryPath));
    await store.deleteSkillSet(skillSetId);
    return store.libraryState();
  });

  ipcMain.handle("library:assign-skill-set", async (_event, skillId: string, skillSetId?: string) => {
    const config = await loadConfig();
    const store = new MetadataStore(expandHome(config.libraryPath));
    await store.assignSkillSet(skillId, skillSetId);
    return store.libraryState();
  });

  ipcMain.handle("library:replace-skill-tags", async (_event, skillId: string, tags: string[]) => {
    const config = await loadConfig();
    const store = new MetadataStore(expandHome(config.libraryPath));
    await store.replaceSkillTags(skillId, tags);
    return store.libraryState();
  });

  ipcMain.handle("library:set-skill-set-enabled", async (_event, skillSetId: string, enabled: boolean) => {
    const config = await loadConfig();
    const libraryPath = expandHome(config.libraryPath);
    const store = new MetadataStore(libraryPath);

    await store.setSkillSetEnabled(skillSetId, enabled);
    await scanConfig(config);
    return store.libraryState();
  });
```

- [ ] **Step 5: Expose preload methods**

Update `apps/desktop/src/preload.cts`:

```ts
  createSkillSet: (name: string) => ipcRenderer.invoke("library:create-skill-set", name),
  renameSkillSet: (skillSetId: string, name: string) => ipcRenderer.invoke("library:rename-skill-set", skillSetId, name),
  deleteSkillSet: (skillSetId: string) => ipcRenderer.invoke("library:delete-skill-set", skillSetId),
  assignSkillSet: (skillId: string, skillSetId?: string) => ipcRenderer.invoke("library:assign-skill-set", skillId, skillSetId),
  replaceSkillTags: (skillId: string, tags: string[]) => ipcRenderer.invoke("library:replace-skill-tags", skillId, tags),
  setSkillSetEnabled: (skillSetId: string, enabled: boolean) =>
    ipcRenderer.invoke("library:set-skill-set-enabled", skillSetId, enabled),
```

- [ ] **Step 6: Update preview API state**

In `apps/desktop/src/renderer/lib/api.ts`, change fallback `listLibrary` shape:

```ts
  let fallbackSkillSets: SkillSetMetadata[] = [];

  function previewLibraryState(): LibraryState {
    const tags = Array.from(new Set(fallbackSkills.flatMap((skill) => skill.tags))).sort((left, right) =>
      left.localeCompare(right)
    );
    return { skills: fallbackSkills, skillSets: fallbackSkillSets, tags };
  }
```

Add `tags: []` to each preview skill.

Update preview methods:

```ts
    listLibrary: async () => previewLibraryState(),
    setSkillEnabled: async (skillId, enabled) => {
      const skill = fallbackSkills.find((candidate) => candidate.id === skillId);
      if (skill) skill.enabled = enabled;
      return previewLibraryState();
    },
    createSkillSet: async (name) => {
      const now = new Date().toISOString();
      fallbackSkillSets = [...fallbackSkillSets, { id: name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-"), name: name.trim(), createdAt: now, updatedAt: now }];
      return previewLibraryState();
    },
    renameSkillSet: async (skillSetId, name) => {
      fallbackSkillSets = fallbackSkillSets.map((skillSet) =>
        skillSet.id === skillSetId ? { ...skillSet, name: name.trim(), updatedAt: new Date().toISOString() } : skillSet
      );
      return previewLibraryState();
    },
    deleteSkillSet: async (skillSetId) => {
      fallbackSkillSets = fallbackSkillSets.filter((skillSet) => skillSet.id !== skillSetId);
      fallbackSkills.forEach((skill) => {
        if (skill.skillSetId === skillSetId) delete skill.skillSetId;
      });
      return previewLibraryState();
    },
    assignSkillSet: async (skillId, skillSetId) => {
      const skill = fallbackSkills.find((candidate) => candidate.id === skillId);
      if (skill) {
        if (skillSetId) skill.skillSetId = skillSetId;
        else delete skill.skillSetId;
      }
      return previewLibraryState();
    },
    replaceSkillTags: async (skillId, tags) => {
      const skill = fallbackSkills.find((candidate) => candidate.id === skillId);
      if (skill) skill.tags = Array.from(new Set(tags.map((tag) => tag.trim().replace(/\s+/g, " ").toLowerCase()).filter(Boolean)));
      return previewLibraryState();
    },
    setSkillSetEnabled: async (skillSetId, enabled) => {
      fallbackSkills.forEach((skill) => {
        if (skill.skillSetId === skillSetId) skill.enabled = enabled;
      });
      return previewLibraryState();
    },
```

- [ ] **Step 7: Run tests and typecheck**

Run:

```bash
pnpm --filter @skiller/desktop test -- preload.test.ts
pnpm --filter @skiller/desktop typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/main/ipc.ts apps/desktop/src/preload.cts apps/desktop/src/renderer/lib/api.ts apps/desktop/tests/preload.test.ts
git commit -m "feat(desktop): expose library organization api"
```

---

### Task 5: Library Page Organization UI Helpers

**Files:**
- Modify: `apps/desktop/src/renderer/pages/LibraryPage.tsx`
- Test: `apps/desktop/src/renderer/pages/LibraryPage.test.tsx` or helper tests in the same folder supported by current Vitest config

- [ ] **Step 1: Extract pure helper functions**

Add exports near the top of `LibraryPage.tsx`:

```ts
export type SetFilter = "all" | "ungrouped" | string;

export function parseTagInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim().replace(/\s+/g, " ").toLowerCase())
        .filter(Boolean)
    )
  );
}

export function skillSetState(skills: SkillMetadata[], skillSetId: string): "on" | "off" | "mixed" {
  const members = skills.filter((skill) => skill.skillSetId === skillSetId);
  if (members.length === 0 || members.every((skill) => !skill.enabled)) return "off";
  if (members.every((skill) => skill.enabled)) return "on";
  return "mixed";
}

export function filterLibrarySkills(skills: SkillMetadata[], setFilter: SetFilter, selectedTags: string[]): SkillMetadata[] {
  return skills.filter((skill) => {
    if (setFilter === "ungrouped" && skill.skillSetId) return false;
    if (setFilter !== "all" && setFilter !== "ungrouped" && skill.skillSetId !== setFilter) return false;
    return selectedTags.every((tag) => skill.tags.includes(tag));
  });
}
```

- [ ] **Step 2: Write helper tests**

Create `apps/desktop/src/renderer/pages/LibraryPage.test.tsx`:

```ts
import { describe, expect, it } from "vitest";
import { filterLibrarySkills, parseTagInput, skillSetState } from "./LibraryPage.js";
import type { SkillMetadata } from "../lib/api.js";

function skill(input: Partial<SkillMetadata> & { id: string }): SkillMetadata {
  return {
    id: input.id,
    name: input.name ?? input.id,
    libraryPath: `/tmp/${input.id}`,
    source: { type: "local", path: `/tmp/${input.id}` },
    installedAt: "2026-05-12T00:00:00.000Z",
    keepUpdated: false,
    enabled: input.enabled ?? true,
    tags: input.tags ?? [],
    ...(input.skillSetId ? { skillSetId: input.skillSetId } : {}),
    validation: { valid: true, issues: [] }
  };
}

describe("LibraryPage helpers", () => {
  it("parses tag input", () => {
    expect(parseTagInput(" Browser, testing, browser, UI   QA ")).toEqual(["browser", "testing", "ui qa"]);
  });

  it("filters by set ungrouped and all selected tags", () => {
    const skills = [
      skill({ id: "one", skillSetId: "automation", tags: ["browser", "testing"] }),
      skill({ id: "two", tags: ["browser"] }),
      skill({ id: "three", skillSetId: "automation", tags: ["browser"] })
    ];

    expect(filterLibrarySkills(skills, "automation", ["browser", "testing"]).map((item) => item.id)).toEqual(["one"]);
    expect(filterLibrarySkills(skills, "ungrouped", ["browser"]).map((item) => item.id)).toEqual(["two"]);
  });

  it("derives skill set state", () => {
    expect(skillSetState([skill({ id: "one", skillSetId: "set", enabled: true })], "set")).toBe("on");
    expect(skillSetState([skill({ id: "one", skillSetId: "set", enabled: false })], "set")).toBe("off");
    expect(
      skillSetState(
        [skill({ id: "one", skillSetId: "set", enabled: true }), skill({ id: "two", skillSetId: "set", enabled: false })],
        "set"
      )
    ).toBe("mixed");
  });
});
```

- [ ] **Step 3: Run tests to verify helper behavior**

Run:

```bash
pnpm --filter @skiller/desktop test -- LibraryPage.test.tsx
```

Expected: PASS after helpers exist.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/pages/LibraryPage.tsx apps/desktop/src/renderer/pages/LibraryPage.test.tsx
git commit -m "feat(desktop): add library organization helpers"
```

---

### Task 6: Library Page State and Mutations

**Files:**
- Modify: `apps/desktop/src/renderer/pages/LibraryPage.tsx`

- [ ] **Step 1: Replace skill-only state with Library state**

In `LibraryPage.tsx`, update imports:

```ts
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { skillerApi, type LibraryState, type SkillMetadata } from "../lib/api.js";
```

Add initial state:

```ts
const emptyLibraryState: LibraryState = {
  skills: [],
  skillSets: [],
  tags: []
};
```

Replace:

```ts
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
```

with:

```ts
  const [libraryState, setLibraryState] = useState<LibraryState>(emptyLibraryState);
  const skills = libraryState.skills;
```

Update `refreshLibrary`:

```ts
  async function refreshLibrary() {
    const result = await skillerApi.listLibrary();
    setLibraryState(result);
    setError(null);
    return result;
  }
```

Update mutation returns:

```ts
      const updatedState = await skillerApi.setSkillEnabled(skillId, enabled);
      setLibraryState(updatedState);
```

- [ ] **Step 2: Add organization UI state**

Add these state values near the other `useState` calls:

```ts
  const [setFilter, setSetFilter] = useState<SetFilter>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newSkillSetName, setNewSkillSetName] = useState("");
  const [renamingSkillSetId, setRenamingSkillSetId] = useState<string | null>(null);
  const [renamingSkillSetName, setRenamingSkillSetName] = useState("");
  const [editingTagSkillId, setEditingTagSkillId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
```

Add derived filtered skills:

```ts
  const filteredSkills = useMemo(
    () => filterLibrarySkills(skills, setFilter, selectedTags),
    [skills, setFilter, selectedTags]
  );
```

- [ ] **Step 3: Add mutation wrappers**

Add functions inside `LibraryPage`:

```ts
  async function createSkillSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newSkillSetName.trim() === "") return;
    setError(null);
    try {
      setLibraryState(await skillerApi.createSkillSet(newSkillSetName));
      setNewSkillSetName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function renameSkillSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renamingSkillSetId || renamingSkillSetName.trim() === "") return;
    setError(null);
    try {
      setLibraryState(await skillerApi.renameSkillSet(renamingSkillSetId, renamingSkillSetName));
      setRenamingSkillSetId(null);
      setRenamingSkillSetName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function deleteSkillSet(skillSetId: string) {
    setError(null);
    try {
      setLibraryState(await skillerApi.deleteSkillSet(skillSetId));
      if (setFilter === skillSetId) setSetFilter("all");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function assignSkillSet(skillId: string, skillSetId: string) {
    setError(null);
    try {
      setLibraryState(await skillerApi.assignSkillSet(skillId, skillSetId === "none" ? undefined : skillSetId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function saveSkillTags(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTagSkillId) return;
    setError(null);
    try {
      setLibraryState(await skillerApi.replaceSkillTags(editingTagSkillId, parseTagInput(tagInput)));
      setEditingTagSkillId(null);
      setTagInput("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function setWholeSetEnabled(skillSetId: string, enabled: boolean) {
    setPendingSkillIds((current) => {
      const next = new Set(current);
      skills.filter((skill) => skill.skillSetId === skillSetId).forEach((skill) => next.add(skill.id));
      return next;
    });
    setError(null);
    try {
      setLibraryState(await skillerApi.setSkillSetEnabled(skillSetId, enabled));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPendingSkillIds((current) => {
        const next = new Set(current);
        skills.filter((skill) => skill.skillSetId === skillSetId).forEach((skill) => next.delete(skill.id));
        return next;
      });
    }
  }
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm --filter @skiller/desktop typecheck
```

Expected: PASS after any unused imports or state values are resolved by Task 7 UI markup.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/pages/LibraryPage.tsx
git commit -m "feat(desktop): wire library organization state"
```

---

### Task 7: Library Organization Controls and Table Fields

**Files:**
- Modify: `apps/desktop/src/renderer/pages/LibraryPage.tsx`

- [ ] **Step 1: Add set and tag filter controls**

Insert after the installed-skill badges:

```tsx
        <div className="grid gap-3 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={setFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setSetFilter("all")}>
              All
            </Button>
            <Button
              variant={setFilter === "ungrouped" ? "default" : "outline"}
              size="sm"
              onClick={() => setSetFilter("ungrouped")}
            >
              Ungrouped
            </Button>
            {libraryState.skillSets.map((skillSet) => (
              <Button
                key={skillSet.id}
                variant={setFilter === skillSet.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSetFilter(skillSet.id)}
              >
                {skillSet.name}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {libraryState.tags.map((tag) => {
              const selected = selectedTags.includes(tag);
              return (
                <Button
                  key={tag}
                  variant={selected ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setSelectedTags((current) =>
                      current.includes(tag) ? current.filter((candidate) => candidate !== tag) : [...current, tag]
                    )
                  }
                >
                  {tag}
                </Button>
              );
            })}
          </div>
        </div>
```

- [ ] **Step 2: Add skill set management controls**

Insert below the filter controls:

```tsx
        <div className="grid gap-2 rounded-md border p-3">
          <form className="flex flex-wrap items-center gap-2" onSubmit={createSkillSet}>
            <Input
              value={newSkillSetName}
              onChange={(event) => setNewSkillSetName(event.target.value)}
              aria-label="New skill set name"
              placeholder="New skill set"
              className="max-w-64"
            />
            <Button type="submit" size="sm" disabled={newSkillSetName.trim() === ""}>
              Create set
            </Button>
          </form>
          {renamingSkillSetId ? (
            <form className="flex flex-wrap items-center gap-2" onSubmit={renameSkillSet}>
              <Input
                value={renamingSkillSetName}
                onChange={(event) => setRenamingSkillSetName(event.target.value)}
                aria-label="Rename skill set"
                className="max-w-64"
              />
              <Button type="submit" size="sm" disabled={renamingSkillSetName.trim() === ""}>
                Rename
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setRenamingSkillSetId(null)}>
                Cancel
              </Button>
            </form>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {libraryState.skillSets.map((skillSet) => {
              const state = skillSetState(skills, skillSet.id);
              const members = skills.filter((skill) => skill.skillSetId === skillSet.id);
              return (
                <div key={skillSet.id} className="flex items-center gap-2 rounded-md border px-2 py-1">
                  <span className="text-sm">{skillSet.name}</span>
                  <Badge variant="secondary">{state}</Badge>
                  <Switch
                    checked={state === "on"}
                    disabled={members.length === 0 || members.some((skill) => pendingSkillIds.has(skill.id))}
                    onCheckedChange={(checked) => void setWholeSetEnabled(skillSet.id, checked)}
                    aria-label={`Toggle ${skillSet.name}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRenamingSkillSetId(skillSet.id);
                      setRenamingSkillSetName(skillSet.name);
                    }}
                  >
                    Rename
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void deleteSkillSet(skillSet.id)}>
                    Delete
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
```

- [ ] **Step 3: Add table columns**

Update the table header:

```tsx
                <TableHead>Name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Set</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updates</TableHead>
                <TableHead>Enabled</TableHead>
```

Render `filteredSkills.map` instead of `skills.map`.

Add cells after Source:

```tsx
                  <TableCell>
                    <select
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={skill.skillSetId ?? "none"}
                      onChange={(event) => void assignSkillSet(skill.id, event.target.value)}
                      aria-label={`Set for ${skill.name || skill.id}`}
                    >
                      <option value="none">No set</option>
                      {libraryState.skillSets.map((skillSet) => (
                        <option key={skillSet.id} value={skillSet.id}>
                          {skillSet.name}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-72 flex-wrap items-center gap-1">
                      {skill.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingTagSkillId(skill.id);
                          setTagInput(skill.tags.join(", "));
                        }}
                      >
                        Edit
                      </Button>
                    </div>
                  </TableCell>
```

Update empty row col span to `7` and use `filteredSkills.length`.

- [ ] **Step 4: Add tag editing form**

Insert before the table:

```tsx
        {editingTagSkillId ? (
          <form className="flex flex-wrap items-center gap-2 rounded-md border p-3" onSubmit={saveSkillTags}>
            <Input
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              aria-label="Skill tags"
              placeholder="browser, testing"
              className="max-w-96"
            />
            <Button type="submit" size="sm">
              Save tags
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingTagSkillId(null);
                setTagInput("");
              }}
            >
              Cancel
            </Button>
          </form>
        ) : null}
```

- [ ] **Step 5: Run desktop tests and typecheck**

Run:

```bash
pnpm --filter @skiller/desktop test -- LibraryPage.test.tsx preload.test.ts
pnpm --filter @skiller/desktop typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/pages/LibraryPage.tsx
git commit -m "feat(desktop): add library organization controls"
```

---

### Task 8: Full Verification and Polish

**Files:**
- Review all modified files from previous tasks.

- [ ] **Step 1: Run package tests**

Run:

```bash
pnpm --filter @skiller/core test
pnpm --filter @skiller/desktop test
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 4: Manual desktop smoke check**

Run:

```bash
pnpm dev
```

Expected:

- Library opens.
- Create a skill set.
- Assign a skill to the set.
- Add tags to a skill.
- Select multiple tag filters and verify only skills with every selected tag remain.
- Toggle the set off and on and verify member skill toggles update.
- Toggle one member skill and verify the set shows `mixed`.

- [ ] **Step 5: Commit any polish changes**

When verification required fixes, stage the exact files changed by those fixes and commit them. Example for a UI-only fix:

```bash
git add apps/desktop/src/renderer/pages/LibraryPage.tsx
git commit -m "fix: polish library organization workflow"
```

When `git status --short` shows no changes, skip this step.
