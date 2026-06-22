---
type: Plan
title: Skill Provenance and Installs Implementation Plan
description: Add provenance-aware install, display, and update behavior across core, CLI, and desktop.
tags: [library, installs, provenance]
timestamp: 2026-05-11T00:00:00Z
---

# Skill Provenance and Installs Implementation Plan

Related: [Skill provenance design](/specs/skill-provenance-and-installs-design.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provenance-aware install, display, and update behavior for local, GitHub, skills.sh, and imported skills.

**Architecture:** Keep provenance in the root `skiller.manifest.json` through the existing `MetadataStore`. Add focused core helpers for GitHub and skills.sh source acquisition, then route CLI and desktop installs through those core APIs. The renderer derives install and update state from library metadata and update-check results.

**Tech Stack:** pnpm, TypeScript, Electron, Vite, React, shadcn/ui, Vitest, Playwright, fs-extra, yaml, native fetch.

---

## File Structure

- Modify `packages/core/src/types.ts`: define the discriminated `SkillSource` union from the spec, add install input/result types exported from core.
- Modify `packages/core/src/metadata-store.ts`: normalize source records and older records during read.
- Create `packages/core/src/source-fetcher.ts`: parse GitHub URLs, download a repo/path/ref to a temporary skill source folder, extract registry source fields from skills.sh payloads.
- Create `packages/core/src/source-fetcher.test.ts`: cover GitHub URL parsing, path-scoped downloads, registry payload extraction, and cleanup.
- Modify `packages/core/src/installer.ts`: share directory install logic and add GitHub and skills.sh installers.
- Modify `packages/core/src/installer.test.ts`: cover local source paths, descriptions, GitHub installs, and skills.sh installs.
- Modify `packages/core/src/scanner.ts`: store `source.type = "unknown"` with `discoveredFrom` for imported target skills.
- Modify `packages/core/src/scanner.test.ts`: assert imported skills record the target path.
- Modify `packages/core/src/updater.ts`: consider only updateable upstream sources and resolve skills.sh sources through their declared GitHub source.
- Modify `packages/core/src/updater.test.ts`: cover updateable filtering and skills.sh update checks.
- Modify `packages/core/src/index.ts`: export `source-fetcher.ts`.
- Modify `packages/cli/src/index.ts`: add direct GitHub and registry install commands.
- Modify `packages/cli/src/index.test.ts`: cover the new CLI commands.
- Modify `apps/desktop/src/main/ipc.ts`: add install IPC handlers and registry detail/audit handlers.
- Modify `apps/desktop/src/preload.cts`: expose install methods to the renderer.
- Modify `apps/desktop/src/renderer/lib/api.ts`: mirror core provenance types and add renderer API methods.
- Modify `apps/desktop/src/renderer/App.tsx`: pass a registry navigation callback to Library.
- Modify `apps/desktop/src/renderer/pages/LibraryPage.tsx`: show provenance, validation, update state, add local and GitHub install actions.
- Modify `apps/desktop/src/renderer/pages/DiscoverPage.tsx`: show registry install state, details, and install/update actions.
- Modify `apps/desktop/src/renderer/pages/UpdatesPage.tsx`: list updateable skills and available updates.
- Modify `apps/desktop/tests/preload.test.ts`: assert install bridge methods are exposed.
- Modify `e2e/skiller.spec.ts`: cover provenance labels, Discover install state, Library browse action, and Updates list.

---

### Task 1: Provenance Types and Manifest Normalization

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/metadata-store.ts`
- Modify: `packages/core/src/metadata-store.test.ts`

- [ ] **Step 1: Write failing metadata normalization tests**

Add this test to `packages/core/src/metadata-store.test.ts` inside `describe("MetadataStore", ...)`:

```ts
  it("normalizes source records from the root manifest", async () => {
    const libraryPath = await makeTempDir();
    const localPath = path.join(libraryPath, "local-skill");
    const githubPath = path.join(libraryPath, "github-skill");
    const unknownPath = path.join(libraryPath, "unknown-skill");
    await fs.ensureDir(localPath);
    await fs.ensureDir(githubPath);
    await fs.ensureDir(unknownPath);

    await fs.writeJson(path.join(libraryPath, "skiller.manifest.json"), {
      version: 1,
      skills: [
        { ...metadataFor(localPath), id: "local-skill", name: "Local Skill", source: { type: "local" } },
        {
          ...metadataFor(githubPath),
          id: "github-skill",
          name: "GitHub Skill",
          source: {
            type: "github",
            githubUrl: "https://github.com/example/skills",
            githubPath: "skills/github-skill",
            ref: "main",
            commit: "abc123"
          }
        },
        {
          ...metadataFor(unknownPath),
          id: "unknown-skill",
          name: "Unknown Skill",
          source: { type: "missing-type", value: 1 }
        }
      ]
    });

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([
      {
        ...metadataFor(localPath),
        id: "local-skill",
        name: "Local Skill",
        source: { type: "local", path: localPath }
      },
      {
        ...metadataFor(githubPath),
        id: "github-skill",
        name: "GitHub Skill",
        source: {
          type: "github",
          githubUrl: "https://github.com/example/skills",
          githubPath: "skills/github-skill",
          ref: "main",
          commit: "abc123"
        }
      },
      {
        ...metadataFor(unknownPath),
        id: "unknown-skill",
        name: "Unknown Skill",
        source: { type: "unknown" }
      }
    ]);
  });
```

- [ ] **Step 2: Run the focused metadata test and verify it fails**

Run:

```bash
pnpm --filter @skiller/core test -- metadata-store.test.ts
```

Expected: FAIL because local sources do not gain a `path`, `githubPath` is not typed, and invalid source records are preserved.

- [ ] **Step 3: Replace the `SkillSource` interface**

In `packages/core/src/types.ts`, replace the current `SkillSource` interface with this union:

```ts
export type SkillSource =
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

- [ ] **Step 4: Update existing metadata-store fixtures**

In `packages/core/src/metadata-store.test.ts`, change `metadataFor` so existing tests expect normalized local provenance:

```ts
function metadataFor(libraryPath: string): SkillMetadata {
  return {
    id: "example-skill",
    name: "Example Skill",
    libraryPath,
    source: { type: "local", path: libraryPath },
    installedAt: "2026-05-09T00:00:00.000Z",
    keepUpdated: false,
    validation: { valid: true, issues: [] },
    enabled: true
  };
}
```

- [ ] **Step 5: Normalize source records in `MetadataStore`**

In `packages/core/src/metadata-store.ts`, change the import and add `normalizeSource` above `normalizeMetadata`:

```ts
import type { SkillMetadata, SkillSource } from "./types.js";
```

```ts
function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeSource(metadata: SkillMetadata): SkillSource {
  const source = metadata.source as unknown;
  if (typeof source !== "object" || source === null) return { type: "unknown" };

  const record = source as Record<string, unknown>;

  if (record.type === "skills.sh") {
    const skillsShId = stringField(record, "skillsShId") ?? metadata.id;
    const githubUrl = stringField(record, "githubUrl");
    if (!githubUrl) return { type: "unknown" };

    return {
      type: "skills.sh",
      skillsShId,
      githubUrl,
      ...(stringField(record, "githubPath") ? { githubPath: stringField(record, "githubPath") } : {}),
      ...(stringField(record, "ref") ? { ref: stringField(record, "ref") } : {}),
      ...(stringField(record, "commit") ? { commit: stringField(record, "commit") } : {})
    };
  }

  if (record.type === "github") {
    const githubUrl = stringField(record, "githubUrl");
    if (!githubUrl) return { type: "unknown" };

    return {
      type: "github",
      githubUrl,
      ...(stringField(record, "githubPath") ? { githubPath: stringField(record, "githubPath") } : {}),
      ...(stringField(record, "ref") ? { ref: stringField(record, "ref") } : {}),
      ...(stringField(record, "commit") ? { commit: stringField(record, "commit") } : {})
    };
  }

  if (record.type === "local") {
    return { type: "local", path: stringField(record, "path") ?? metadata.libraryPath };
  }

  if (record.type === "unknown") {
    const discoveredFrom = stringField(record, "discoveredFrom");
    return discoveredFrom ? { type: "unknown", discoveredFrom } : { type: "unknown" };
  }

  return { type: "unknown" };
}
```

Then replace `normalizeMetadata` with:

```ts
function normalizeMetadata(metadata: SkillMetadata): SkillMetadata {
  return {
    ...metadata,
    source: normalizeSource(metadata),
    enabled: typeof metadata.enabled === "boolean" ? metadata.enabled : true
  };
}
```

- [ ] **Step 6: Run the focused metadata test and verify it passes**

Run:

```bash
pnpm --filter @skiller/core test -- metadata-store.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/metadata-store.ts packages/core/src/metadata-store.test.ts
git commit -m "feat: normalize skill provenance metadata"
```

---

### Task 2: GitHub and Registry Source Fetching

**Files:**
- Create: `packages/core/src/source-fetcher.ts`
- Create: `packages/core/src/source-fetcher.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing source fetcher tests**

Create `packages/core/src/source-fetcher.test.ts`:

```ts
import fs from "fs-extra";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractRegistrySkillSource,
  fetchGithubSkillSource,
  parseGithubRepository
} from "./source-fetcher.js";

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((item) => fs.remove(item)));
});

