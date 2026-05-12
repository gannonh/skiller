import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetadataStore } from "./metadata-store.js";
import { scanTargets } from "./scanner.js";

const fileOpsMock = vi.hoisted(() => ({
  replaceWithSymlink: vi.fn(),
}));

vi.mock("./file-ops.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./file-ops.js")>();
  fileOpsMock.replaceWithSymlink.mockImplementation(actual.replaceWithSymlink);

  return {
    ...actual,
    replaceWithSymlink: fileOpsMock.replaceWithSymlink,
  };
});

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-scanner-"));
  fileOpsMock.replaceWithSymlink.mockClear();
});

afterEach(async () => {
  await fs.remove(tmp);
});

describe("scanTargets", () => {
  const enabledTarget = (targetPath: string) => ({ path: targetPath, enabled: true });
  const disabledTarget = (targetPath: string) => ({ path: targetPath, enabled: false });

  it("rejects relative library paths before scanning targets", async () => {
    const target = path.join(tmp, "target");
    const skill = path.join(target, "example");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");

    await expect(scanTargets({ libraryPath: "relative-library", targets: [enabledTarget(target)] })).rejects.toThrow(
      "Library path must be absolute before scanning targets"
    );
    expect((await fs.lstat(skill)).isDirectory()).toBe(true);
  });

  it("imports real skill folders and replaces them with symlinks", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "example");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]?.source).toEqual({ type: "unknown", discoveredFrom: skill });
    expect(result.imported[0]).toMatchObject({ enabled: true, tags: [] });
    expect(result.imported[0]).not.toHaveProperty("skillSetId");
    expect(await fs.pathExists(path.join(library, "example", "SKILL.md"))).toBe(true);
    expect((await fs.lstat(skill)).isSymbolicLink()).toBe(true);
  });

  it("syncs enabled library skills to enabled targets and removes them from disabled targets", async () => {
    const enabled = path.join(tmp, "enabled-target");
    const disabled = path.join(tmp, "disabled-target");
    const library = path.join(tmp, "library");
    const skill = path.join(library, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(enabled);
    await fs.ensureDir(disabled);
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: skill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });
    await fs.symlink(skill, path.join(disabled, "example"));

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(enabled), disabledTarget(disabled)] });

    expect(result.enabled).toEqual([{ skillId: "example", targetPath: enabled }]);
    expect(result.disabled).toEqual([{ skillId: "example", targetPath: disabled }]);
    expect(await fs.realpath(path.join(enabled, "example"))).toBe(await fs.realpath(skill));
    await expect(fs.pathExists(path.join(disabled, "example"))).resolves.toBe(false);
  });

  it("creates missing enabled target directories before syncing library skills", async () => {
    const target = path.join(tmp, "missing-target");
    const library = path.join(tmp, "library");
    const skill = path.join(library, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: skill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result.enabled).toEqual([{ skillId: "example", targetPath: target }]);
    expect(await fs.realpath(path.join(target, "example"))).toBe(await fs.realpath(skill));
  });

  it("uses the last duplicate target entry when syncing", async () => {
    const target = path.join(tmp, "duplicate-target");
    const library = path.join(tmp, "library");
    const skill = path.join(library, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(target);
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: skill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    const result = await scanTargets({ libraryPath: library, targets: [disabledTarget(target), enabledTarget(target)] });

    expect(result.enabled).toEqual([{ skillId: "example", targetPath: target }]);
    expect(await fs.realpath(path.join(target, "example"))).toBe(await fs.realpath(skill));
  });

  it("removes disabled library skills from enabled targets", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(library, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(target);
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: skill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: false,
      tags: []
    });
    await fs.symlink(skill, path.join(target, "example"));

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result.disabled).toEqual([{ skillId: "example", targetPath: target }]);
    await expect(fs.pathExists(path.join(target, "example"))).resolves.toBe(false);
  });

  it("falls back to the folder slug when SKILL.md has no frontmatter name", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "Example Skill");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "Plain markdown");

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result.imported.map((metadata) => metadata.id)).toEqual(["example-skill"]);
    await expect(fs.pathExists(path.join(library, "example-skill", "SKILL.md"))).resolves.toBe(true);
  });

  it("falls back to the folder slug when SKILL.md frontmatter is empty", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "Empty Frontmatter");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\n\n---\n");

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result.imported.map((metadata) => metadata.id)).toEqual(["empty-frontmatter"]);
  });

  it("normalizes dot-only frontmatter names to a safe library id", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "dot-name");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: .\ndescription: Dot.\n---\n");

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result.imported.map((metadata) => metadata.id)).toEqual(["skill"]);
    expect(await fs.pathExists(path.join(library, "skill", "SKILL.md"))).toBe(true);
    expect(await fs.pathExists(path.join(library, "SKILL.md"))).toBe(false);
  });

  it("imports duplicate basenames with distinct declared names into distinct library paths", async () => {
    const firstTarget = path.join(tmp, "first-target");
    const secondTarget = path.join(tmp, "second-target");
    const library = path.join(tmp, "library");
    const firstSkill = path.join(firstTarget, "example");
    const secondSkill = path.join(secondTarget, "example");
    const firstContent = "---\nname: first\ndescription: First.\n---\n";
    const secondContent = "---\nname: second\ndescription: Second.\n---\n";

    await fs.ensureDir(firstSkill);
    await fs.ensureDir(secondSkill);
    await fs.writeFile(path.join(firstSkill, "SKILL.md"), firstContent);
    await fs.writeFile(path.join(secondSkill, "SKILL.md"), secondContent);

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(firstTarget), enabledTarget(secondTarget)] });

    expect(result.imported).toHaveLength(2);
    expect(result.imported.map((metadata) => metadata.id)).toEqual(["first", "second"]);
    expect(await fs.readFile(path.join(library, "first", "SKILL.md"), "utf8")).toBe(firstContent);
    expect(await fs.readFile(path.join(library, "second", "SKILL.md"), "utf8")).toBe(secondContent);
    expect(await fs.realpath(firstSkill)).toBe(await fs.realpath(path.join(library, "first")));
    expect(await fs.realpath(secondSkill)).toBe(await fs.realpath(path.join(library, "second")));
  });

  it("adds a suffix when a library folder already exists without tracked metadata", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const existingLibraryFolder = path.join(library, "example");
    const skill = path.join(target, "example");
    await fs.ensureDir(existingLibraryFolder);
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(existingLibraryFolder, "SKILL.md"), "---\nname: old-example\ndescription: Old.\n---\n");
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result.imported.map((metadata) => metadata.id)).toEqual(["example-2"]);
    await expect(fs.pathExists(path.join(library, "example-2", "SKILL.md"))).resolves.toBe(true);
  });

  it("enables an existing master skill when a target installs the same declared skill as a real folder", async () => {
    const firstTarget = path.join(tmp, "first-target");
    const secondTarget = path.join(tmp, "second-target");
    const library = path.join(tmp, "library");
    const firstSkill = path.join(firstTarget, "kata-health");
    const secondSkill = path.join(secondTarget, "kata-health");
    const content = "---\nname: kata-health\ndescription: Kata health.\n---\n";

    await fs.ensureDir(firstSkill);
    await fs.ensureDir(secondSkill);
    await fs.writeFile(path.join(firstSkill, "SKILL.md"), content);
    await fs.writeFile(path.join(secondSkill, "SKILL.md"), content);

    const firstResult = await scanTargets({ libraryPath: library, targets: [enabledTarget(firstTarget)] });
    const secondResult = await scanTargets({ libraryPath: library, targets: [enabledTarget(secondTarget)] });
    const saved = await new MetadataStore(library).list();

    expect(firstResult.imported.map((metadata) => metadata.id)).toEqual(["kata-health"]);
    expect(secondResult.imported).toHaveLength(0);
    expect(secondResult.enabled).toEqual([{ skillId: "kata-health", targetPath: secondTarget }]);
    expect(saved.map((metadata) => metadata.id)).toEqual(["kata-health"]);
    expect(saved[0]?.enabled).toBe(true);
    expect(await fs.pathExists(path.join(library, "kata-health-2"))).toBe(false);
    expect(await fs.realpath(secondSkill)).toBe(await fs.realpath(path.join(library, "kata-health")));
  });

  it("leaves real target folders in place when matching metadata points to a missing library path", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const targetSkill = path.join(target, "example");
    const missingLibrarySkill = path.join(library, "missing-example");
    const store = new MetadataStore(library);

    await fs.ensureDir(targetSkill);
    await fs.writeFile(path.join(targetSkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: missingLibrarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(fileOpsMock.replaceWithSymlink).not.toHaveBeenCalledWith(targetSkill, missingLibrarySkill);
    expect((await fs.lstat(targetSkill)).isDirectory()).toBe(true);
    expect((await fs.lstat(targetSkill)).isSymbolicLink()).toBe(false);
    expect(result.enabled).toEqual([]);
    expect(result.imported).toEqual([]);
  });

  it("leaves matching real target folders in place when the library skill is disabled", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(targetSkill);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(targetSkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: false,
      tags: []
    });

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result.enabled).toEqual([]);
    expect((await fs.lstat(targetSkill)).isDirectory()).toBe(true);
    expect((await fs.lstat(targetSkill)).isSymbolicLink()).toBe(false);
  });

  it("reports lstat failures while checking managed target entries during sync", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);
    const originalLstat = fs.lstat;

    await fs.ensureDir(target);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    const lstat = vi.spyOn(fs, "lstat").mockImplementation(async (candidate, options) => {
      if (candidate === targetSkill) throw new Error("lstat sync failed");
      return originalLstat(candidate as never, options as never) as never;
    });

    try {
      const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

      expect(result.errors).toEqual([{ path: targetSkill, message: "lstat sync failed" }]);
    } finally {
      lstat.mockRestore();
    }
  });

  it("skips stale target entries that disappear during scanning", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    await fs.ensureDir(target);

    const readdir = vi.spyOn(fs, "readdir").mockResolvedValueOnce(["missing-skill"] as never);

    try {
      const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

      expect(result.imported).toHaveLength(0);
      expect(result.enabled).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    } finally {
      readdir.mockRestore();
    }
  });

  it("skips target directories removed between existence and readdir checks", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    await fs.ensureDir(target);
    const readdir = vi.spyOn(fs, "readdir").mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }));

    try {
      const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

      expect(result).toEqual({ imported: [], enabled: [], disabled: [], errors: [] });
    } finally {
      readdir.mockRestore();
    }
  });

  it("reports target directory readdir failures", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    await fs.ensureDir(target);
    const readdir = vi.spyOn(fs, "readdir").mockRejectedValueOnce(new Error("readdir failed"));

    try {
      const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

      expect(result.errors).toEqual([{ path: target, message: "readdir failed" }]);
    } finally {
      readdir.mockRestore();
    }
  });

  it("stringifies non-Error target directory readdir failures", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    await fs.ensureDir(target);
    const readdir = vi.spyOn(fs, "readdir").mockRejectedValueOnce("readdir failed");

    try {
      const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

      expect(result.errors).toEqual([{ path: target, message: "readdir failed" }]);
    } finally {
      readdir.mockRestore();
    }
  });

  it("skips broken target symlinks", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const brokenSkill = path.join(target, "executing-plans");

    await fs.ensureDir(target);
    await fs.symlink(path.join(tmp, "missing", "executing-plans"), brokenSkill, "dir");

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result.imported).toHaveLength(0);
    expect(result.enabled).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("reports filesystem errors while checking candidate skill folders", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "example");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    const stat = vi.spyOn(fs, "stat").mockRejectedValueOnce(new Error("stat failed"));

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result.errors).toEqual([{ path: skill, message: "stat failed" }]);
    stat.mockRestore();
  });

  it("skips candidate skill folders removed between existence and stat checks", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "example");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    const originalPathExists = fs.pathExists;
    const pathExists = vi.spyOn(fs, "pathExists").mockImplementation(async (candidate) => {
      if (candidate === path.join(skill, "SKILL.md")) return true;
      return originalPathExists(candidate as string);
    });
    const stat = vi.spyOn(fs, "stat").mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }));

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result).toEqual({ imported: [], enabled: [], disabled: [], errors: [] });
    pathExists.mockRestore();
    stat.mockRestore();
  });

  it("skips target entries that are not skill directories", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    await fs.ensureDir(target);
    await fs.writeFile(path.join(target, "note.txt"), "not a skill");

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result).toEqual({ imported: [], enabled: [], disabled: [], errors: [] });
  });

  it("stringifies non-Error scan failures", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "example");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    fileOpsMock.replaceWithSymlink.mockRejectedValueOnce("symlink failed");

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result.errors).toEqual([{ path: skill, message: "symlink failed" }]);
  });

  it("does not save enabled target metadata when symlink replacement fails", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "example");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    fileOpsMock.replaceWithSymlink.mockRejectedValueOnce(new Error("symlink failed"));

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });
    const saved = await new MetadataStore(library).list();

    expect(result.imported).toHaveLength(0);
    expect(result.errors).toEqual([{ path: skill, message: "symlink failed" }]);
    expect(saved).toHaveLength(0);
    expect(await fs.pathExists(path.join(library, "example"))).toBe(false);
  });

  it("deduplicates configured target directories during scans and reconciliation", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "example");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target), enabledTarget(target)] });
    const saved = await new MetadataStore(library).list();

    expect(result.imported.map((metadata) => metadata.id)).toEqual(["example"]);
    expect(result.enabled).toEqual([{ skillId: "example", targetPath: target }]);
    expect(saved[0]?.enabled).toBe(true);
  });

  it("records existing target symlinks to library skills as enabled", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(target);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });
    await fs.symlink(librarySkill, targetSkill);

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });
    const saved = await store.list();

    expect(result.imported).toHaveLength(0);
    expect(result.enabled).toEqual([{ skillId: "example", targetPath: target }]);
    expect(saved[0]?.enabled).toBe(true);
  });

  it("skips stale metadata paths while resolving target symlinks", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const missingLibrarySkill = path.join(library, "aa-missing");
    const librarySkill = path.join(library, "zz-example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(target);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await fs.ensureDir(missingLibrarySkill);
    await fs.writeJson(path.join(missingLibrarySkill, "skiller.metadata.json"), {
      id: "aa-missing",
      name: "aa-missing",
      libraryPath: path.join(library, "missing-real-path"),
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });
    await store.save({
      id: "zz-example",
      name: "zz-example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });
    await fs.symlink(librarySkill, targetSkill);

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result.enabled).toEqual([{ skillId: "zz-example", targetPath: target }]);
  });

  it("ignores target symlinks that do not point to tracked library skills", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const unmanaged = path.join(tmp, "unmanaged");
    const targetSkill = path.join(target, "unmanaged");

    await fs.ensureDir(target);
    await fs.ensureDir(unmanaged);
    await fs.writeFile(path.join(unmanaged, "SKILL.md"), "---\nname: unmanaged\ndescription: Unmanaged.\n---\n");
    await fs.symlink(unmanaged, targetSkill);

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result).toEqual({ imported: [], enabled: [], disabled: [], errors: [] });
  });

  it("skips missing disabled target directories", async () => {
    const library = path.join(tmp, "library");
    const target = path.join(tmp, "missing-target");
    const result = await scanTargets({ libraryPath: library, targets: [disabledTarget(target)] });

    expect(result).toEqual({ imported: [], enabled: [], disabled: [], errors: [] });
    await expect(fs.pathExists(target)).resolves.toBe(false);
  });

  it("leaves existing non-symlink target entries in place during library sync", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(targetSkill);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result.enabled).toEqual([]);
    expect((await fs.lstat(targetSkill)).isDirectory()).toBe(true);
  });

  it("reports reconciliation readdir failures", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const store = new MetadataStore(library);
    const originalReaddir = fs.readdir;
    let targetReads = 0;

    await fs.ensureDir(target);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    const readdir = vi.spyOn(fs, "readdir").mockImplementation(async (candidate, options) => {
      if (candidate === target) {
        targetReads += 1;
        if (targetReads === 2) throw new Error("sync readdir failed");
      }

      return originalReaddir(candidate as never, options as never) as never;
    });

    try {
      const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

      expect(result.errors).toEqual([{ path: target, message: "sync readdir failed" }]);
    } finally {
      readdir.mockRestore();
    }
  });

  it("stringifies non-Error reconciliation readdir failures", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const originalReaddir = fs.readdir;
    let targetReads = 0;

    await fs.ensureDir(target);
    await fs.ensureDir(library);

    const readdir = vi.spyOn(fs, "readdir").mockImplementation(async (candidate, options) => {
      if (candidate === target) {
        targetReads += 1;
        if (targetReads === 2) throw "sync readdir failed";
      }

      return originalReaddir(candidate as never, options as never) as never;
    });

    try {
      const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

      expect(result.errors).toEqual([{ path: target, message: "sync readdir failed" }]);
    } finally {
      readdir.mockRestore();
    }
  });

  it("skips target directories removed before reconciliation readdir", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const originalReaddir = fs.readdir;
    let targetReads = 0;

    await fs.ensureDir(target);
    await fs.ensureDir(library);

    const readdir = vi.spyOn(fs, "readdir").mockImplementation(async (candidate, options) => {
      if (candidate === target) {
        targetReads += 1;
        if (targetReads === 2) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }

      return originalReaddir(candidate as never, options as never) as never;
    });

    try {
      const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

      expect(result.errors).toEqual([]);
    } finally {
      readdir.mockRestore();
    }
  });

  it("reports symlink creation failures during library sync", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(target);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    const symlink = vi.spyOn(fs, "symlink").mockRejectedValueOnce(new Error("symlink create failed"));

    try {
      const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

      expect(result.errors).toEqual([{ path: path.join(target, "example"), message: "symlink create failed" }]);
    } finally {
      symlink.mockRestore();
    }
  });

  it("stringifies non-Error symlink creation failures during library sync", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(target);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    const symlink = vi.spyOn(fs, "symlink").mockRejectedValueOnce("symlink create failed");

    try {
      const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

      expect(result.errors).toEqual([{ path: path.join(target, "example"), message: "symlink create failed" }]);
    } finally {
      symlink.mockRestore();
    }
  });

  it("skips library sync entries that disappear before symlink creation", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(target);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    const symlink = vi.spyOn(fs, "symlink").mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }));

    try {
      const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

      expect(result.errors).toEqual([]);
    } finally {
      symlink.mockRestore();
    }
  });

  it("skips managed symlinks removed during disabled-target cleanup", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);
    const originalLstat = fs.lstat;
    let targetSkillStats = 0;

    await fs.ensureDir(target);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });
    await fs.symlink(librarySkill, targetSkill);

    const lstat = vi.spyOn(fs, "lstat").mockImplementation(async (candidate, options) => {
      if (candidate === targetSkill) {
        targetSkillStats += 1;
        if (targetSkillStats === 2) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }

      return originalLstat(candidate as never, options as never) as never;
    });

    try {
      const result = await scanTargets({ libraryPath: library, targets: [disabledTarget(target)] });

      expect(result.disabled).toEqual([]);
    } finally {
      lstat.mockRestore();
    }
  });

  it("deduplicates disabled changes for multiple symlinks to the same library skill", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(target);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });
    await fs.symlink(librarySkill, path.join(target, "example"));
    await fs.symlink(librarySkill, path.join(target, "example-copy"));

    const result = await scanTargets({ libraryPath: library, targets: [disabledTarget(target)] });

    expect(result.disabled).toEqual([{ skillId: "example", targetPath: target }]);
  });

  it("uses indexed metadata paths when disabling a target", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const store = new MetadataStore(library);

    await fs.ensureDir(target);

    for (let index = 1; index <= 6; index += 1) {
      const id = `example-${index}`;
      const librarySkill = path.join(library, id);

      await fs.ensureDir(librarySkill);
      await fs.writeFile(path.join(librarySkill, "SKILL.md"), `---\nname: ${id}\ndescription: Example.\n---\n`);
      await store.save({
        id,
        name: id,
        libraryPath: librarySkill,
        source: { type: "unknown" },
        installedAt: "2026-05-10T12:00:00.000Z",
        contentHash: "hash",
        keepUpdated: false,
        validation: { valid: true, issues: [] },
        enabled: true,
        tags: []
      });
      await fs.symlink(librarySkill, path.join(target, id));
    }

    const realpath = vi.spyOn(fs, "realpath");

    try {
      const result = await scanTargets({ libraryPath: library, targets: [disabledTarget(target)] });

      expect(result.disabled).toHaveLength(6);
      expect(realpath.mock.calls.length).toBeLessThanOrEqual(25);
    } finally {
      realpath.mockRestore();
    }
  });

  it("skips managed symlinks replaced before disabled-target cleanup", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);
    const originalLstat = fs.lstat;
    let targetSkillStats = 0;

    await fs.ensureDir(target);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });
    await fs.symlink(librarySkill, targetSkill);

    const lstat = vi.spyOn(fs, "lstat").mockImplementation(async (candidate, options) => {
      if (candidate === targetSkill) {
        targetSkillStats += 1;
        if (targetSkillStats === 2) return originalLstat(target as never, options as never) as never;
      }

      return originalLstat(candidate as never, options as never) as never;
    });

    try {
      const result = await scanTargets({ libraryPath: library, targets: [disabledTarget(target)] });

      expect(result.disabled).toEqual([]);
    } finally {
      lstat.mockRestore();
    }
  });

  it("skips managed symlinks retargeted before disabled-target cleanup", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const otherLibrarySkill = path.join(library, "other");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);
    const originalLstat = fs.lstat;
    let targetSkillStats = 0;

    await fs.ensureDir(target);
    await fs.ensureDir(librarySkill);
    await fs.ensureDir(otherLibrarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await fs.writeFile(path.join(otherLibrarySkill, "SKILL.md"), "---\nname: other\ndescription: Other.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });
    await store.save({
      id: "other",
      name: "other",
      libraryPath: otherLibrarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });
    await fs.symlink(librarySkill, targetSkill);

    const lstat = vi.spyOn(fs, "lstat").mockImplementation(async (candidate, options) => {
      if (candidate === targetSkill) {
        targetSkillStats += 1;
        if (targetSkillStats === 2) {
          await fs.remove(targetSkill);
          await fs.symlink(otherLibrarySkill, targetSkill);
        }
      }

      return originalLstat(candidate as never, options as never) as never;
    });

    try {
      const result = await scanTargets({ libraryPath: library, targets: [disabledTarget(target)] });

      expect(result.disabled).toEqual([]);
    } finally {
      lstat.mockRestore();
    }
  });

  it("skips managed symlinks retargeted to unmanaged paths before disabled-target cleanup", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const unmanaged = path.join(tmp, "unmanaged");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);
    const originalLstat = fs.lstat;
    let targetSkillStats = 0;

    await fs.ensureDir(target);
    await fs.ensureDir(unmanaged);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(unmanaged, "SKILL.md"), "---\nname: unmanaged\ndescription: Unmanaged.\n---\n");
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });
    await fs.symlink(librarySkill, targetSkill);

    const lstat = vi.spyOn(fs, "lstat").mockImplementation(async (candidate, options) => {
      if (candidate === targetSkill) {
        targetSkillStats += 1;
        if (targetSkillStats === 2) {
          await fs.remove(targetSkill);
          await fs.symlink(unmanaged, targetSkill);
        }
      }

      return originalLstat(candidate as never, options as never) as never;
    });

    try {
      const result = await scanTargets({ libraryPath: library, targets: [disabledTarget(target)] });

      expect(result.disabled).toEqual([]);
    } finally {
      lstat.mockRestore();
    }
  });

  it("reports lstat failures during disabled-target cleanup", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);
    const originalLstat = fs.lstat;
    let targetSkillStats = 0;

    await fs.ensureDir(target);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });
    await fs.symlink(librarySkill, targetSkill);

    const lstat = vi.spyOn(fs, "lstat").mockImplementation(async (candidate, options) => {
      if (candidate === targetSkill) {
        targetSkillStats += 1;
        if (targetSkillStats === 2) throw new Error("lstat cleanup failed");
      }

      return originalLstat(candidate as never, options as never) as never;
    });

    try {
      const result = await scanTargets({ libraryPath: library, targets: [disabledTarget(target)] });

      expect(result.errors).toEqual([{ path: targetSkill, message: "lstat cleanup failed" }]);
    } finally {
      lstat.mockRestore();
    }
  });

  it("stringifies non-Error lstat failures during disabled-target cleanup", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);
    const originalLstat = fs.lstat;
    let targetSkillStats = 0;

    await fs.ensureDir(target);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });
    await fs.symlink(librarySkill, targetSkill);

    const lstat = vi.spyOn(fs, "lstat").mockImplementation(async (candidate, options) => {
      if (candidate === targetSkill) {
        targetSkillStats += 1;
        if (targetSkillStats === 2) throw "lstat cleanup failed";
      }

      return originalLstat(candidate as never, options as never) as never;
    });

    try {
      const result = await scanTargets({ libraryPath: library, targets: [disabledTarget(target)] });

      expect(result.errors).toEqual([{ path: targetSkill, message: "lstat cleanup failed" }]);
    } finally {
      lstat.mockRestore();
    }
  });

  it("removes configured enabled targets that no longer point at the master skill", async () => {
    const agentsTarget = path.join(tmp, "agents-target");
    const claudeTarget = path.join(tmp, "claude-target");
    const codexTarget = path.join(tmp, "codex-target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "agent-browser");
    const agentsSkill = path.join(agentsTarget, "agent-browser");
    const store = new MetadataStore(library);

    await fs.ensureDir(agentsTarget);
    await fs.ensureDir(claudeTarget);
    await fs.ensureDir(codexTarget);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: agent-browser\ndescription: Agent browser.\n---\n");
    await store.save({
      id: "agent-browser",
      name: "agent-browser",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: "hash",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });
    await fs.symlink(librarySkill, agentsSkill);

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(agentsTarget), enabledTarget(claudeTarget), enabledTarget(codexTarget)] });

    expect(result.enabled).toEqual([
      { skillId: "agent-browser", targetPath: agentsTarget },
      { skillId: "agent-browser", targetPath: claudeTarget },
      { skillId: "agent-browser", targetPath: codexTarget }
    ]);
  });

  it("skips target directories that equal the library root", async () => {
    const library = path.join(tmp, "library");
    const skill = path.join(library, "example");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(library)] });

    expect(result.imported).toHaveLength(0);
    expect((await fs.lstat(skill)).isDirectory()).toBe(true);
    expect((await fs.lstat(skill)).isSymbolicLink()).toBe(false);
  });

  it("skips target directories that contain the library root", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(target, "library");
    const skill = path.join(target, "example");
    await fs.ensureDir(skill);
    await fs.ensureDir(library);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result.imported).toHaveLength(0);
    expect((await fs.lstat(skill)).isDirectory()).toBe(true);
    expect((await fs.lstat(skill)).isSymbolicLink()).toBe(false);
  });
});
