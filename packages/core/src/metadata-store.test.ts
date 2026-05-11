import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MetadataStore } from "./metadata-store.js";
import type { SkillMetadata } from "./types.js";

const tempDirs: string[] = [];

function metadataFor(libraryPath: string): SkillMetadata {
  return {
    id: "example-skill",
    name: "Example Skill",
    libraryPath,
    source: { type: "local" },
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