describe("source-fetcher", () => {
  it("parses GitHub repository URLs", () => {
    expect(parseGithubRepository("https://github.com/example/skills.git")).toEqual({
      owner: "example",
      repo: "skills"
    });
    expect(parseGithubRepository("https://example.com/example/skills")).toBeNull();
  });

  it("extracts source fields from registry payloads", () => {
    expect(
      extractRegistrySkillSource({
        id: "agent-browser",
        githubUrl: "https://github.com/example/skills",
        githubPath: "agent-browser",
        ref: "main"
      })
    ).toEqual({
      skillsShId: "agent-browser",
      githubUrl: "https://github.com/example/skills",
      githubPath: "agent-browser",
      ref: "main"
    });

    expect(
      extractRegistrySkillSource({
        slug: "browser-use",
        repositoryUrl: "https://github.com/example/browser-use",
        path: "skills/browser-use",
        branch: "stable"
      })
    ).toEqual({
      skillsShId: "browser-use",
      githubUrl: "https://github.com/example/browser-use",
      githubPath: "skills/browser-use",
      ref: "stable"
    });
  });

  it("downloads only the requested GitHub path into a temporary source directory", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: "abc123" })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tree: [
              { type: "blob", path: "skills/agent-browser/SKILL.md" },
              { type: "blob", path: "skills/agent-browser/assets/icon.txt" },
              { type: "blob", path: "skills/other/SKILL.md" },
              { type: "tree", path: "skills/agent-browser/assets" }
            ]
          })
        )
      )
      .mockResolvedValueOnce(new Response("---\nname: agent-browser\n---\n"))
      .mockResolvedValueOnce(new Response("icon"));

    const fetched = await fetchGithubSkillSource({
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/agent-browser",
      ref: "main",
      fetchImpl
    });
    cleanupPaths.push(fetched.rootPath);

    expect(fetched.resolved).toEqual({
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/agent-browser",
      ref: "main",
      commit: "abc123"
    });
    await expect(fs.readFile(path.join(fetched.sourcePath, "SKILL.md"), "utf8")).resolves.toContain("agent-browser");
    await expect(fs.readFile(path.join(fetched.sourcePath, "assets", "icon.txt"), "utf8")).resolves.toBe("icon");
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://raw.githubusercontent.com/example/skills/abc123/skills/agent-browser/SKILL.md",
      expect.any(Object)
    );
  });

  it("rejects GitHub sources without a skill file", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: "abc123" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tree: [{ type: "blob", path: "README.md" }] })));

    await expect(
      fetchGithubSkillSource({
        githubUrl: "https://github.com/example/skills",
        fetchImpl
      })
    ).rejects.toThrow("GitHub source does not contain SKILL.md");
  });
});
```

- [ ] **Step 2: Run source fetcher tests and verify they fail**

Run:

```bash
pnpm --filter @skiller/core test -- source-fetcher.test.ts
```

Expected: FAIL because `source-fetcher.ts` does not exist.

- [ ] **Step 3: Add `source-fetcher.ts`**

Create `packages/core/src/source-fetcher.ts`:

```ts
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";

export interface GithubRepository {
  owner: string;
  repo: string;
}

export interface FetchGithubSkillSourceInput {
  githubUrl: string;
  githubPath?: string;
  ref?: string;
  fetchImpl?: typeof fetch;
}

export interface FetchedGithubSkillSource {
  rootPath: string;
  sourcePath: string;
  resolved: {
    githubUrl: string;
    githubPath?: string;
    ref: string;
    commit: string;
  };
}

export interface RegistrySkillSource {
  skillsShId: string;
  githubUrl: string;
  githubPath?: string;
  ref?: string;
}

interface GithubTreeEntry {
  path?: unknown;
  type?: unknown;
}

