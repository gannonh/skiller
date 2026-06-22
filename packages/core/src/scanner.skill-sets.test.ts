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

describe("scanTargets skill sets", () => {
  beforeEach(async () => {
    await setupScannerTest(() => fileOpsMock.replaceWithSymlink.mockClear());
  });

  afterEach(async () => {
    await teardownScannerTest();
  });

  it("syncs grouped skills only to configured skill set targets", async () => {
    const globalTarget = path.join(tmp, "global-target");
    const setTarget = path.join(tmp, "set-target");
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
      targetScope: "projects",
      tags: [],
      validation: { valid: true, issues: [] }
    });
    await store.saveSkillSet({
      name: "Automation",
      skillIds: ["grouped-skill"],
      targets: [enabledTarget(setTarget)]
    });

    const result = await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(globalTarget)],
      skillSets: (await store.libraryState()).skillSets
    });

    expect(result.enabled).toEqual([{ skillId: "grouped-skill", targetPath: setTarget }]);
    expect(await fs.pathExists(path.join(setTarget, "grouped-skill"))).toBe(true);
    expect(await fs.pathExists(path.join(globalTarget, "grouped-skill"))).toBe(false);
  });

  it("allows enabled project targets to use a path that is disabled globally", async () => {
    const sharedTarget = path.join(tmp, "shared-target");
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
      targets: [{ path: sharedTarget, enabled: true, scope: "project" }]
    });

    const result = await scanTargets({
      libraryPath: library,
      targets: [disabledTarget(sharedTarget)],
      skillSets: (await store.libraryState()).skillSets
    });

    expect(result.enabled).toEqual([{ skillId: "grouped-skill", targetPath: sharedTarget }]);
  });

  it("removes grouped skill symlinks from disallowed global targets", async () => {
    const globalTarget = path.join(tmp, "global-target");
    const setTarget = path.join(tmp, "set-target");
    const library = path.join(tmp, "library");
    const skillPath = path.join(library, "grouped-skill");
    const store = new MetadataStore(library);

    await fs.ensureDir(globalTarget);
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
      targetScope: "projects",
      tags: [],
      validation: { valid: true, issues: [] }
    });
    await fs.symlink(skillPath, path.join(globalTarget, "grouped-skill"), "dir");
    await store.saveSkillSet({
      name: "Automation",
      skillIds: ["grouped-skill"],
      targets: [enabledTarget(setTarget)]
    });

    const result = await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(globalTarget)],
      skillSets: (await store.libraryState()).skillSets
    });

    expect(result.disabled).toEqual([{ skillId: "grouped-skill", targetPath: globalTarget }]);
    expect(await fs.pathExists(path.join(globalTarget, "grouped-skill"))).toBe(false);
  });

  it("falls back to global targets for grouped skills in sets without targets", async () => {
    const globalTarget = path.join(tmp, "global-target");
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
      targets: []
    });

    const result = await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(globalTarget)],
      skillSets: (await store.libraryState()).skillSets
    });

    expect(result.enabled).toEqual([{ skillId: "grouped-skill", targetPath: globalTarget }]);
  });

  it("honors per-skill-set global target toggles over config defaults", async () => {
    const globalTarget = path.join(tmp, "global-target");
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
      targets: [{ path: globalTarget, enabled: false, scope: "global" }]
    });

    const result = await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(globalTarget)],
      skillSets: (await store.libraryState()).skillSets
    });

    expect(result.enabled).toEqual([]);
    expect(await fs.pathExists(path.join(globalTarget, "grouped-skill"))).toBe(false);
  });

  it("does not fall back to global targets when every explicit skill set target is disabled", async () => {
    const globalTarget = path.join(tmp, "global-target");
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
      targetScope: "projects",
      tags: [],
      validation: { valid: true, issues: [] }
    });
    await store.saveSkillSet({
      name: "Automation",
      skillIds: ["grouped-skill"],
      targets: [{ path: globalTarget, enabled: false, scope: "global" }]
    });

    const result = await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(globalTarget)],
      skillSets: (await store.libraryState()).skillSets
    });

    expect(result.enabled).toEqual([]);
    expect(await fs.pathExists(path.join(globalTarget, "grouped-skill"))).toBe(false);
  });

  it("does not scan removed global targets that remain in skill set selections", async () => {
    const removedGlobalTarget = path.join(tmp, "removed-global-target");
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
      targets: [{ path: removedGlobalTarget, enabled: true, scope: "global" }]
    });

    const result = await scanTargets({
      libraryPath: library,
      targets: [],
      skillSets: (await store.libraryState()).skillSets
    });

    expect(result.enabled).toEqual([]);
    expect(await fs.pathExists(removedGlobalTarget)).toBe(false);
  });

  it("honors explicit skill set inputs without reloading library state", async () => {
    const storedTarget = path.join(tmp, "stored-target");
    const explicitTarget = path.join(tmp, "explicit-target");
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
    await store.saveSkillSet({
      name: "Stored Only",
      skillIds: ["example"],
      targets: [{ path: storedTarget, enabled: true, scope: "project" }]
    });

    const result = await scanTargets({
      libraryPath: library,
      targets: [enabledTarget(explicitTarget)],
      skillSets: []
    });

    expect(result.enabled).toEqual([{ skillId: "example", targetPath: explicitTarget }]);
    expect(await fs.pathExists(path.join(storedTarget, "example"))).toBe(false);
  });

  it("rethrows unexpected realpath failures while resolving effective target paths", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(library, "example");
    const store = new MetadataStore(library);
    const originalRealpath = fs.realpath;

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

    const realpath = vi.spyOn(fs, "realpath").mockImplementation(async (candidate, options) => {
      if (candidate === target) throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      return originalRealpath(candidate as never, options as never) as never;
    });

    try {
      await expect(scanTargets({ libraryPath: library, targets: [enabledTarget(target)] })).rejects.toThrow(
        "permission denied"
      );
    } finally {
      realpath.mockRestore();
    }
  });

  it("ignores missing entries while scanning disabled targets", async () => {
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
      keepUpdated: false,
      validation: { valid: true, issues: [] },
      enabled: true,
      tags: []
    });
    await fs.ensureDir(targetSkill);

    const lstat = vi.spyOn(fs, "lstat").mockImplementation(async (candidate, options) => {
      if (candidate === targetSkill) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return originalLstat(candidate as never, options as never) as never;
    });

    try {
      const result = await scanTargets({ libraryPath: library, targets: [disabledTarget(target)] });
      expect(result.errors).toEqual([]);
    } finally {
      lstat.mockRestore();
    }
  });

  it("ignores EINVAL while resolving effective target paths", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(library, "example");
    const store = new MetadataStore(library);
    const originalRealpath = fs.realpath;

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

    const realpath = vi.spyOn(fs, "realpath").mockImplementation(async (candidate, options) => {
      if (candidate === target) throw Object.assign(new Error("invalid"), { code: "EINVAL" });
      return originalRealpath(candidate as never, options as never) as never;
    });

    try {
      const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });
      expect(result.errors).toEqual([]);
    } finally {
      realpath.mockRestore();
    }
  });

  it("records unexpected realpath failures while resolving symlinked library paths", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);
    const originalRealpath = fs.realpath;

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
    await fs.symlink(librarySkill, targetSkill, "dir");

    const realpath = vi.spyOn(fs, "realpath").mockImplementation(async (candidate, options) => {
      if (candidate === targetSkill) throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      return originalRealpath(candidate as never, options as never) as never;
    });

    try {
      const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });
      expect(result.errors).toContainEqual({ path: targetSkill, message: "permission denied" });
    } finally {
      realpath.mockRestore();
    }
  });

  it("ignores EINVAL while resolving symlinked library paths during reconciliation", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const librarySkill = path.join(library, "example");
    const targetSkill = path.join(target, "example");
    const store = new MetadataStore(library);
    const originalRealpath = fs.realpath;

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
    await fs.symlink(librarySkill, targetSkill, "dir");

    const realpath = vi.spyOn(fs, "realpath").mockImplementation(async (candidate, options) => {
      if (candidate === targetSkill) throw Object.assign(new Error("invalid"), { code: "EINVAL" });
      return originalRealpath(candidate as never, options as never) as never;
    });

    try {
      const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });
      expect(result.errors).toEqual([]);
    } finally {
      realpath.mockRestore();
    }
  });

});
