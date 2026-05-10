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
    await fs.ensureDir(path.join(skill, "references"));
    await fs.writeFile(path.join(skill, "SKILL.md"), "hello");
    await fs.writeFile(path.join(skill, "references", "note.md"), "nested");

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

  it("rejects nested file symlinks that resolve outside the skill source", async () => {
    const source = path.join(tmp, "source");
    const library = path.join(tmp, "library");
    const outside = path.join(tmp, "outside.txt");
    await fs.ensureDir(path.join(source, "scripts"));
    await fs.writeFile(path.join(source, "SKILL.md"), "hello");
    await fs.writeFile(outside, "secret");
    await fs.symlink(outside, path.join(source, "scripts", "outside.txt"));

    await expect(copySkillToLibrary(source, library, "example")).rejects.toThrow(
      "Symlink resolves outside skill source"
    );
    await expect(fs.pathExists(path.join(library, "example"))).resolves.toBe(false);
  });

  it("rejects nested directory symlinks that resolve outside the skill source", async () => {
    const source = path.join(tmp, "source");
    const library = path.join(tmp, "library");
    const outside = path.join(tmp, "outside");
    await fs.ensureDir(path.join(source, "scripts"));
    await fs.ensureDir(outside);
    await fs.writeFile(path.join(source, "SKILL.md"), "hello");
    await fs.writeFile(path.join(outside, "secret.txt"), "secret");
    await fs.symlink(outside, path.join(source, "scripts", "outside"), "dir");

    await expect(copySkillToLibrary(source, library, "example")).rejects.toThrow(
      "Symlink resolves outside skill source"
    );
    await expect(fs.pathExists(path.join(library, "example"))).resolves.toBe(false);
  });

  it("dereferences nested symlinks that resolve inside the skill source", async () => {
    const source = path.join(tmp, "source");
    const library = path.join(tmp, "library");
    await fs.ensureDir(path.join(source, "scripts"));
    await fs.writeFile(path.join(source, "SKILL.md"), "hello");
    await fs.writeFile(path.join(source, "scripts", "tool.sh"), "echo hi");
    await fs.symlink(path.join(source, "scripts", "tool.sh"), path.join(source, "linked-tool.sh"));

    const copied = await copySkillToLibrary(source, library, "example");
    const stat = await fs.lstat(path.join(copied, "linked-tool.sh"));

    expect(stat.isFile()).toBe(true);
    await expect(fs.readFile(path.join(copied, "linked-tool.sh"), "utf8")).resolves.toBe("echo hi");
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

  it("preserves the original failure when rollback also fails", async () => {
    const source = path.join(tmp, "master");
    const target = path.join(tmp, "target");
    const originalMove = fs.move;
    await fs.ensureDir(source);
    await fs.ensureDir(target);
    await fs.writeFile(path.join(target, "SKILL.md"), "target");
    vi.spyOn(fs, "symlink").mockRejectedValueOnce(new Error("symlink failed"));
    vi.spyOn(fs, "move")
      .mockImplementationOnce(originalMove)
      .mockRejectedValueOnce(new Error("rollback failed"));

    await expect(replaceWithSymlink(target, source)).rejects.toMatchObject({
      message: "replaceWithSymlink failed and rollback failed",
      errors: [expect.objectContaining({ message: "symlink failed" }), expect.objectContaining({ message: "rollback failed" })]
    });
  });
});
