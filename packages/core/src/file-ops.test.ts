import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copySkillToLibrary, hashDirectory, replaceWithSymlink } from "./file-ops.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-file-ops-"));
});

afterEach(async () => {
  await fs.remove(tmp);
});

describe("file operations", () => {
  it("hashes directory content deterministically", async () => {
    const skill = path.join(tmp, "skill");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "hello");

    await expect(hashDirectory(skill)).resolves.toMatch(/^[a-f0-9]{64}$/);
  });

  it("frames hashed paths and contents unambiguously", async () => {
    const first = path.join(tmp, "first");
    const second = path.join(tmp, "second");
    await fs.ensureDir(first);
    await fs.ensureDir(second);
    await fs.writeFile(path.join(first, "ab"), "c");
    await fs.writeFile(path.join(second, "a"), "bc");

    await expect(hashDirectory(first)).resolves.not.toBe(await hashDirectory(second));
  });

  it("copies a skill into the library", async () => {
    const source = path.join(tmp, "source");
    const library = path.join(tmp, "library");
    await fs.ensureDir(source);
    await fs.writeFile(path.join(source, "SKILL.md"), "hello");

    const copied = await copySkillToLibrary(source, library, "example");
    await expect(fs.pathExists(path.join(copied, "SKILL.md"))).resolves.toBe(true);
  });

  it("replaces a target folder with a symlink", async () => {
    const source = path.join(tmp, "master");
    const target = path.join(tmp, "target");
    await fs.ensureDir(source);
    await fs.ensureDir(target);
    await fs.writeFile(path.join(source, "SKILL.md"), "hello");

    await replaceWithSymlink(target, source);
    const stat = await fs.lstat(target);
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it("restores the target folder if symlink creation fails", async () => {
    const source = path.join(tmp, "master");
    const target = path.join(tmp, "target");
    await fs.ensureDir(source);
    await fs.ensureDir(target);
    await fs.writeFile(path.join(target, "SKILL.md"), "target");
    vi.spyOn(fs, "symlink").mockRejectedValueOnce(new Error("symlink failed"));

    await expect(replaceWithSymlink(target, source)).rejects.toThrow("symlink failed");
    await expect(fs.readFile(path.join(target, "SKILL.md"), "utf8")).resolves.toBe("target");
  });

  it("removes the created symlink before restoring if backup cleanup fails", async () => {
    const source = path.join(tmp, "master");
    const target = path.join(tmp, "target");
    await fs.ensureDir(source);
    await fs.ensureDir(target);
    await fs.writeFile(path.join(target, "SKILL.md"), "target");
    vi.spyOn(fs, "remove").mockImplementationOnce(async () => {
      throw new Error("cleanup failed");
    });

    await expect(replaceWithSymlink(target, source)).rejects.toThrow("cleanup failed");
    await expect(fs.readFile(path.join(target, "SKILL.md"), "utf8")).resolves.toBe("target");
  });
});
