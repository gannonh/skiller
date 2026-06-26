import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import { MetadataStore } from "./metadata-store.js";
import { discoverImportableSkills, importSkillsFromTargets, scanTargets } from "./scanner.js";
import { enabledTarget, disabledTarget, setupScannerTest, teardownScannerTest, tmp } from "./scanner.test-helpers.js";

describe("discoverImportableSkills", () => {
  beforeEach(async () => {
    await setupScannerTest();
  });

  afterEach(async () => {
    await teardownScannerTest();
  });

  it("rejects relative library paths", async () => {
    await expect(discoverImportableSkills({ libraryPath: "relative", targets: [] })).rejects.toThrow(
      "Library path must be absolute before discovering importable skills"
    );
  });

  it("lists unmanaged skill folders in enabled targets without importing", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "new-skill");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: new-skill\ndescription: New.\n---\n");

    const result = await discoverImportableSkills({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result).toEqual([
      { id: "new-skill", name: "new-skill", sourcePath: skill, targetPath: target, valid: true }
    ]);
    // Discovery must not write anything to the library.
    expect(await fs.pathExists(path.join(library, "skiller.manifest.json"))).toBe(false);
    expect(await fs.pathExists(path.join(library, "new-skill"))).toBe(false);
  });

  it("skips disabled targets, symlinks, and already-tracked skills", async () => {
    const target = path.join(tmp, "target");
    const disabled = path.join(tmp, "disabled");
    const library = path.join(tmp, "library");
    const store = new MetadataStore(library);

    // A managed symlink (Skiller-placed) must never be offered for import.
    const librarySkill = path.join(library, "managed");
    await fs.ensureDir(librarySkill);
    await fs.writeFile(path.join(librarySkill, "SKILL.md"), "---\nname: managed\ndescription: Managed.\n---\n");
    await store.save({
      id: "managed",
      name: "managed",
      libraryPath: librarySkill,
      source: { type: "local", path: librarySkill },
      installedAt: "2026-05-12T00:00:00.000Z",
      keepUpdated: false,
      enabled: true,
      tags: [],
      validation: { valid: true, issues: [] }
    });
    await fs.ensureDir(target);
    await fs.symlink(librarySkill, path.join(target, "managed"), "dir");

    // A tracked skill present as a real folder must be skipped too.
    const tracked = path.join(target, "managed-copy");
    await fs.ensureDir(tracked);
    await fs.writeFile(path.join(tracked, "SKILL.md"), "---\nname: managed\ndescription: Managed.\n---\n");

    // A genuinely new folder should be discovered.
    const fresh = path.join(target, "fresh");
    await fs.ensureDir(fresh);
    await fs.writeFile(path.join(fresh, "SKILL.md"), "---\nname: fresh\ndescription: Fresh.\n---\n");

    // Anything in a disabled target is ignored.
    await fs.ensureDir(disabled);
    const disabledSkill = path.join(disabled, "ignored");
    await fs.ensureDir(disabledSkill);
    await fs.writeFile(path.join(disabledSkill, "SKILL.md"), "---\nname: ignored\ndescription: Ignored.\n---\n");

    const result = await discoverImportableSkills({
      libraryPath: library,
      targets: [enabledTarget(target), disabledTarget(disabled)]
    });

    expect(result.map((skill) => skill.id)).toEqual(["fresh"]);
  });

  it("ignores plain files and dedupes the same skill id across targets", async () => {
    const target = path.join(tmp, "target");
    const other = path.join(tmp, "other");
    const library = path.join(tmp, "library");
    await fs.ensureDir(target);
    await fs.ensureDir(other);
    // A plain file in the target is not a skill directory.
    await fs.writeFile(path.join(target, "README.md"), "just a file");
    const skill = path.join(target, "fresh");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: fresh\ndescription: Fresh.\n---\n");
    // The same skill id present in a second target must be offered only once.
    const dup = path.join(other, "fresh-copy");
    await fs.ensureDir(dup);
    await fs.writeFile(path.join(dup, "SKILL.md"), "---\nname: fresh\ndescription: Fresh.\n---\n");

    const result = await discoverImportableSkills({
      libraryPath: library,
      targets: [enabledTarget(target), enabledTarget(other)]
    });

    expect(result.map((skill) => skill.id)).toEqual(["fresh"]);
  });

  it("skips targets that contain the library directory", async () => {
    // A target that is an ancestor of the library is unsafe and must be ignored.
    const unsafeTarget = path.join(tmp, "workspace");
    const library = path.join(unsafeTarget, "library");
    await fs.ensureDir(library);
    const skill = path.join(unsafeTarget, "fresh");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: fresh\ndescription: Fresh.\n---\n");

    const result = await discoverImportableSkills({
      libraryPath: library,
      targets: [enabledTarget(unsafeTarget)]
    });

    expect(result).toEqual([]);
  });

  it("returns an empty list when a target directory does not exist", async () => {
    const library = path.join(tmp, "library");
    const missing = path.join(tmp, "missing-target");

    const result = await discoverImportableSkills({ libraryPath: library, targets: [enabledTarget(missing)] });

    expect(result).toEqual([]);
  });

  it("skips entries that vanish mid-scan and rethrows other lstat errors", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "fresh");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: fresh\ndescription: Fresh.\n---\n");

    // A vanished entry (ENOENT) is skipped, leaving an empty result.
    const enoent = Object.assign(new Error("gone"), { code: "ENOENT" });
    const enoentSpy = vi.spyOn(fs, "lstat").mockRejectedValueOnce(enoent as never);
    await expect(
      discoverImportableSkills({ libraryPath: library, targets: [enabledTarget(target)] })
    ).resolves.toEqual([]);
    enoentSpy.mockRestore();

    // Any other lstat error aborts discovery.
    const eacces = Object.assign(new Error("denied"), { code: "EACCES" });
    const eaccesSpy = vi.spyOn(fs, "lstat").mockRejectedValueOnce(eacces as never);
    await expect(
      discoverImportableSkills({ libraryPath: library, targets: [enabledTarget(target)] })
    ).rejects.toThrow("denied");
    eaccesSpy.mockRestore();
  });

  it("throws on non-ENOENT readdir failures", async () => {
    const library = path.join(tmp, "library");
    // A target path that is a file (not a directory) makes readdir throw ENOTDIR.
    const fileTarget = path.join(tmp, "file-target");
    await fs.writeFile(fileTarget, "not a directory");

    await expect(
      discoverImportableSkills({ libraryPath: library, targets: [enabledTarget(fileTarget)] })
    ).rejects.toThrow();
  });

  it("marks invalid skills as not valid", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "broken");
    await fs.ensureDir(skill);
    // SKILL.md with no frontmatter name/description is invalid.
    await fs.writeFile(path.join(skill, "SKILL.md"), "no frontmatter here");

    const result = await discoverImportableSkills({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result).toHaveLength(1);
    expect(result[0]!.valid).toBe(false);
  });
});

