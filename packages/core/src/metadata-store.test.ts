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
    enabledTargets: []
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

  it("round trips metadata saved inside the configured library", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const store = new MetadataStore(libraryPath);
    const metadata = metadataFor(skillPath);

    await store.save(metadata);

    expect(await store.list()).toEqual([metadata]);
  });

  it("rejects metadata paths outside the configured library", async () => {
    const libraryPath = await makeTempDir();
    const outsidePath = path.join(await makeTempDir(), "example-skill");
    const store = new MetadataStore(libraryPath);

    await expect(store.save(metadataFor(outsidePath))).rejects.toThrow(
      "Metadata path must be inside the configured library"
    );
    expect(await fs.pathExists(path.join(outsidePath, "skiller.metadata.json"))).toBe(false);
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
    expect(await fs.pathExists(path.join(outsidePath, "skiller.metadata.json"))).toBe(false);
  });
});