export function parseGithubRepository(githubUrl: string): GithubRepository | null {
  const match = githubUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?].*)?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function firstString(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

export function extractRegistrySkillSource(payload: Record<string, unknown>): RegistrySkillSource {
  const skillsShId = firstString(payload, ["id", "slug", "name"]);
  const githubUrl = firstString(payload, ["githubUrl", "github_url", "repositoryUrl", "repoUrl", "sourceUrl"]);
  const githubPath = firstString(payload, ["githubPath", "github_path", "path", "skillPath", "directory"]);
  const ref = firstString(payload, ["ref", "branch", "tag"]);

  if (!skillsShId) throw new Error("skills.sh payload is missing an id");
  if (!githubUrl) throw new Error("skills.sh payload is missing a GitHub URL");

  return {
    skillsShId,
    githubUrl,
    ...(githubPath ? { githubPath } : {}),
    ...(ref ? { ref } : {})
  };
}

async function fetchJson(fetchImpl: typeof fetch, url: string): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "skiller" } });
  if (!response.ok) throw new Error(`GitHub source fetch failed: ${response.status} ${response.statusText}`);
  return response.json() as Promise<Record<string, unknown>>;
}

async function fetchBytes(fetchImpl: typeof fetch, url: string): Promise<Buffer> {
  const response = await fetchImpl(url, { headers: { "User-Agent": "skiller" } });
  if (!response.ok) throw new Error(`GitHub source file fetch failed: ${response.status} ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

function normalizeGithubPath(githubPath?: string): string {
  return (githubPath ?? "").replace(/^\/+|\/+$/g, "");
}

function relativeTreePath(entryPath: string, githubPath: string): string | null {
  if (githubPath === "") return entryPath;
  if (entryPath === githubPath) return "";
  const prefix = `${githubPath}/`;
  return entryPath.startsWith(prefix) ? entryPath.slice(prefix.length) : null;
}

export async function fetchGithubSkillSource(input: FetchGithubSkillSourceInput): Promise<FetchedGithubSkillSource> {
  const repository = parseGithubRepository(input.githubUrl);
  if (!repository) throw new Error(`Unsupported GitHub URL: ${input.githubUrl}`);

  const fetchImpl = input.fetchImpl ?? fetch;
  const ref = input.ref ?? "HEAD";
  const commitPayload = await fetchJson(
    fetchImpl,
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/commits/${encodeURIComponent(ref)}`
  );
  const commit = typeof commitPayload.sha === "string" && commitPayload.sha.length > 0 ? commitPayload.sha : undefined;
  if (!commit) throw new Error("GitHub commit lookup did not return a sha");

  const treePayload = await fetchJson(
    fetchImpl,
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/git/trees/${commit}?recursive=1`
  );
  const tree = Array.isArray(treePayload.tree) ? (treePayload.tree as GithubTreeEntry[]) : [];
  const githubPath = normalizeGithubPath(input.githubPath);
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-github-source-"));
  const sourcePath = path.join(rootPath, "source");
  await fs.ensureDir(sourcePath);

  let copiedSkillFile = false;

  for (const entry of tree) {
    if (entry.type !== "blob" || typeof entry.path !== "string") continue;
    const relativePath = relativeTreePath(entry.path, githubPath);
    if (relativePath === null || relativePath === "") continue;

    const destination = path.join(sourcePath, relativePath);
    await fs.ensureDir(path.dirname(destination));
    const content = await fetchBytes(
      fetchImpl,
      `https://raw.githubusercontent.com/${repository.owner}/${repository.repo}/${commit}/${entry.path}`
    );
    await fs.writeFile(destination, content);
    if (relativePath === "SKILL.md") copiedSkillFile = true;
  }

  if (!copiedSkillFile) {
    await fs.remove(rootPath);
    throw new Error("GitHub source does not contain SKILL.md");
  }

  return {
    rootPath,
    sourcePath,
    resolved: {
      githubUrl: input.githubUrl,
      ...(githubPath ? { githubPath } : {}),
      ref,
      commit
    }
  };
}
```

- [ ] **Step 4: Export the source fetcher**

Add this line to `packages/core/src/index.ts`:

```ts
export * from "./source-fetcher.js";
```

- [ ] **Step 5: Run source fetcher tests**

Run:

```bash
pnpm --filter @skiller/core test -- source-fetcher.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/source-fetcher.ts packages/core/src/source-fetcher.test.ts packages/core/src/index.ts
git commit -m "feat: fetch skills from github sources"
```

---

### Task 3: Provenance-Aware Installers

**Files:**
- Modify: `packages/core/src/installer.ts`
- Modify: `packages/core/src/installer.test.ts`

- [ ] **Step 1: Write failing installer tests**

Add imports in `packages/core/src/installer.test.ts`:

```ts
import { installGithubSkill, installSkillsShSkill } from "./installer.js";
```

Add these tests inside `describe("installLocalSkill", ...)`:

```ts
  it("stores the original local path and parsed description", async () => {
    const source = path.join(tmp, "source");
    const library = path.join(tmp, "library");
    await fs.ensureDir(source);
    await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: local\ndescription: Local description.\n---\n");

    const metadata = await installLocalSkill({ sourcePath: source, libraryPath: library });

    expect(metadata.description).toBe("Local description.");
    expect(metadata.source).toEqual({ type: "local", path: source });
  });
```

Add a new describe block in the same file:

```ts
describe("remote installers", () => {
  it("installs a GitHub skill with source metadata", async () => {
    const library = path.join(tmp, "library");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: "abc123" })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tree: [{ type: "blob", path: "skills/browser/SKILL.md" }] }))
      )
      .mockResolvedValueOnce(new Response("---\nname: browser\ndescription: Browser skill.\n---\n"));

    const metadata = await installGithubSkill({
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/browser",
      ref: "main",
      libraryPath: library,
      fetchImpl
    });

    expect(metadata).toMatchObject({
      id: "browser",
      name: "browser",
      description: "Browser skill.",
      source: {
        type: "github",
        githubUrl: "https://github.com/example/skills",
        githubPath: "skills/browser",
        ref: "main",
        commit: "abc123"
      },
      keepUpdated: true
    });
    await expect(fs.pathExists(path.join(library, "browser", "SKILL.md"))).resolves.toBe(true);
  });

  it("installs a skills.sh skill through its registry source", async () => {
    const library = path.join(tmp, "library");
    const client = {
      skill: vi.fn(async () => ({
        id: "registry-browser",
        githubUrl: "https://github.com/example/skills",
        githubPath: "skills/registry-browser",
        ref: "stable"
      }))
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: "def456" })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tree: [{ type: "blob", path: "skills/registry-browser/SKILL.md" }] }))
      )
      .mockResolvedValueOnce(new Response("---\nname: registry-browser\n---\n"));

    const metadata = await installSkillsShSkill({
      skillsShId: "registry-browser",
      libraryPath: library,
      client,
      fetchImpl
    });

    expect(client.skill).toHaveBeenCalledWith("registry-browser");
    expect(metadata.source).toEqual({
      type: "skills.sh",
      skillsShId: "registry-browser",
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/registry-browser",
      ref: "stable",
      commit: "def456"
    });
    expect(metadata.keepUpdated).toBe(true);
  });
});
```

- [ ] **Step 2: Run installer tests and verify they fail**

Run:

```bash
pnpm --filter @skiller/core test -- installer.test.ts
```

Expected: FAIL because remote installer exports and local source path metadata do not exist.

- [ ] **Step 3: Refactor installer parsing and shared install logic**

In `packages/core/src/installer.ts`, replace `parseSkillName` with:

```ts
function parseSkillInfo(markdown: string, fallbackName: string): { name: string; description?: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { name: fallbackName };

  try {
    const frontmatter = YAML.parse(match[1]) ?? {};
    const name =
      typeof frontmatter === "object" &&
      frontmatter !== null &&
      "name" in frontmatter &&
      typeof frontmatter.name === "string" &&
      frontmatter.name.trim()
        ? frontmatter.name.trim()
        : fallbackName;
    const description =
      typeof frontmatter === "object" &&
      frontmatter !== null &&
      "description" in frontmatter &&
      typeof frontmatter.description === "string" &&
      frontmatter.description.trim()
        ? frontmatter.description.trim()
        : undefined;

    return { name, ...(description ? { description } : {}) };
  } catch {
    return { name: fallbackName };
  }
}
```

Add imports:

```ts
import { SkillsShClient } from "./skills-sh-client.js";
import { extractRegistrySkillSource, fetchGithubSkillSource } from "./source-fetcher.js";
import type { SkillSource } from "./types.js";
```

Add input interfaces after `InstallLocalSkillInput`:

```ts
export interface InstallGithubSkillInput {
  githubUrl: string;
  githubPath?: string;
  ref?: string;
  libraryPath: string;
  fetchImpl?: typeof fetch;
}