describe("importSkillsFromTargets", () => {
  beforeEach(async () => {
    await setupScannerTest();
  });

  afterEach(async () => {
    await teardownScannerTest();
  });

  it("rejects relative library paths", async () => {
    await expect(importSkillsFromTargets({ libraryPath: "relative", sourcePaths: [] })).rejects.toThrow(
      "Library path must be absolute before importing skills"
    );
  });

  it("imports selected skill folders into the library", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const first = path.join(target, "first");
    const second = path.join(target, "second");
    await fs.ensureDir(first);
    await fs.ensureDir(second);
    await fs.writeFile(path.join(first, "SKILL.md"), "---\nname: first\ndescription: First.\n---\n");
    await fs.writeFile(path.join(second, "SKILL.md"), "---\nname: second\ndescription: Second.\n---\n");

    // Import only the first one.
    const imported = await importSkillsFromTargets({ libraryPath: library, sourcePaths: [first] });

    expect(imported.map((skill) => skill.id)).toEqual(["first"]);
    expect(await fs.pathExists(path.join(library, "first", "SKILL.md"))).toBe(true);
    expect(await fs.pathExists(path.join(library, "second"))).toBe(false);

    const saved = await new MetadataStore(library).list();
    expect(saved.map((skill) => skill.id)).toEqual(["first"]);
    expect(saved[0]!.source).toEqual({ type: "unknown", discoveredFrom: first });
  });

  it("dedupes ids when a library folder already exists", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const existing = path.join(library, "first");
    await fs.ensureDir(existing);
    await fs.writeFile(path.join(existing, "SKILL.md"), "---\nname: old\ndescription: Old.\n---\n");
    const skill = path.join(target, "first");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: first\ndescription: First.\n---\n");

    const imported = await importSkillsFromTargets({ libraryPath: library, sourcePaths: [skill] });

    expect(imported.map((skill) => skill.id)).toEqual(["first-2"]);
  });

  it("rolls back the library copy when saving metadata fails", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "fresh");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: fresh\ndescription: Fresh.\n---\n");
    // Make the manifest path a directory so writeManifest fails after the copy.
    await fs.ensureDir(path.join(library, "skiller.manifest.json"));

    await expect(importSkillsFromTargets({ libraryPath: library, sourcePaths: [skill] })).rejects.toThrow();
    // The partial library copy must have been rolled back.
    expect(await fs.pathExists(path.join(library, "fresh"))).toBe(false);
  });

  it("ignores source paths that are not skill directories", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const notASkill = path.join(target, "plain");
    await fs.ensureDir(notASkill);

    const imported = await importSkillsFromTargets({ libraryPath: library, sourcePaths: [notASkill] });

    expect(imported).toEqual([]);
  });

  it("a normal scan does not re-import unmanaged target folders", async () => {
    // Regression: previously scanTargets adopted any unmanaged SKILL.md folder,
    // causing a feedback loop that produced -2, -3, ... duplicates.
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "stray");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: stray\ndescription: Stray.\n---\n");

    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(target)] });

    expect(result.imported).toEqual([]);
    expect(await fs.pathExists(path.join(library, "stray"))).toBe(false);
    const saved = await new MetadataStore(library).list();
    expect(saved).toEqual([]);
  });

  it("imported skills are then distributed by a normal one-way scan", async () => {
    const target = path.join(tmp, "target");
    const otherTarget = path.join(tmp, "other-target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "fresh");
    await fs.ensureDir(skill);
    await fs.ensureDir(otherTarget);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: fresh\ndescription: Fresh.\n---\n");

    await importSkillsFromTargets({ libraryPath: library, sourcePaths: [skill] });
    // A normal scan (no import flag) should now distribute the imported skill.
    const result = await scanTargets({ libraryPath: library, targets: [enabledTarget(otherTarget)] });

    expect(result.enabled).toContainEqual({ skillId: "fresh", targetPath: otherTarget });
    expect(await fs.pathExists(path.join(otherTarget, "fresh"))).toBe(true);
  });
});
