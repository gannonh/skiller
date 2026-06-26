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

describe("scanTargets core", () => {
  beforeEach(async () => {
    await setupScannerTest(() => fileOpsMock.replaceWithSymlink.mockClear());
  });

  afterEach(async () => {
    await teardownScannerTest();
  });

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

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)], import: true });

    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]?.source).toEqual({ type: "unknown", discoveredFrom: skill });
    expect(result.imported[0]).toMatchObject({ enabled: true, tags: [] });
    expect(result.imported[0]).not.toHaveProperty("skillSetId");
    expect(await fs.pathExists(path.join(library, "example", "SKILL.md"))).toBe(true);
    expect((await fs.lstat(skill)).isSymbolicLink()).toBe(true);
  });

  it("installs copies when globalTargetInstallMode is copy", async () => {
    const target = path.join(tmp, "target");
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
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    const result = await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });

    const installed = path.join(target, "example");
    expect(result.enabled).toEqual([{ skillId: "example", targetPath: target }]);
    expect((await fs.lstat(installed)).isDirectory()).toBe(true);
    expect((await fs.lstat(installed)).isSymbolicLink()).toBe(false);
    await expect(fs.readFile(path.join(installed, "SKILL.md"), "utf8")).resolves.toContain("name: example");
  });

  it("replaces symlinks with copies when globalTargetInstallMode is copy", async () => {
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
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });
    await fs.symlink(skill, path.join(target, "example"), "dir");

    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });

    const installed = path.join(target, "example");
    expect((await fs.lstat(installed)).isDirectory()).toBe(true);
    expect((await fs.lstat(installed)).isSymbolicLink()).toBe(false);
  });

  it("uses projectTargetInstallMode for project target paths", async () => {
    const globalTarget = path.join(tmp, "global-target");
    const projectTarget = path.join(tmp, "project-target");
    const library = path.join(tmp, "library");
    const skillPath = path.join(library, "grouped-skill");
    const store = new MetadataStore(library);

    await fs.ensureDir(skillPath);
    await fs.writeFile(path.join(skillPath, "SKILL.md"), "---\nname: grouped-skill\ndescription: Grouped.\n---\n");
    await store.save({
      id: "grouped-skill",
      name: "grouped-skill",
      libraryPath: skillPath,
      source: { type: "local", path: skillPath },
      installedAt: "2026-05-12T00:00:00.000Z",
      keepUpdated: false,
      enabled: true,
      tags: [],
      validation: { valid: true, issues: [] }
    });
    await store.saveSkillSet({
      name: "Automation",
      skillIds: ["grouped-skill"],
      targets: [{ path: projectTarget, enabled: true }]
    });

    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(globalTarget)],
      globalTargetInstallMode: "symlink",
      projectTargetInstallMode: "copy",
      skillSets: (await store.libraryState()).skillSets
    });

    const globalInstalled = path.join(globalTarget, "grouped-skill");
    const projectInstalled = path.join(projectTarget, "grouped-skill");
    expect((await fs.lstat(globalInstalled)).isSymbolicLink()).toBe(true);
    expect((await fs.lstat(projectInstalled)).isDirectory()).toBe(true);
    expect((await fs.lstat(projectInstalled)).isSymbolicLink()).toBe(false);
  });

  it("uses projectTargetInstallMode for home-relative project target paths", async () => {
    vi.stubEnv("HOME", tmp);
    const globalTarget = path.join(tmp, "global-target");
    const projectTarget = path.join(tmp, "project-target");
    const library = path.join(tmp, "library");
    const skillPath = path.join(library, "grouped-skill");
    const store = new MetadataStore(library);

    await fs.ensureDir(skillPath);
    await fs.writeFile(path.join(skillPath, "SKILL.md"), "---\nname: grouped-skill\ndescription: Grouped.\n---\n");
    await store.save({
      id: "grouped-skill",
      name: "grouped-skill",
      libraryPath: skillPath,
      source: { type: "local", path: skillPath },
      installedAt: "2026-05-12T00:00:00.000Z",
      keepUpdated: false,
      enabled: true,
      tags: [],
      validation: { valid: true, issues: [] }
    });
    await store.saveSkillSet({
      name: "Automation",
      skillIds: ["grouped-skill"],
      targets: [{ path: "~/project-target", enabled: true }]
    });

    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(globalTarget)],
      globalTargetInstallMode: "symlink",
      projectTargetInstallMode: "copy",
      skillSets: (await store.libraryState()).skillSets
    });

    const projectInstalled = path.join(projectTarget, "grouped-skill");
    expect((await fs.lstat(projectInstalled)).isDirectory()).toBe(true);
    expect((await fs.lstat(projectInstalled)).isSymbolicLink()).toBe(false);
  });

  it("discovers target skill folders as copies when globalTargetInstallMode is copy", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "example");

    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");

    const result = await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy",
      import: true
    });

    expect(result.imported).toHaveLength(1);
    expect((await fs.lstat(skill)).isDirectory()).toBe(true);
    expect((await fs.lstat(skill)).isSymbolicLink()).toBe(false);
  });

  it("reuses an up-to-date managed copy without rewriting it", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    const contentHash = await hashDirectory(librarySkill);
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash,
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });

    const before = await fs.readFile(path.join(targetSkill, "SKILL.md"), "utf8");
    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });

    expect(await fs.readFile(path.join(targetSkill, "SKILL.md"), "utf8")).toBe(before);
    expect((await fs.lstat(targetSkill)).isSymbolicLink()).toBe(false);
  });

  it("refreshes stale managed copies during copy-mode scans", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    const contentHash = await hashDirectory(librarySkill);
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash,
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });
    await fs.writeFile(path.join(targetSkill, "SKILL.md"), "---\nname: example\ndescription: Stale.\n---\n");

    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });

    await expect(fs.readFile(path.join(targetSkill, "SKILL.md"), "utf8")).resolves.toContain("description: Example.");
  });

  it("removes stale managed copies before rewriting them", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);
    const { hashDirectory: originalHashDirectory } = await vi.importActual<typeof import("./file-ops.js")>(
      "./file-ops.js"
    );
    const hashSpy = vi.spyOn(fileOps, "hashDirectory");

    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    const contentHash = await hashDirectory(librarySkill);
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash,
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });

    hashSpy.mockImplementation(async (candidate) => {
      if (candidate === targetSkill) return "stale-hash";
      return originalHashDirectory(candidate);
    });

    try {
      await scanTargets({
        libraryPath: library,
        targets: [enabledTarget(target)],
        globalTargetInstallMode: "copy"
      });

      await expect(fs.readFile(path.join(targetSkill, "SKILL.md"), "utf8")).resolves.toContain("description: Example.");
    } finally {
      hashSpy.mockRestore();
    }
  });

  it("replaces unmanaged symlinks with copies when deploying in copy mode", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const foreign = path.join(tmp, "foreign");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(foreign);
    await fs.writeFile(path.join(foreign, "SKILL.md"), "---\nname: example\ndescription: Foreign.\n---\n");
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await fs.ensureDir(target);
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });
    await fs.symlink(foreign, targetSkill, "dir");

    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });

    expect((await fs.lstat(targetSkill)).isSymbolicLink()).toBe(false);
    await expect(fs.readFile(path.join(targetSkill, "SKILL.md"), "utf8")).resolves.toContain("description: Example.");
  });

  it("removes managed copies when switching to symlink mode", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });
    expect((await fs.lstat(targetSkill)).isSymbolicLink()).toBe(false);

    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "symlink"
    });

    expect((await fs.lstat(targetSkill)).isSymbolicLink()).toBe(true);
    expect(await fs.realpath(targetSkill)).toBe(await fs.realpath(librarySkill));
  });

  it("removes managed copies for disabled library skills", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    const contentHash = await hashDirectory(librarySkill);
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash,
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash,
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: false,
      tags: []
    });

    const result = await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });

    expect(result.disabled).toEqual([{ skillId: "example", targetPath: target }]);
    expect(await fs.pathExists(targetSkill)).toBe(false);
  });

  it("skips managed copies removed during disabled-target cleanup", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);
    const originalLstat = fs.lstat;
    let targetSkillStats = 0;

    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    const contentHash = await hashDirectory(librarySkill);
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash,
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });

    const lstat = vi.spyOn(fs, "lstat").mockImplementation(async (candidate, options) => {
      if (candidate === targetSkill) {
        targetSkillStats += 1;
        if (targetSkillStats === 2) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }

      return originalLstat(candidate as never, options as never) as never;
    });

    try {
      const result = await scanTargets({
        libraryPath: library,
        targets: [disabledTarget(target)],
        globalTargetInstallMode: "copy"
      });

      expect(result.disabled).toEqual([]);
    } finally {
      lstat.mockRestore();
    }
  });

  it("reports lstat failures while removing managed copies", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);
    const originalLstat = fs.lstat;
    let targetSkillStats = 0;

    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    const contentHash = await hashDirectory(librarySkill);
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash,
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });

    const lstat = vi.spyOn(fs, "lstat").mockImplementation(async (candidate, options) => {
      if (candidate === targetSkill) {
        targetSkillStats += 1;
        if (targetSkillStats === 2) throw Object.assign(new Error("lstat failed"), { code: "EACCES" });
      }

      return originalLstat(candidate as never, options as never) as never;
    });

    try {
      const result = await scanTargets({
        libraryPath: library,
        targets: [disabledTarget(target)],
        globalTargetInstallMode: "copy"
      });

      expect(result.errors).toEqual([{ path: targetSkill, message: "lstat failed" }]);
    } finally {
      lstat.mockRestore();
    }
  });

  it("ignores managed copies when content hashing fails during cleanup", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);
    const { hashDirectory: originalHashDirectory } = await vi.importActual<typeof import("./file-ops.js")>(
      "./file-ops.js"
    );
    const hashSpy = vi.spyOn(fileOps, "hashDirectory");
    let targetHashCalls = 0;

    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    const contentHash = await hashDirectory(librarySkill);
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash,
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });

    hashSpy.mockImplementation(async (candidate) => {
      if (candidate === targetSkill) {
        targetHashCalls += 1;
        if (targetHashCalls === 1) throw new Error("hash failed");
      }
      return originalHashDirectory(candidate);
    });

    try {
      const result = await scanTargets({
        libraryPath: library,
        targets: [enabledTarget(target)],
        globalTargetInstallMode: "copy"
      });

      expect(result.errors).toEqual([]);
      expect(await fs.pathExists(targetSkill)).toBe(true);
    } finally {
      hashSpy.mockRestore();
    }
  });

  it("skips plain files blocking copy-mode installs", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetFile = path.join(target, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(target);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await fs.writeFile(targetFile, "plain file");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    const result = await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });

    expect(result.enabled).toEqual([]);
    await expect(fs.readFile(targetFile, "utf8")).resolves.toBe("plain file");
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

  it("creates nested missing enabled target directories before syncing library skills", async () => {
    const target = path.join(tmp, "deep", "nested", "missing-target");
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
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result.enabled).toEqual([{ skillId: "example", targetPath: target }]);
    expect(await fs.pathExists(path.join(target, "example"))).toBe(true);
  });

  it("does not treat folders as managed copies when metadata has no content hash", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: false,
      tags: []
    });

    const result = await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });

    expect(result.disabled).toEqual([]);
    expect(await fs.pathExists(targetSkill)).toBe(true);
  });

  it("replaces invalid managed copy directories during copy-mode ensure", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(target);
    await fs.ensureDir(targetSkill);
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    const result = await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });

    // An empty/invalid directory in Skiller's slot is replaced with a fresh copy.
    expect(result.enabled).toEqual([{ skillId: "example", targetPath: target }]);
    expect(await fs.pathExists(path.join(targetSkill, "SKILL.md"))).toBe(true);
  });

  it("repopulates an empty target folder in copy mode", async () => {
    // Regression: an empty folder left in a target (e.g. after content loss)
    // must be refilled from the library rather than left empty forever.
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);

    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      contentHash: await hashDirectory(librarySkill),
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });
    // Pre-existing EMPTY target folder (no SKILL.md).
    await fs.ensureDir(targetSkill);

    const result = await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });

    expect(result.enabled).toEqual([{ skillId: "example", targetPath: target }]);
    await expect(fs.readFile(path.join(targetSkill, "SKILL.md"), "utf8")).resolves.toContain("description: Example.");
  });

  it("reports lstat failures while ensuring managed copies", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);
    const originalLstat = fs.lstat;
    let targetSkillStats = 0;

    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    await store.save({
      id: "example",
      name: "example",
      libraryPath: librarySkill,
      source: { type: "unknown" },
      installedAt: "2026-05-10T12:00:00.000Z",
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });

    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(target)],
      globalTargetInstallMode: "copy"
    });

    const lstat = vi.spyOn(fs, "lstat").mockImplementation(async (candidate, options) => {
      if (candidate === targetSkill) {
        targetSkillStats += 1;
        if (targetSkillStats === 2) throw Object.assign(new Error("lstat failed"), { code: "EACCES" });
      }

      return originalLstat(candidate as never, options as never) as never;
    });

    try {
      const result = await scanTargets({
        libraryPath: library,
        targets: [enabledTarget(target)],
        globalTargetInstallMode: "copy"
      });

      expect(result.errors).toEqual([{ path: targetSkill, message: "lstat failed" }]);
    } finally {
      lstat.mockRestore();
    }
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

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)], import: true });

    expect(result.imported.map((metadata) => metadata.id)).toEqual(["example-skill"]);
    await expect(fs.pathExists(path.join(library, "example-skill", "SKILL.md"))).resolves.toBe(true);
  });

  it("falls back to the folder slug when SKILL.md frontmatter is empty", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "Empty Frontmatter");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\n\n---\n");

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)], import: true });

    expect(result.imported.map((metadata) => metadata.id)).toEqual(["empty-frontmatter"]);
  });

  it("normalizes dot-only frontmatter names to a safe library id", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "dot-name");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: .\ndescription: Dot.\n---\n");

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)], import: true });

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

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(firstTarget), enabledTarget(secondTarget)], import: true });

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

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)], import: true });

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

    const firstResult = await scanTargets({ libraryPath: library, targets: [enabledTarget(firstTarget)], import: true });
    const secondResult = await scanTargets({ libraryPath: library, targets: [enabledTarget(secondTarget)], import: true });
    const saved = await new MetadataStore(library).list();

    expect(firstResult.imported.map((metadata) => metadata.id)).toEqual(["kata-health"]);
    expect(secondResult.imported).toHaveLength(0);
    expect(secondResult.enabled).toEqual([{ skillId: "kata-health", targetPath: secondTarget }]);
    expect(saved.map((metadata) => metadata.id)).toEqual(["kata-health"]);
    expect(saved[0]?.enabled).toBe(true);
    expect(await fs.pathExists(path.join(library, "kata-health-2"))).toBe(false);
    expect(await fs.realpath(secondSkill)).toBe(await fs.realpath(path.join(library, "kata-health")));
  });

  it("installs existing discovered skills as copies when importing from another target", async () => {
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

    await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(firstTarget)],
      globalTargetInstallMode: "copy",
      import: true
    });
    const secondResult = await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(secondTarget)],
      globalTargetInstallMode: "copy"
    });

    expect(secondResult.enabled).toEqual([{ skillId: "kata-health", targetPath: secondTarget }]);
    expect((await fs.lstat(secondSkill)).isDirectory()).toBe(true);
    expect((await fs.lstat(secondSkill)).isSymbolicLink()).toBe(false);
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

});
