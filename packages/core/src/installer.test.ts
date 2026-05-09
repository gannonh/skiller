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
    expect(metadata.source.type).toBe("local");
    await expect(fs.pathExists(path.join(library, "local", "SKILL.md"))).resolves.toBe(true);
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
});
