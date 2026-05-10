import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installLocalSkill } from "./installer.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-installer-"));
});

afterEach(async () => {
  await fs.remove(tmp);
});

describe("installLocalSkill", () => {
  it("installs a local skill into the master library with metadata", async () => {
    const source = path.join(tmp, "source");
    const library = path.join(tmp, "library");
    await fs.ensureDir(source);
    await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: local\ndescription: Local.\n---\n");

    const metadata = await installLocalSkill({ sourcePath: source, libraryPath: library });

    expect(metadata.id).toBe("local");
    expect(metadata.name).toBe("local");
    expect(metadata.source.type).toBe("local");
    await expect(fs.pathExists(path.join(library, "local", "SKILL.md"))).resolves.toBe(true);
  });

  it("preserves the parsed display name in metadata", async () => {
    const source = path.join(tmp, "source");
    const library = path.join(tmp, "library");
    await fs.ensureDir(source);
    await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: My Amazing Skill\ndescription: Local.\n---\n");

    const metadata = await installLocalSkill({ sourcePath: source, libraryPath: library });

    expect(metadata.id).toBe("my-amazing-skill");
    expect(metadata.name).toBe("My Amazing Skill");
  });

  it("slugs path traversal names before copying into the library", async () => {
    const source = path.join(tmp, "source");
    const library = path.join(tmp, "library");
    const outside = path.join(tmp, "escape");
    await fs.ensureDir(source);
    await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: ../escape\ndescription: Local.\n---\n");

    const metadata = await installLocalSkill({ sourcePath: source, libraryPath: library });

    expect(metadata.id).toBe("escape");
    expect(metadata.libraryPath).toBe(path.join(library, "escape"));
    await expect(fs.pathExists(path.join(library, "escape", "SKILL.md"))).resolves.toBe(true);
    await expect(fs.pathExists(path.join(outside, "SKILL.md"))).resolves.toBe(false);
  });

  it("installs duplicate names into distinct paths without overwriting content", async () => {
    const firstSource = path.join(tmp, "first-source");
    const secondSource = path.join(tmp, "second-source");
    const library = path.join(tmp, "library");
    const firstContent = "---\nname: local\ndescription: First.\n---\n";
    const secondContent = "---\nname: local\ndescription: Second.\n---\n";

    await fs.ensureDir(firstSource);
    await fs.ensureDir(secondSource);
    await fs.writeFile(path.join(firstSource, "SKILL.md"), firstContent);
    await fs.writeFile(path.join(secondSource, "SKILL.md"), secondContent);

    const first = await installLocalSkill({ sourcePath: firstSource, libraryPath: library });
    const second = await installLocalSkill({ sourcePath: secondSource, libraryPath: library });

    expect(first.id).toBe("local");
    expect(second.id).toBe("local-2");
    expect(await fs.readFile(path.join(library, "local", "SKILL.md"), "utf8")).toBe(firstContent);
    expect(await fs.readFile(path.join(library, "local-2", "SKILL.md"), "utf8")).toBe(secondContent);
  });

  it("parses CRLF frontmatter names", async () => {
    const source = path.join(tmp, "source");
    const library = path.join(tmp, "library");
    await fs.ensureDir(source);
    await fs.writeFile(path.join(source, "SKILL.md"), "---\r\nname: crlf\r\ndescription: Local.\r\n---\r\n");

    const metadata = await installLocalSkill({ sourcePath: source, libraryPath: library });

    expect(metadata.id).toBe("crlf");
    await expect(fs.pathExists(path.join(library, "crlf", "SKILL.md"))).resolves.toBe(true);
  });

  it("falls back to source basename when frontmatter name parsing fails", async () => {
    const source = path.join(tmp, "fallback-source");
    const library = path.join(tmp, "library");
    await fs.ensureDir(source);
    await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: \"unterminated\ndescription: Local.\n---\n");

    const metadata = await installLocalSkill({ sourcePath: source, libraryPath: library });

    expect(metadata.id).toBe("fallback-source");
    expect(metadata.validation.valid).toBe(false);
    expect(metadata.validation.issues.map((issue) => issue.code)).toContain("invalid-frontmatter");
    await expect(fs.pathExists(path.join(library, "fallback-source", "SKILL.md"))).resolves.toBe(true);
  });

  it("falls back to source basename when frontmatter name is blank", async () => {
    const source = path.join(tmp, "blank-name-source");
    const library = path.join(tmp, "library");
    await fs.ensureDir(source);
    await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: \"   \"\ndescription: Local.\n---\n");

    const metadata = await installLocalSkill({ sourcePath: source, libraryPath: library });

    expect(metadata.id).toBe("blank-name-source");
  });

  it("falls back to source basename when frontmatter is absent or has a non-string name", async () => {
    const noFrontmatter = path.join(tmp, "no-frontmatter");
    const nonStringName = path.join(tmp, "non-string-name");
    const library = path.join(tmp, "library");
    await fs.ensureDir(noFrontmatter);
    await fs.ensureDir(nonStringName);
    await fs.writeFile(path.join(noFrontmatter, "SKILL.md"), "Plain markdown");
    await fs.writeFile(path.join(nonStringName, "SKILL.md"), "---\nname: 123\ndescription: Local.\n---\n");

    await expect(installLocalSkill({ sourcePath: noFrontmatter, libraryPath: library })).resolves.toMatchObject({
      id: "no-frontmatter"
    });
    await expect(installLocalSkill({ sourcePath: nonStringName, libraryPath: library })).resolves.toMatchObject({
      id: "non-string-name"
    });
  });

  it("falls back to source basename when frontmatter parses to empty", async () => {
    const source = path.join(tmp, "empty-frontmatter");
    const library = path.join(tmp, "library");
    await fs.ensureDir(source);
    await fs.writeFile(path.join(source, "SKILL.md"), "---\n\n---\n");

    await expect(installLocalSkill({ sourcePath: source, libraryPath: library })).resolves.toMatchObject({
      id: "empty-frontmatter"
    });
  });

  it("uses a generic id when the parsed name contains no slug characters", async () => {
    const source = path.join(tmp, "source");
    const library = path.join(tmp, "library");
    await fs.ensureDir(source);
    await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: \"!!!\"\ndescription: Local.\n---\n");

    const metadata = await installLocalSkill({ sourcePath: source, libraryPath: library });

    expect(metadata.id).toBe("skill");
  });
});