export interface InstallSkillsShSkillInput {
  skillsShId: string;
  libraryPath: string;
  client?: Pick<SkillsShClient, "skill">;
  fetchImpl?: typeof fetch;
}
```

Add this helper above `installLocalSkill`:

```ts
async function installSkillFromDirectory(input: {
  sourcePath: string;
  libraryPath: string;
  source: SkillSource;
  keepUpdated: boolean;
}): Promise<SkillMetadata> {
  const skillMd = await fs.readFile(path.join(input.sourcePath, "SKILL.md"), "utf8");
  const skillInfo = parseSkillInfo(skillMd, path.basename(input.sourcePath));
  const slug = slugifySkillId(skillInfo.name);
  const id = await uniqueSkillId(input.libraryPath, slug);
  const librarySkillPath = await copySkillToLibrary(input.sourcePath, input.libraryPath, id);
  const validation = await validateSkill(librarySkillPath);

  const metadata: SkillMetadata = {
    id,
    name: skillInfo.name,
    ...(skillInfo.description ? { description: skillInfo.description } : {}),
    libraryPath: librarySkillPath,
    source: input.source,
    installedAt: new Date().toISOString(),
    contentHash: await hashDirectory(librarySkillPath),
    keepUpdated: input.keepUpdated,
    enabled: true,
    validation
  };

  await new MetadataStore(input.libraryPath).save(metadata);
  return metadata;
}
```

- [ ] **Step 4: Replace `installLocalSkill` and add remote installers**

Replace `installLocalSkill` with:

```ts
export async function installLocalSkill(input: InstallLocalSkillInput): Promise<SkillMetadata> {
  return installSkillFromDirectory({
    sourcePath: input.sourcePath,
    libraryPath: input.libraryPath,
    source: { type: "local", path: input.sourcePath },
    keepUpdated: false
  });
}
```

Add:

```ts
export async function installGithubSkill(input: InstallGithubSkillInput): Promise<SkillMetadata> {
  const fetched = await fetchGithubSkillSource(input);
  try {
    return await installSkillFromDirectory({
      sourcePath: fetched.sourcePath,
      libraryPath: input.libraryPath,
      source: { type: "github", ...fetched.resolved },
      keepUpdated: true
    });
  } finally {
    await fs.remove(fetched.rootPath);
  }
}

export async function installSkillsShSkill(input: InstallSkillsShSkillInput): Promise<SkillMetadata> {
  const client = input.client ?? new SkillsShClient();
  const registryPayload = await client.skill(input.skillsShId);
  const registrySource = extractRegistrySkillSource(registryPayload);
  const fetched = await fetchGithubSkillSource({
    githubUrl: registrySource.githubUrl,
    githubPath: registrySource.githubPath,
    ref: registrySource.ref,
    fetchImpl: input.fetchImpl
  });

  try {
    return await installSkillFromDirectory({
      sourcePath: fetched.sourcePath,
      libraryPath: input.libraryPath,
      source: {
        type: "skills.sh",
        skillsShId: registrySource.skillsShId,
        ...fetched.resolved
      },
      keepUpdated: true
    });
  } finally {
    await fs.remove(fetched.rootPath);
  }
}
```

- [ ] **Step 5: Run installer tests**

Run:

```bash
pnpm --filter @skiller/core test -- installer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/installer.ts packages/core/src/installer.test.ts
git commit -m "feat: install skills with provenance"
```

---

### Task 4: Imported Skill Provenance and Update Filtering

**Files:**
- Modify: `packages/core/src/scanner.ts`
- Modify: `packages/core/src/scanner.test.ts`
- Modify: `packages/core/src/updater.ts`
- Modify: `packages/core/src/updater.test.ts`

- [ ] **Step 1: Write scanner provenance test**

In `packages/core/src/scanner.test.ts`, update the existing `"imports real skill folders and replaces them with symlinks"` test by adding this assertion after `expect(result.imported).toHaveLength(1);`:

```ts
    expect(result.imported[0]?.source).toEqual({ type: "unknown", discoveredFrom: skill });
```

- [ ] **Step 2: Write updater filtering tests**

Add these tests to `packages/core/src/updater.test.ts` inside `describe("checkForSkillUpdates", ...)`:

```ts
  it("considers only sources with an upstream during broad update checks", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);
    await store.save(metadataFor(libraryPath, "local-skill", true, { type: "local", path: "/source/local-skill" }));
    await store.save(metadataFor(libraryPath, "unknown-skill", true, { type: "unknown", discoveredFrom: "/target/unknown-skill" }));
    await store.save(
      metadataFor(libraryPath, "github-skill", true, {
        type: "github",
        githubUrl: "https://github.com/example/github-skill",
        ref: "main",
        commit: "abc123"
      })
    );
    await store.save(
      metadataFor(libraryPath, "registry-skill", true, {
        type: "skills.sh",
        skillsShId: "registry-skill",
        githubUrl: "https://github.com/example/registry-skill",
        ref: "main",
        commit: "def456"
      })
    );

    const result = await checkForSkillUpdates({
      libraryPath,
      config: configFor(libraryPath, true),
      metadataStore: store,
      remoteResolver: vi.fn(async () => null),
      now: () => checkedAt
    });

    expect(result.considered.map((skill) => skill.id)).toEqual(["github-skill", "registry-skill"]);
    expect((await store.list()).find((skill) => skill.id === "local-skill")?.lastCheckedAt).toBeUndefined();
    expect((await store.list()).find((skill) => skill.id === "unknown-skill")?.lastCheckedAt).toBeUndefined();
  });

  it("reports skills.sh updates through an injected resolver", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);
    await store.save(
      metadataFor(libraryPath, "registry-skill", false, {
        type: "skills.sh",
        skillsShId: "registry-skill",
        githubUrl: "https://github.com/example/registry-skill",
        ref: "main",
        commit: "abc123"
      })
    );

    const result = await checkForSkillUpdates({
      libraryPath,
      config: configFor(libraryPath),
      skillId: "registry-skill",
      metadataStore: store,
      remoteResolver: vi.fn(async () => "def456"),
      now: () => checkedAt
    });

    expect(result.available).toEqual([
      {
        id: "registry-skill",
        name: "registry-skill",
        currentCommit: "abc123",
        remoteCommit: "def456"
      }
    ]);
  });
