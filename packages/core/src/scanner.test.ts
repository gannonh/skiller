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

  it("imports duplicate basenames into distinct library paths without overwriting content", async () => {
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
    expect(result.imported.map((metadata) => metadata.id)).toEqual(["example", "example-2"]);
    expect(await fs.readFile(path.join(library, "example", "SKILL.md"), "utf8")).toBe(firstContent);
    expect(await fs.readFile(path.join(library, "example-2", "SKILL.md"), "utf8")).toBe(secondContent);
    expect(await fs.realpath(firstSkill)).toBe(await fs.realpath(path.join(library, "example")));
    expect(await fs.realpath(secondSkill)).toBe(await fs.realpath(path.join(library, "example-2")));
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
