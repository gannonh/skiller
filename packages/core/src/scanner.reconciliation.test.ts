import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import { MetadataStore } from "./metadata-store.js";
import * as fileOps from "./file-ops.js";
import { hashDirectory } from "./file-ops.js";
import { enabledTarget, disabledTarget, setupScannerTest, teardownScannerTest, tmp } from "./scanner.test-helpers.js";
import { scanTargets } from "./scanner.js";

const fileOpsMock = vi.hoisted(() => ({
  replaceWithSymlink: vi.fn()
}));

vi.mock("./file-ops.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./file-ops.js")>();
  fileOpsMock.replaceWithSymlink.mockImplementation(actual.replaceWithSymlink);

  return {
    ...actual,
    replaceWithSymlink: fileOpsMock.replaceWithSymlink
  };
});

describe("scanTargets reconciliation", () => {
  beforeEach(async () => {
    await setupScannerTest(() => fileOpsMock.replaceWithSymlink.mockClear());
  });

  afterEach(async () => {
    await teardownScannerTest();
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

  it("importOnly skips the sync/reconcile phase (no symlink creation or removal)", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    await fs.ensureDir(target);
    await fs.ensureDir(library);

    // Create a skill in the library
    const skillId = "my-skill";
    const librarySkill = path.join(library, skillId);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: my-skill\ndescription: Test.\n---\n");

    const store = new MetadataStore(library);
    await store.save({
      id: skillId,
      name: skillId,
      libraryPath: librarySkill,
      source: { type: "local", path: librarySkill },
      installedAt: new Date().toISOString(),
      contentHash: await hashDirectory(librarySkill),
      keepUpdated: false,
      enabled: true,
      tags: [],
      validation: { valid: true, issues: [] }
    });

    // importOnly should NOT create the symlink in the target
    const result = await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      importOnly: true
    });

    expect(result.imported).toHaveLength(0);
    expect(result.enabled).toHaveLength(0);
    expect(result.disabled).toHaveLength(0);
    expect(await fs.pathExists(path.join(target, skillId))).toBe(false);
  });

  it("importOnly still imports new skills discovered in target directories", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    await fs.ensureDir(target);
    await fs.ensureDir(library);

    // Create an unmanaged skill in the target directory
    const skillDir = path.join(target, "new-skill");
    await fs.ensureDir(skillDir);
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "---\nname: new-skill\ndescription: New.\n---\n");

    const result = await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      importOnly: true
    });

    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]!.id).toBe("new-skill");
  });

});