```

- [ ] **Step 3: Update existing updater fixtures for the stricter source union**

In `packages/core/src/updater.test.ts`, change the default source in `metadataFor`:

```ts
function metadataFor(
  libraryPath: string,
  id: string,
  keepUpdated: boolean,
  source: SkillMetadata["source"] = { type: "local", path: path.join(libraryPath, id) }
): SkillMetadata {
```

In the `"checks keep-updated skills and stamps only considered metadata"` test, change the `manual` record to an upstream source:

```ts
    await store.save(
      metadataFor(libraryPath, "manual", true, {
        type: "github",
        githubUrl: "https://github.com/example/manual",
        ref: "main",
        commit: "abc123"
      })
    );
```

In the `"checks all skills when the config opts into keeping all skills updated"` test, change both saved records:

```ts
    await store.save(
      metadataFor(libraryPath, "first", false, {
        type: "github",
        githubUrl: "https://github.com/example/first",
        ref: "main",
        commit: "abc123"
      })
    );
    await store.save(
      metadataFor(libraryPath, "second", false, {
        type: "github",
        githubUrl: "https://github.com/example/second",
        ref: "main",
        commit: "def456"
      })
    );
```

In the `"returns null for unresolvable github sources"` test, change the local source assertion:

```ts
    await expect(resolveGithubRemoteCommit({ type: "local", path: "/source/local" })).resolves.toBeNull();
```

- [ ] **Step 4: Run scanner and updater tests and verify failures**

Run:

```bash
pnpm --filter @skiller/core test -- scanner.test.ts updater.test.ts
```

Expected: FAIL because scanner does not record `discoveredFrom` and updater still considers local records.

- [ ] **Step 5: Record imported target paths**

In `packages/core/src/scanner.ts`, change the imported metadata source assignment from:

```ts
source: { type: "unknown" },
```

to:

```ts
source: { type: "unknown", discoveredFrom: targetSkillPath },
```

- [ ] **Step 6: Update upstream source selection**

In `packages/core/src/updater.ts`, replace `hasResolvableGithubSource` with:

```ts
function hasUpdateableSource(source: SkillSource): source is Extract<SkillSource, { type: "github" | "skills.sh" }> & {
  githubUrl: string;
  ref: string;
  commit: string;
} {
  return (
    (source.type === "github" || source.type === "skills.sh") &&
    typeof source.githubUrl === "string" &&
    source.githubUrl.length > 0 &&
    typeof source.ref === "string" &&
    source.ref.length > 0 &&
    typeof source.commit === "string" &&
    source.commit.length > 0
  );
}
```

Change `resolveGithubRemoteCommit` to use `hasUpdateableSource`:

```ts
export async function resolveGithubRemoteCommit(source: SkillSource): Promise<string | null> {
  if (!hasUpdateableSource(source)) return null;
```

Change selected skills in `checkForSkillUpdates`:

```ts
  const selected = skills.filter(
    (metadata) => shouldConsiderSkill(metadata, input.config, input.skillId) && hasUpdateableSource(metadata.source)
  );
```

Change the loop condition:

```ts
    if (hasUpdateableSource(metadata.source)) {
```

- [ ] **Step 7: Run scanner and updater tests**

Run:

```bash
pnpm --filter @skiller/core test -- scanner.test.ts updater.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/scanner.ts packages/core/src/scanner.test.ts packages/core/src/updater.ts packages/core/src/updater.test.ts
git commit -m "feat: track imported provenance for updates"
```

---

### Task 5: CLI Install Commands

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/index.test.ts`

- [ ] **Step 1: Write failing CLI tests**

In `packages/cli/src/index.test.ts`, add these tests inside `describe("cli", ...)`:

```ts
  it("installs GitHub skills through the persisted library path", async () => {
    const printResult = vi.fn();
    const installGithubSkill = vi.fn(async () => ({ id: "github-skill", name: "GitHub Skill" }));
    const program = createProgram({
      printResult,
      installGithubSkill: installGithubSkill as never,
      loadConfig: async () => ({
        libraryPath: "~/persisted-skiller",
        targets: [],
        updateSchedule: { intervalHours: 24 },
        keepAllSkillsUpdated: false,
        launchAtLogin: false,
        trayEnabled: true
      }),
      expandHome: (value) => value.replace("~", "/home/test")
    });

    await program.parseAsync([
      "node",
      "skiller",
      "install-github",
      "https://github.com/example/skills",
      "--path",
      "skills/github-skill",
      "--ref",
      "main"
    ]);

    expect(installGithubSkill).toHaveBeenCalledWith({
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/github-skill",
      ref: "main",
      libraryPath: "/home/test/persisted-skiller"
    });
    expect(printResult).toHaveBeenCalledWith("installed GitHub Skill", false);
  });

  it("installs skills.sh skills through the persisted library path", async () => {
    const printResult = vi.fn();
    const metadata = { id: "registry-skill", name: "Registry Skill" };
    const program = createProgram({
      printResult,
      installSkillsShSkill: vi.fn(async () => metadata) as never,
      loadConfig: async () => ({
        libraryPath: "~/persisted-skiller",
        targets: [],
        updateSchedule: { intervalHours: 24 },
        keepAllSkillsUpdated: false,
        launchAtLogin: false,
        trayEnabled: true
      }),
      expandHome: (value) => value.replace("~", "/home/test")
    });

    await program.parseAsync(["node", "skiller", "install-registry", "registry-skill", "--json"]);

    expect(printResult).toHaveBeenCalledWith(metadata, true);
  });
```

- [ ] **Step 2: Run CLI tests and verify they fail**

Run:

```bash
pnpm --filter @skiller/cli test -- index.test.ts
```

Expected: FAIL because `createProgram` does not accept the new dependency keys and commands do not exist.

- [ ] **Step 3: Add installer dependencies**

In `packages/cli/src/index.ts`, add imports from `@skiller/core`:

```ts
  installGithubSkill,
  installSkillsShSkill,
```

Add these fields to `CliDependencies`:

```ts
  installGithubSkill: typeof installGithubSkill;
  installSkillsShSkill: typeof installSkillsShSkill;
```

Add these fields to `defaultDependencies()`:

```ts
    installGithubSkill,
    installSkillsShSkill,
```

- [ ] **Step 4: Add install commands**

Add these commands after the existing `install` command:

```ts
  program
    .command("install-github")
    .argument("<url>")
    .option("--path <path>", "path inside the repository")
    .option("--ref <ref>", "branch, tag, or commit")
    .option("--json", "print JSON")
    .action(async (githubUrl: string, options: { path?: string; ref?: string; json?: boolean }) => {
      const config = await deps.loadConfig();
      const metadata = await deps.installGithubSkill({
        githubUrl,
        ...(options.path ? { githubPath: options.path } : {}),
        ...(options.ref ? { ref: options.ref } : {}),
        libraryPath: deps.expandHome(config.libraryPath)
      });
      deps.printResult(options.json ? metadata : `installed ${metadata.name}`, Boolean(options.json));
    });

  program
    .command("install-registry")
    .argument("<skills-sh-id>")
    .option("--json", "print JSON")
    .action(async (skillsShId: string, options: { json?: boolean }) => {
      const config = await deps.loadConfig();
      const metadata = await deps.installSkillsShSkill({
        skillsShId,
        libraryPath: deps.expandHome(config.libraryPath)
      });
      deps.printResult(options.json ? metadata : `installed ${metadata.name}`, Boolean(options.json));
    });
```

- [ ] **Step 5: Run CLI tests**

Run:

```bash
pnpm --filter @skiller/cli test -- index.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/src/index.test.ts
git commit -m "feat: add provenance install commands"
```

---

### Task 6: Desktop IPC and Renderer API

**Files:**
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/preload.cts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Modify: `apps/desktop/tests/preload.test.ts`

- [ ] **Step 1: Write failing preload test**

In `apps/desktop/tests/preload.test.ts`, add assertions to the existing test:

```ts
    expect(preloadSource).toContain("installLocal");
    expect(preloadSource).toContain("installGithub");
    expect(preloadSource).toContain("installRegistry");
```

- [ ] **Step 2: Run preload test and verify it fails**

Run:

```bash
pnpm --filter @skiller/desktop test -- preload.test.ts
```

Expected: FAIL because the preload bridge does not expose install methods.

- [ ] **Step 3: Add IPC handlers**

In `apps/desktop/src/main/ipc.ts`, update imports:

```ts
import {
  MetadataStore,
  SkillsShClient,
  expandHome,
  installGithubSkill,
  installLocalSkill,
  installSkillsShSkill,
  loadConfig,
  saveConfig,
  scanTargets
} from "@skiller/core";
import { dialog } from "electron";
```

Add handlers inside `registerIpcHandlers()` after `library:set-enabled`:

```ts
  ipcMain.handle("library:install-local", async () => {
    const selection = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Add Skill Folder"
    });
    if (selection.canceled || !selection.filePaths[0]) return null;

    const config = await loadConfig();
    const libraryPath = expandHome(config.libraryPath);
    const metadata = await installLocalSkill({ sourcePath: selection.filePaths[0], libraryPath });
    await scanConfig(config);
    return metadata;
  });

  ipcMain.handle(
    "library:install-github",
    async (_event, input: { githubUrl: string; githubPath?: string; ref?: string }) => {
      const config = await loadConfig();
      const libraryPath = expandHome(config.libraryPath);
      const metadata = await installGithubSkill({
        githubUrl: input.githubUrl,
        ...(input.githubPath ? { githubPath: input.githubPath } : {}),
        ...(input.ref ? { ref: input.ref } : {}),
        libraryPath
      });
      await scanConfig(config);
      return metadata;
    }
  );

  ipcMain.handle("library:install-registry", async (_event, skillsShId: string) => {
    const config = await loadConfig();
    const libraryPath = expandHome(config.libraryPath);
    const metadata = await installSkillsShSkill({ skillsShId, libraryPath, client: skillsShClient });
    await scanConfig(config);
    return metadata;
  });

  ipcMain.handle("discover:skill", async (_event, id: string) => {
    return skillsShClient.skill(id);
  });

  ipcMain.handle("discover:audit", async (_event, id: string) => {
    return skillsShClient.audit(id);
  });
```

- [ ] **Step 4: Expose preload methods**

In `apps/desktop/src/preload.cts`, add methods to the exposed object:

```ts
  installLocal: () => ipcRenderer.invoke("library:install-local"),
  installGithub: (input: { githubUrl: string; githubPath?: string; ref?: string }) =>
    ipcRenderer.invoke("library:install-github", input),
  installRegistry: (skillsShId: string) => ipcRenderer.invoke("library:install-registry", skillsShId),
  registrySkill: (id: string) => ipcRenderer.invoke("discover:skill", id),
  registryAudit: (id: string) => ipcRenderer.invoke("discover:audit", id),
```

- [ ] **Step 5: Update renderer API types and preview implementation**

In `apps/desktop/src/renderer/lib/api.ts`, replace `SkillSource` with the core union from Task 1, add `contentHash?: string` to `SkillMetadata`, and add install methods to `SkillerApi`:

```ts
  installLocal: () => Promise<SkillMetadata | null>;
  installGithub: (input: { githubUrl: string; githubPath?: string; ref?: string }) => Promise<SkillMetadata>;
  installRegistry: (skillsShId: string) => Promise<SkillMetadata>;
  registrySkill: (id: string) => Promise<DiscoverSkill>;
  registryAudit: (id: string) => Promise<DiscoverSkill>;
```

Change the preview fallback local source:

```ts
    source: { type: "local", path: "~/skiller/example-skill" },
```

In `createBrowserPreviewApi()`, add implementations:

```ts
    installLocal: async () => null,
    installGithub: async (input) => {
      const skill: SkillMetadata = {
        id: "github-preview",
        name: "github-preview",
        description: "GitHub preview skill",
        libraryPath: "~/skiller/github-preview",
        source: {
          type: "github",
          githubUrl: input.githubUrl,
          ...(input.githubPath ? { githubPath: input.githubPath } : {}),
          ...(input.ref ? { ref: input.ref } : {}),
          commit: "preview"
        },
        installedAt: new Date().toISOString(),
        keepUpdated: true,
        enabled: true,
        validation: { valid: true, issues: [] }
      };
      fallbackSkills.push(skill);
      return skill;
    },
    installRegistry: async (skillsShId) => {
      const skill: SkillMetadata = {
        id: skillsShId,
        name: skillsShId,
        description: "Registry preview skill",
        libraryPath: `~/skiller/${skillsShId}`,
        source: {
          type: "skills.sh",
          skillsShId,
          githubUrl: "https://github.com/example/skills",
          ref: "main",
          commit: "preview"
        },
        installedAt: new Date().toISOString(),
        keepUpdated: true,
        enabled: true,
        validation: { valid: true, issues: [] }
      };
      fallbackSkills.push(skill);
      return skill;
    },
    registrySkill: async (id) => fallbackDiscoverSkills.find((skill) => skill.id === id) ?? { id },
    registryAudit: async () => ({ status: "unknown" }),
```

- [ ] **Step 6: Run desktop tests**

Run:

```bash
pnpm --filter @skiller/desktop test -- preload.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/main/ipc.ts apps/desktop/src/preload.cts apps/desktop/src/renderer/lib/api.ts apps/desktop/tests/preload.test.ts
git commit -m "feat: expose provenance install ipc"
```

---

### Task 7: Desktop Provenance UI

**Files:**
- Modify: `apps/desktop/src/renderer/App.tsx`
- Modify: `apps/desktop/src/renderer/pages/LibraryPage.tsx`
- Modify: `apps/desktop/src/renderer/pages/DiscoverPage.tsx`
- Modify: `apps/desktop/src/renderer/pages/UpdatesPage.tsx`
- Modify: `e2e/skiller.spec.ts`

- [ ] **Step 1: Write failing e2e tests**

Append these tests to `e2e/skiller.spec.ts`:

```ts
test("shows provenance in the library and navigates to discover", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("columnheader", { name: "Source" })).toBeVisible();
  await expect(page.getByText("Local")).toBeVisible();

  await page.getByRole("button", { name: "Browse registry" }).click();
  await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
});

test("installs a registry result from Discover preview mode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Discover" }).click();

  await page.getByRole("row", { name: /agent-browser/ }).getByRole("button", { name: "Install" }).click();
  await expect(page.getByRole("row", { name: /agent-browser/ }).getByRole("button", { name: "Installed" })).toBeVisible();

  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("cell", { name: "agent-browser" })).toBeVisible();
  await expect(page.getByText("Registry")).toBeVisible();
});

test("lists updateable skills on the Updates page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Discover" }).click();
  await page.getByRole("row", { name: /agent-browser/ }).getByRole("button", { name: "Install" }).click();
  await page.getByRole("button", { name: "Updates" }).click();

  await expect(page.getByRole("columnheader", { name: "Source" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "agent-browser" })).toBeVisible();
  await expect(page.getByText("Registry")).toBeVisible();
});
```

- [ ] **Step 2: Run e2e tests and verify they fail**

Run:

```bash
pnpm test:e2e
```

Expected: FAIL because the renderer does not show provenance, install actions, or updateable rows.

- [ ] **Step 3: Add shared renderer helpers**

At the top of `apps/desktop/src/renderer/pages/LibraryPage.tsx`, add helper functions below the imports:

```ts
function sourceLabel(skill: SkillMetadata): string {
  if (skill.source.type === "skills.sh") return "Registry";
  if (skill.source.type === "github") return "GitHub";
  if (skill.source.type === "local") return "Local";
  return "Unknown";
}

function sourceDetail(skill: SkillMetadata): string {
  if (skill.source.type === "local") return skill.source.path;
  if (skill.source.type === "unknown") return skill.source.discoveredFrom ?? "Untracked source";
  if (skill.source.githubPath) return `${skill.source.githubUrl}/${skill.source.githubPath}`;
  return skill.source.githubUrl;
}

function isUpdateable(skill: SkillMetadata): boolean {
  return (
    (skill.source.type === "github" || skill.source.type === "skills.sh") &&
    Boolean(skill.source.githubUrl && skill.source.ref && skill.source.commit)
  );
}
```

Use the same helper bodies in `UpdatesPage.tsx`. Keep them local to avoid a shared renderer utility file for this pass.

- [ ] **Step 4: Update `App.tsx` to support Browse registry**

Replace the `pageComponents` map usage with a small switch:

```tsx
function renderPage(page: Page, setPage: (page: Page) => void) {
  if (page === "library") return <LibraryPage onBrowseRegistry={() => setPage("discover")} />;
  if (page === "discover") return <DiscoverPage />;
  if (page === "targets") return <TargetsPage />;
  if (page === "updates") return <UpdatesPage />;
  return <SettingsPage />;
}
```

Remove the `pageComponents` constant and `ActivePage` variable. Replace `<ActivePage />` with:

```tsx
            {renderPage(page, setPage)}
```

Change the import line:

```ts
import { useState } from "react";
```

- [ ] **Step 5: Add Library install controls and provenance columns**

Update the imports in `apps/desktop/src/renderer/pages/LibraryPage.tsx`:

```ts
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Input } from "@workspace/ui/components/input";
```

Change the Library component signature:

```ts
export function LibraryPage({ onBrowseRegistry }: { onBrowseRegistry?: () => void }) {
```

Add state:

```ts
  const [githubUrl, setGithubUrl] = useState("");
  const [githubPath, setGithubPath] = useState("");
  const [githubRef, setGithubRef] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
```

Add functions:

```ts
  async function refreshLibrary() {
    const result = await skillerApi.listLibrary();
    setSkills(result);
    setError(null);
  }

  async function installLocal() {
    if (isInstalling) return;
    setIsInstalling(true);
    setError(null);
    try {
      await skillerApi.installLocal();
      await refreshLibrary();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsInstalling(false);
    }
  }

  async function installGithub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isInstalling || githubUrl.trim() === "") return;
    setIsInstalling(true);
    setError(null);
    try {
      await skillerApi.installGithub({
        githubUrl: githubUrl.trim(),
        ...(githubPath.trim() ? { githubPath: githubPath.trim() } : {}),
        ...(githubRef.trim() ? { ref: githubRef.trim() } : {})
      });
      setGithubUrl("");
      setGithubPath("");
      setGithubRef("");
      await refreshLibrary();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsInstalling(false);
    }
  }
```

Change the initial `useEffect` body to call `refreshLibrary()`.

Add action controls before the table:

```tsx
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={installLocal} disabled={isInstalling}>Add from local folder</Button>
          <Button variant="outline" onClick={onBrowseRegistry}>Browse registry</Button>
        </div>
        <form className="grid gap-2 md:grid-cols-[minmax(16rem,1fr)_12rem_10rem_auto]" onSubmit={installGithub}>
          <Input value={githubUrl} onChange={(event) => setGithubUrl(event.target.value)} aria-label="GitHub URL" />
          <Input value={githubPath} onChange={(event) => setGithubPath(event.target.value)} aria-label="Path" />
          <Input value={githubRef} onChange={(event) => setGithubRef(event.target.value)} aria-label="Ref" />
          <Button type="submit" disabled={isInstalling || githubUrl.trim() === ""}>Add from GitHub</Button>
        </form>
```

Change table headers to:

```tsx
                <TableHead>Name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updates</TableHead>
                <TableHead>Enabled</TableHead>
```

Change row cells after the name cell:

```tsx
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="secondary">{sourceLabel(skill)}</Badge>
                      <span className="max-w-80 truncate text-xs text-muted-foreground">{sourceDetail(skill)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {skill.validation?.valid ? (
                      <Badge variant="outline">valid</Badge>
                    ) : (
                      <Badge variant="destructive">invalid</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={isUpdateable(skill) ? "outline" : "secondary"}>
                      {isUpdateable(skill) ? "updateable" : "manual"}
                    </Badge>
                  </TableCell>
```

Change the empty-state colspan to `5`.

- [ ] **Step 6: Add Discover install state and actions**

Add a Badge import in `apps/desktop/src/renderer/pages/DiscoverPage.tsx`:

```ts
import { Badge } from "@workspace/ui/components/badge";
```

In `apps/desktop/src/renderer/pages/DiscoverPage.tsx`, add library state:

```ts
  const [librarySkills, setLibrarySkills] = useState<SkillMetadata[]>([]);
  const [pendingSkillIds, setPendingSkillIds] = useState<Set<string>>(() => new Set());
```

Update import:

```ts
import { skillerApi, type DiscoverSkill, type LeaderboardType, type SkillMetadata } from "../lib/api.js";
```

Add helper:

```ts
function skillId(skill: DiscoverSkill, fallback: string): string {
  return skillText(skill, ["id", "slug", "name"], fallback);
}
```

Add library loading in the existing effect:

```ts
    void skillerApi.listLibrary().then((result) => {
      if (mounted) setLibrarySkills(result);
    });
```

Add install function:

```ts
  async function installRegistry(id: string) {
    setPendingSkillIds((current) => new Set(current).add(id));
    setStatus(`Installing ${id}`);
    try {
      const metadata = await skillerApi.installRegistry(id);
      setLibrarySkills((current) => [...current.filter((skill) => skill.id !== metadata.id), metadata]);
      setStatus(`Installed ${metadata.name}`);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPendingSkillIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }
```

Add installed lookup:

```ts
  const installedRegistryIds = useMemo(
    () =>
      new Set(
        librarySkills
          .filter((skill) => skill.source.type === "skills.sh")
          .map((skill) => skill.source.skillsShId)
      ),
    [librarySkills]
  );
```

Change table headers to include action:

```tsx
                <TableHead>Skill</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Action</TableHead>
```

Change row rendering:

```tsx
              {rows.map((skill, index) => {
                const id = skillId(skill, `skill-${index}`);
                const installed = installedRegistryIds.has(id);
                const pending = pendingSkillIds.has(id);
                return (
                  <TableRow key={id}>
                    <TableCell>{skillText(skill, ["name", "title", "id", "slug"], "Untitled skill")}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {skillText(skill, ["description", "summary"], "No description")}
                    </TableCell>
                    <TableCell><Badge variant="secondary">Registry</Badge></TableCell>
                    <TableCell>
                      <Button
                        variant={installed ? "outline" : "default"}
                        disabled={installed || pending}
                        onClick={() => void installRegistry(id)}
                      >
                        {installed ? "Installed" : pending ? "Installing" : "Install"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
```

Change empty-state colspan to `4`.

- [ ] **Step 7: List updateable skills on Updates page**

In `apps/desktop/src/renderer/pages/UpdatesPage.tsx`, import table and metadata types:

```ts
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { skillerApi, type SkillMetadata, type UpdateCheckSkill } from "../lib/api.js";
```

Add state:

```ts
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [available, setAvailable] = useState<UpdateCheckSkill[]>([]);
```

Add library loading in the effect:

```ts
    void skillerApi.listLibrary().then((result) => setSkills(result));
```

In `checkUpdates`, after `const result = await skillerApi.checkUpdates();`, add:

```ts
      setAvailable(result.available);
      setSkills(await skillerApi.listLibrary());
```

Add derived rows before return:

```ts
  const availableById = new Map(available.map((skill) => [skill.id, skill]));
  const updateableSkills = skills.filter(isUpdateable);
```

Add the table after the check button/status block:

```tsx
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {updateableSkills.map((skill) => {
              const update = availableById.get(skill.id);
              return (
                <TableRow key={skill.id}>
                  <TableCell>{skill.name || skill.id}</TableCell>
                  <TableCell><Badge variant="secondary">{sourceLabel(skill)}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={update ? "default" : "outline"}>
                      {update ? `${update.currentCommit} -> ${update.remoteCommit}` : "current"}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
            {updateableSkills.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  No updateable skills.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
```

- [ ] **Step 8: Run e2e tests**

Run:

```bash
pnpm test:e2e
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/renderer/App.tsx apps/desktop/src/renderer/pages/LibraryPage.tsx apps/desktop/src/renderer/pages/DiscoverPage.tsx apps/desktop/src/renderer/pages/UpdatesPage.tsx e2e/skiller.spec.ts
git commit -m "feat: show provenance in desktop"
```

---

### Task 8: Full Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run core tests**

Run:

```bash
pnpm --filter @skiller/core test
```

Expected: PASS.

- [ ] **Step 2: Run CLI tests**

Run:

```bash
pnpm --filter @skiller/cli test
```

Expected: PASS.

- [ ] **Step 3: Run desktop tests**

Run:

```bash
pnpm --filter @skiller/desktop test
```

Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Run e2e**

Run:

```bash
pnpm test:e2e
```

Expected: PASS.

- [ ] **Step 6: Run build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 7: Commit verification cleanup if needed**

If verification required small fixes, commit the touched files:

```bash
git add packages/core packages/cli apps/desktop e2e
git commit -m "fix: complete provenance verification"
```

If no files changed after Task 7, skip this commit.

---

## Self-Review Notes

Spec coverage: source types are covered by Tasks 1, 3, and 4. Discover install state and actions are covered by Tasks 6 and 7. Library local and GitHub installs are covered by Tasks 3, 6, and 7. Update behavior for skills.sh, GitHub, local, and unknown sources is covered by Task 4. Root manifest normalization is covered by Task 1.

Placeholder scan: the plan contains concrete file paths, commands, expected outcomes, and code snippets for each code-changing step.

Type consistency: `githubPath`, `skillsShId`, `discoveredFrom`, `installGithubSkill`, `installSkillsShSkill`, `installRegistry`, and `isUpdateable` use consistent names across core, CLI, IPC, and renderer steps.
