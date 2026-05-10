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
  it("rejects relative library paths before scanning targets", async () => {
    const target = path.join(tmp, "target");
    const skill = path.join(target, "example");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");

    await expect(scanTargets({ libraryPath: "relative-library", targetDirectories: [target] })).rejects.toThrow(
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

    const result = await scanTargets({ libraryPath: library, targetDirectories: [target] });

    expect(result.imported).toHaveLength(1);
    expect(await fs.pathExists(path.join(library, "example", "SKILL.md"))).toBe(true);
    expect((await fs.lstat(skill)).isSymbolicLink()).toBe(true);
  });

  it("falls back to the folder slug when SKILL.md has no frontmatter name", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "Example Skill");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "Plain markdown");

    const result = await scanTargets({ libraryPath: library, targetDirectories: [target] });

    expect(result.imported.map((metadata) => metadata.id)).toEqual(["example-skill"]);
    await expect(fs.pathExists(path.join(library, "example-skill", "SKILL.md"))).resolves.toBe(true);
  });

  it("falls back to the folder slug when SKILL.md frontmatter is empty", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "Empty Frontmatter");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\n\n---\n");

    const result = await scanTargets({ libraryPath: library, targetDirectories: [target] });

    expect(result.imported.map((metadata) => metadata.id)).toEqual(["empty-frontmatter"]);
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

    const result = await scanTargets({ libraryPath: library, targetDirectories: [firstTarget, secondTarget] });

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

    const result = await scanTargets({ libraryPath: library, targetDirectories: [target] });

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

    const firstResult = await scanTargets({ libraryPath: library, targetDirectories: [firstTarget] });
    const secondResult = await scanTargets({ libraryPath: library, targetDirectories: [secondTarget] });
    const saved = await new MetadataStore(library).list();

    expect(firstResult.imported.map((metadata) => metadata.id)).toEqual(["kata-health"]);
    expect(secondResult.imported).toHaveLength(0);
    expect(secondResult.enabled.map((metadata) => metadata.id)).toEqual(["kata-health"]);
    expect(saved.map((metadata) => metadata.id)).toEqual(["kata-health"]);
    expect(saved[0]?.enabledTargets).toEqual([firstTarget, secondTarget]);
    expect(await fs.pathExists(path.join(library, "kata-health-2"))).toBe(false);
    expect(await fs.realpath(secondSkill)).toBe(await fs.realpath(path.join(library, "kata-health")));
  });

  it("skips stale target entries that disappear during scanning", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    await fs.ensureDir(target);

    const readdir = vi.spyOn(fs, "readdir").mockResolvedValueOnce(["missing-skill"] as never);

    const result = await scanTargets({ libraryPath: library, targetDirectories: [target] });

    expect(result.imported).toHaveLength(0);
    expect(result.enabled).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    readdir.mockRestore();
  });

  it("skips broken target symlinks", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const brokenSkill = path.join(target, "executing-plans");

    await fs.ensureDir(target);
    await fs.symlink(path.join(tmp, "missing", "executing-plans"), brokenSkill, "dir");

    const result = await scanTargets({ libraryPath: library, targetDirectories: [target] });

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

    const result = await scanTargets({ libraryPath: library, targetDirectories: [target] });

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

    const result = await scanTargets({ libraryPath: library, targetDirectories: [target] });

    expect(result).toEqual({ imported: [], enabled: [], errors: [] });
    pathExists.mockRestore();
    stat.mockRestore();
  });

  it("skips target entries that are not skill directories", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    await fs.ensureDir(target);
    await fs.writeFile(path.join(target, "note.txt"), "not a skill");

    const result = await scanTargets({ libraryPath: library, targetDirectories: [target] });

    expect(result).toEqual({ imported: [], enabled: [], errors: [] });
  });

  it("stringifies non-Error scan failures", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "example");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    fileOpsMock.replaceWithSymlink.mockRejectedValueOnce("symlink failed");

    const result = await scanTargets({ libraryPath: library, targetDirectories: [target] });

    expect(result.errors).toEqual([{ path: skill, message: "symlink failed" }]);
  });

  it("does not save enabled target metadata when symlink replacement fails", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "example");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");
    fileOpsMock.replaceWithSymlink.mockRejectedValueOnce(new Error("symlink failed"));

    const result = await scanTargets({ libraryPath: library, targetDirectories: [target] });
    const saved = await new MetadataStore(library).list();

    expect(result.imported).toHaveLength(0);
    expect(result.errors).toEqual([{ path: skill, message: "symlink failed" }]);
    expect(saved).toHaveLength(0);
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
      enabledTargets: []
    });
    await fs.symlink(librarySkill, targetSkill);

    const result = await scanTargets({ libraryPath: library, targetDirectories: [target] });
    const saved = await store.list();

    expect(result.imported).toHaveLength(0);
    expect(result.enabled.map((metadata) => metadata.id)).toEqual(["example"]);
    expect(saved[0]?.enabledTargets).toEqual([target]);
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
      enabledTargets: []
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
      enabledTargets: []
    });
    await fs.symlink(librarySkill, targetSkill);

    const result = await scanTargets({ libraryPath: library, targetDirectories: [target] });

    expect(result.enabled.map((metadata) => metadata.id)).toEqual(["zz-example"]);
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

    const result = await scanTargets({ libraryPath: library, targetDirectories: [target] });

    expect(result).toEqual({ imported: [], enabled: [], errors: [] });
  });

  it("skips missing target directories", async () => {
    const library = path.join(tmp, "library");
    const result = await scanTargets({ libraryPath: library, targetDirectories: [path.join(tmp, "missing-target")] });

    expect(result).toEqual({ imported: [], enabled: [], errors: [] });
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
      enabledTargets: [agentsTarget, claudeTarget, codexTarget]
    });
    await fs.symlink(librarySkill, agentsSkill);

    const result = await scanTargets({ libraryPath: library, targetDirectories: [agentsTarget, claudeTarget, codexTarget] });
    const saved = await store.list();

    expect(result.enabled.map((metadata) => metadata.id)).toEqual(["agent-browser"]);
    expect(saved[0]?.enabledTargets).toEqual([agentsTarget]);
  });

  it("skips target directories that equal the library root", async () => {
    const library = path.join(tmp, "library");
    const skill = path.join(library, "example");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");

    const result = await scanTargets({ libraryPath: library, targetDirectories: [library] });

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

    const result = await scanTargets({ libraryPath: library, targetDirectories: [target] });

    expect(result.imported).toHaveLength(0);
    expect((await fs.lstat(skill)).isDirectory()).toBe(true);
    expect((await fs.lstat(skill)).isSymbolicLink()).toBe(false);
  });
});
