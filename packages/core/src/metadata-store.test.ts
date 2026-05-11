import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetadataStore } from "./metadata-store.js";
import type { SkillMetadata } from "./types.js";

const tempDirs: string[] = [];

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

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-core-"));
  tempDirs.push(dir);
  return dir;
}

describe("MetadataStore", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map((dir) => fs.remove(dir)));
  });

  it("round trips metadata through a root manifest", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const store = new MetadataStore(libraryPath);
    const metadata = metadataFor(skillPath);

    await store.save(metadata);

    expect(await store.list()).toEqual([metadata]);
    await expect(fs.readJson(path.join(libraryPath, "skiller.manifest.json"))).resolves.toEqual({
      version: 1,
      skills: [metadata]
    });
    await expect(fs.pathExists(path.join(skillPath, "skiller.metadata.json"))).resolves.toBe(false);
  });

  it("updates existing manifest records by skill id", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const store = new MetadataStore(libraryPath);
    const metadata = metadataFor(skillPath);

    await store.save(metadata);
    await store.save({ ...metadata, enabled: false });

    expect(await store.list()).toEqual([{ ...metadata, enabled: false }]);
  });

  it("defaults manifest metadata without enabled to enabled", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const store = new MetadataStore(libraryPath);
    const { enabled: _enabled, ...metadata } = metadataFor(skillPath);

    await fs.writeJson(path.join(libraryPath, "skiller.manifest.json"), {
      version: 1,
      skills: [metadata]
    });

    expect(await store.list()).toEqual([metadataFor(skillPath)]);
  });

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

  it("treats malformed manifest skills as empty", async () => {
    const libraryPath = await makeTempDir();

    await fs.writeJson(path.join(libraryPath, "skiller.manifest.json"), {
      version: 1,
      skills: null
    });

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([]);
  });

  it("returns an empty library when the manifest is missing", async () => {
    const libraryPath = await makeTempDir();

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([]);
  });

  it("consolidates legacy per-skill metadata into the root manifest", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const metadata = metadataFor(skillPath);

    await fs.ensureDir(skillPath);
    await fs.writeJson(path.join(skillPath, "skiller.metadata.json"), metadata);

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([metadata]);
    await expect(fs.readJson(path.join(libraryPath, "skiller.manifest.json"))).resolves.toEqual({
      version: 1,
      skills: [metadata]
    });
    await expect(fs.pathExists(path.join(skillPath, "skiller.metadata.json"))).resolves.toBe(false);
  });

  it("recovers a corrupt manifest from legacy per-skill metadata", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const metadata = metadataFor(skillPath);

    await fs.ensureDir(skillPath);
    await fs.writeFile(path.join(libraryPath, "skiller.manifest.json"), "{");
    await fs.writeJson(path.join(skillPath, "skiller.metadata.json"), metadata);

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([metadata]);
    await expect(fs.readJson(path.join(libraryPath, "skiller.manifest.json"))).resolves.toEqual({
      version: 1,
      skills: [metadata]
    });
    await expect(fs.pathExists(path.join(skillPath, "skiller.metadata.json"))).resolves.toBe(false);
  });

  it("returns an empty library for a corrupt manifest without legacy metadata", async () => {
    const libraryPath = await makeTempDir();

    await fs.writeFile(path.join(libraryPath, "skiller.manifest.json"), "{");

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([]);
  });

  it("rethrows non-parse manifest read failures", async () => {
    const libraryPath = await makeTempDir();

    await fs.writeJson(path.join(libraryPath, "skiller.manifest.json"), { version: 1, skills: [] });
    vi.spyOn(fs, "readJson").mockRejectedValueOnce(new Error("read failed"));

    await expect(new MetadataStore(libraryPath).list()).rejects.toThrow("read failed");
  });

  it("updates enabled without replacing unrelated metadata fields", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const otherSkillPath = path.join(libraryPath, "other-skill");
    const store = new MetadataStore(libraryPath);
    const metadata = { ...metadataFor(skillPath), lastCheckedAt: "2026-05-10T00:00:00.000Z" };
    const otherMetadata = { ...metadataFor(otherSkillPath), id: "other-skill", name: "Other Skill" };

    await store.save(metadata);
    await store.save(otherMetadata);
    await store.setEnabled("example-skill", false);

    expect(await store.list()).toEqual([{ ...metadata, enabled: false }, otherMetadata]);
  });

  it("rejects enabling an unknown skill", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);

    await expect(store.setEnabled("missing", true)).rejects.toThrow("Skill not found: missing");
  });

  it("removes temporary manifest files when an atomic replace fails", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const store = new MetadataStore(libraryPath);

    vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("rename failed"));

    await expect(store.save(metadataFor(skillPath))).rejects.toThrow("rename failed");

    const entries = await fs.readdir(libraryPath);
    expect(entries.filter((entry) => entry.includes("skiller.manifest.json") && entry.endsWith(".tmp"))).toEqual([]);
  });

  it("skips corrupt legacy metadata during consolidation", async () => {
    const libraryPath = await makeTempDir();
    const validPath = path.join(libraryPath, "valid");
    const corruptPath = path.join(libraryPath, "corrupt");
    const metadata = metadataFor(validPath);

    await fs.ensureDir(validPath);
    await fs.ensureDir(corruptPath);
    await fs.writeJson(path.join(validPath, "skiller.metadata.json"), metadata);
    await fs.writeFile(path.join(corruptPath, "skiller.metadata.json"), "{");

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([metadata]);
  });

  it("rejects metadata paths outside the configured library", async () => {
    const libraryPath = await makeTempDir();
    const outsidePath = path.join(await makeTempDir(), "example-skill");
    const store = new MetadataStore(libraryPath);

    await expect(store.save(metadataFor(outsidePath))).rejects.toThrow(
      "Metadata path must be inside the configured library"
    );
    expect(await fs.pathExists(path.join(libraryPath, "skiller.manifest.json"))).toBe(false);
  });

  it("rejects metadata saved at the library root", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);

    await expect(store.save(metadataFor(libraryPath))).rejects.toThrow(
      "Metadata path must be inside the configured library"
    );
  });

  it("rejects symlinked metadata paths that resolve outside the configured library", async () => {
    const libraryPath = await makeTempDir();
    const outsidePath = await makeTempDir();
    const symlinkPath = path.join(libraryPath, "linked-outside");
    const store = new MetadataStore(libraryPath);

    await fs.symlink(outsidePath, symlinkPath);

    await expect(store.save(metadataFor(symlinkPath))).rejects.toThrow(
      "Metadata path must be inside the configured library"
    );
    expect(await fs.pathExists(path.join(libraryPath, "skiller.manifest.json"))).toBe(false);
  });
});
