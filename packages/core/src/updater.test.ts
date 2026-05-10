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
    targetDirectories: [],
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
  source: SkillMetadata["source"] = { type: "local" }
): SkillMetadata {
  return {
    id,
    name: id,
    libraryPath: path.join(libraryPath, id),
    source,
    installedAt: "2026-05-09T00:00:00.000Z",
    keepUpdated,
    validation: { valid: true, issues: [] },
    enabledTargets: []
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
    await store.save(metadataFor(libraryPath, "manual", true));
    await store.save(metadataFor(libraryPath, "ignored", false));

    const result = await checkForSkillUpdates({
      libraryPath,
      config: configFor(libraryPath),
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

  it("checks all skills when the config opts into keeping all skills updated", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);
    await store.save(metadataFor(libraryPath, "first", false));
    await store.save(metadataFor(libraryPath, "second", false));

    const result = await checkForSkillUpdates({
      libraryPath,
      config: configFor(libraryPath, true),
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
        headers: expect.objectContaining({ "User-Agent": "skiller" })
      })
    );
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
