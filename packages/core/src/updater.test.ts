import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetadataStore } from "./metadata-store.js";
import { checkForSkillUpdates, resolveGithubRemoteCommit } from "./updater.js";
import type { SkillMetadata, SkillerConfig } from "./types.js";

const tempDirs: string[] = [];
const checkedAt = new Date("2026-05-10T12:00:00.000Z");

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-updater-"));
  tempDirs.push(dir);
  return dir;
}

function configFor(libraryPath: string, keepAllSkillsUpdated = false): SkillerConfig {
  return {
    libraryPath,
    targets: [],
    updateSchedule: { intervalHours: 24 },
    keepAllSkillsUpdated,
    launchAtLogin: false,
    trayEnabled: true
  };
}

function metadataFor(
  libraryPath: string,
  id: string,
  keepUpdated: boolean,
  source: SkillMetadata["source"] = { type: "local", path: path.join(libraryPath, id) }
): SkillMetadata {
  return {
    id,
    name: id,
    libraryPath: path.join(libraryPath, id),
    source,
    installedAt: "2026-05-09T00:00:00.000Z",
    keepUpdated,
    validation: { valid: true, issues: [] },
    enabled: true,
    tags: []
  };
}

describe("checkForSkillUpdates", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.remove(dir)));
    vi.unstubAllGlobals();
  });

  it("checks keep-updated skills and stamps only considered metadata", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);
    await store.save(
      metadataFor(libraryPath, "manual", true, {
        type: "github",
        githubUrl: "https://github.com/example/manual",
        ref: "main",
        commit: "abc123"
      })
    );
    await store.save(metadataFor(libraryPath, "ignored", false));

    const result = await checkForSkillUpdates({
      libraryPath,
      config: configFor(libraryPath),
      remoteResolver: vi.fn(async () => "abc123"),
      now: () => checkedAt
    });

    expect(result).toMatchObject({
      checkedAt: checkedAt.toISOString(),
      considered: [{ id: "manual", name: "manual" }],
      available: [],
      updated: [],
      errors: []
    });

    const metadata = await store.list();
    expect(metadata.find((skill) => skill.id === "manual")?.lastCheckedAt).toBe(checkedAt.toISOString());
    expect(metadata.find((skill) => skill.id === "ignored")?.lastCheckedAt).toBeUndefined();
  });

  it("reports available github updates through an injected resolver", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);
    await store.save(
      metadataFor(libraryPath, "github-skill", false, {
        type: "github",
        githubUrl: "https://github.com/example/skill",
        ref: "main",
        commit: "abc123"
      })
    );

    const resolver = vi.fn(async () => "def456");
    const result = await checkForSkillUpdates({
      libraryPath,
      config: configFor(libraryPath),
      skillId: "github-skill",
      remoteResolver: resolver,
      now: () => checkedAt
    });

    expect(resolver).toHaveBeenCalledWith(
      {
        type: "github",
        githubUrl: "https://github.com/example/skill",
        ref: "main",
        commit: "abc123"
      },
      expect.objectContaining({ id: "github-skill" })
    );
    expect(result.available).toEqual([
      {
        id: "github-skill",
        name: "github-skill",
        currentCommit: "abc123",
        remoteCommit: "def456"
      }
    ]);
    expect(result.updated).toEqual([]);
  });

  it("considers only sources with an upstream during broad update checks", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);
    await store.save(metadataFor(libraryPath, "local-skill", false));
    await store.save(
      metadataFor(libraryPath, "unknown-skill", false, {
        type: "unknown",
        discoveredFrom: path.join(libraryPath, "unknown-skill")
      })
    );
    await store.save(
      metadataFor(libraryPath, "github-skill", false, {
        type: "github",
        githubUrl: "https://github.com/example/github-skill",
        ref: "main",
        commit: "abc123"
      })
    );
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
      config: configFor(libraryPath, true),
      metadataStore: store,
      remoteResolver: vi.fn(async () => "abc123"),
      now: () => checkedAt
    });

    expect(result.considered.map((skill) => skill.id).sort()).toEqual(["github-skill", "registry-skill"]);
    const metadata = await store.list();
    expect(metadata.find((skill) => skill.id === "local-skill")?.lastCheckedAt).toBeUndefined();
    expect(metadata.find((skill) => skill.id === "unknown-skill")?.lastCheckedAt).toBeUndefined();
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

    const resolver = vi.fn(async () => "def456");
    const result = await checkForSkillUpdates({
      libraryPath,
      config: configFor(libraryPath),
      skillId: "registry-skill",
      metadataStore: store,
      remoteResolver: resolver,
      now: () => checkedAt
    });

    expect(resolver).toHaveBeenCalledWith(
      {
        type: "skills.sh",
        skillsShId: "registry-skill",
        githubUrl: "https://github.com/example/registry-skill",
        ref: "main",
        commit: "abc123"
      },
      expect.objectContaining({ id: "registry-skill" })
    );
    expect(result.available).toEqual([
      {
        id: "registry-skill",
        name: "registry-skill",
        currentCommit: "abc123",
        remoteCommit: "def456"
      }
    ]);
  });

  it("selects a single skill by name and skips last-checked stamping when requested", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);
    await store.save({
      ...metadataFor(libraryPath, "id-one", false, {
        type: "github",
        githubUrl: "https://github.com/example/id-one",
        ref: "main",
        commit: "abc123"
      }),
      name: "Display Name"
    });
    await store.save(metadataFor(libraryPath, "id-two", true));

    const result = await checkForSkillUpdates({
      libraryPath,
      config: configFor(libraryPath),
      skillId: "Display Name",
      metadataStore: store,
      stampLastCheckedAt: false,
      now: () => checkedAt
    });

    expect(result.considered).toEqual([{ id: "id-one", name: "Display Name" }]);
    expect((await store.list()).find((skill) => skill.id === "id-one")?.lastCheckedAt).toBeUndefined();
  });

  it("does not report an available update when the remote commit is missing or unchanged", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);
    const source: SkillMetadata["source"] = {
      type: "github",
      githubUrl: "https://github.com/example/skill",
      ref: "main",
      commit: "abc123"
    };
    await store.save(metadataFor(libraryPath, "github-skill", true, source));

    const unchanged = await checkForSkillUpdates({
      libraryPath,
      config: configFor(libraryPath),
      metadataStore: store,
      remoteResolver: vi.fn(async () => "abc123"),
      now: () => checkedAt
    });
    const missing = await checkForSkillUpdates({
      libraryPath,
      config: configFor(libraryPath),
      metadataStore: store,
      remoteResolver: vi.fn(async () => null),
      now: () => checkedAt
    });

    expect(unchanged.available).toEqual([]);
    expect(missing.available).toEqual([]);
  });

  it("records resolver and metadata save errors without aborting the check", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);
    await store.save(
      metadataFor(libraryPath, "github-skill", true, {
        type: "github",
        githubUrl: "https://github.com/example/skill",
        ref: "main",
        commit: "abc123"
      })
    );
    const failingStore = {
      list: () => store.list(),
      save: vi.fn(async () => {
        throw new Error("metadata write failed");
      })
    } as unknown as MetadataStore;

    const result = await checkForSkillUpdates({
      libraryPath,
      config: configFor(libraryPath),
      metadataStore: failingStore,
      remoteResolver: vi.fn(async () => {
        throw new Error("resolver failed");
      }),
      now: () => checkedAt
    });

    expect(result.errors).toEqual([
      { id: "github-skill", message: "resolver failed" },
      { id: "github-skill", message: "metadata write failed" }
    ]);
  });

  it("stringifies non-Error resolver and metadata save failures", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);
    await store.save(
      metadataFor(libraryPath, "github-skill", true, {
        type: "github",
        githubUrl: "https://github.com/example/skill",
        ref: "main",
        commit: "abc123"
      })
    );
    const failingStore = {
      list: () => store.list(),
      save: vi.fn(async () => {
        throw "metadata write failed";
      })
    } as unknown as MetadataStore;

    const result = await checkForSkillUpdates({
      libraryPath,
      config: configFor(libraryPath),
      metadataStore: failingStore,
      remoteResolver: vi.fn(async () => {
        throw "resolver failed";
      })
    });

    expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.errors).toEqual([
      { id: "github-skill", message: "resolver failed" },
      { id: "github-skill", message: "metadata write failed" }
    ]);
  });

  it("checks all skills when the config opts into keeping all skills updated", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);
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
        commit: "abc123"
      })
    );

    const result = await checkForSkillUpdates({
      libraryPath,
      config: configFor(libraryPath, true),
      remoteResolver: vi.fn(async () => "abc123"),
      now: () => checkedAt
    });

    expect(result.considered.map((skill) => skill.id).sort()).toEqual(["first", "second"]);
  });

  it("resolves github commits through the GitHub API by default", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ sha: "def456" })));
    vi.stubGlobal("fetch", fetchImpl);

    await expect(
      resolveGithubRemoteCommit({
        type: "github",
        githubUrl: "https://github.com/example/skill.git",
        ref: "main",
        commit: "abc123"
      })
    ).resolves.toBe("def456");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/example/skill/commits/main",
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": "skiller" }),
        signal: expect.any(AbortSignal)
      })
    );
  });

  it("authenticates github commit checks with an environment token", async () => {
    vi.stubEnv("GITHUB_TOKEN", "token123");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ sha: "def456" })));
    vi.stubGlobal("fetch", fetchImpl);

    await resolveGithubRemoteCommit({
      type: "github",
      githubUrl: "https://github.com/example/skill",
      ref: "main",
      commit: "abc123"
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/example/skill/commits/main",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token123" })
      })
    );
  });

  it("explains rate limited github commit checks with authentication guidance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limited", { status: 403, statusText: "rate limit exceeded" }))
    );

    await expect(
      resolveGithubRemoteCommit({
        type: "github",
        githubUrl: "https://github.com/example/skill",
        ref: "main",
        commit: "abc123"
      })
    ).rejects.toThrow(
      'GitHub update check failed: 403 rate limit exceeded. GitHub API rate limit exceeded. Make sure you are authenticated with GitHub by running "gh auth status" or set GITHUB_TOKEN, then try again.'
    );
  });

  it("returns null for unresolvable github sources", async () => {
    await expect(resolveGithubRemoteCommit({ type: "local", path: "/source/local" })).resolves.toBeNull();
    await expect(
      resolveGithubRemoteCommit({
        type: "github",
        githubUrl: "not-a-github-url",
        ref: "main",
        commit: "abc123"
      })
    ).resolves.toBeNull();
  });

  it("returns null when GitHub responds without a sha", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}))));

    await expect(
      resolveGithubRemoteCommit({
        type: "github",
        githubUrl: "https://github.com/example/skill",
        ref: "main",
        commit: "abc123"
      })
    ).resolves.toBeNull();
  });

  it("throws GitHub status context for failed commit lookups", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500, statusText: "Server Error" })));

    await expect(
      resolveGithubRemoteCommit({
        type: "github",
        githubUrl: "https://github.com/example/skill",
        ref: "main",
        commit: "abc123"
      })
    ).rejects.toThrow("GitHub update check failed: 500 Server Error");
  });

  it("uses the default github resolver during update checks", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);
    await store.save(
      metadataFor(libraryPath, "github-skill", true, {
        type: "github",
        githubUrl: "https://github.com/example/skill",
        ref: "main",
        commit: "abc123"
      })
    );
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ sha: "def456" }))));

    const result = await checkForSkillUpdates({
      libraryPath,
      config: configFor(libraryPath),
      now: () => checkedAt
    });

    expect(result.available).toEqual([
      {
        id: "github-skill",
        name: "github-skill",
        currentCommit: "abc123",
        remoteCommit: "def456"
      }
    ]);
  });
});
