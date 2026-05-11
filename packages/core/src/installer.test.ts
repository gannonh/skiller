import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installGithubSkill, installLocalSkill, installSkillsShSkill } from "./installer.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-installer-"));
});

afterEach(async () => {
  await fs.remove(tmp);
});

function mockFetch(handler: (url: string) => Promise<Response> | Response): typeof fetch {
  return vi.fn(async (input: Parameters<typeof fetch>[0]) => handler(String(input))) as unknown as typeof fetch;
}

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
    await expect(fs.pathExists(path.join(library, "local", "skiller.metadata.json"))).resolves.toBe(false);
    await expect(fs.readJson(path.join(library, "skiller.manifest.json"))).resolves.toMatchObject({
      version: 1,
      skills: [{ id: "local" }]
    });
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

  it("stores the original local path and parsed description", async () => {
    const source = path.join(tmp, "source");
    const library = path.join(tmp, "library");
    await fs.ensureDir(source);
    await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: local\ndescription: Local description.\n---\n");

    const metadata = await installLocalSkill({ sourcePath: source, libraryPath: library });

    expect(metadata.description).toBe("Local description.");
    expect(metadata.source).toEqual({ type: "local", path: source });
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
    const arrayFrontmatter = path.join(tmp, "array-frontmatter");
    const library = path.join(tmp, "library");
    await fs.ensureDir(noFrontmatter);
    await fs.ensureDir(nonStringName);
    await fs.ensureDir(arrayFrontmatter);
    await fs.writeFile(path.join(noFrontmatter, "SKILL.md"), "Plain markdown");
    await fs.writeFile(path.join(nonStringName, "SKILL.md"), "---\nname: 123\ndescription: Local.\n---\n");
    await fs.writeFile(path.join(arrayFrontmatter, "SKILL.md"), "---\n- one\n---\n");

    await expect(installLocalSkill({ sourcePath: noFrontmatter, libraryPath: library })).resolves.toMatchObject({
      id: "no-frontmatter"
    });
    await expect(installLocalSkill({ sourcePath: nonStringName, libraryPath: library })).resolves.toMatchObject({
      id: "non-string-name"
    });
    await expect(installLocalSkill({ sourcePath: arrayFrontmatter, libraryPath: library })).resolves.toMatchObject({
      id: "array-frontmatter"
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

describe("remote installers", () => {
  it("installs a GitHub skill with resolved provenance", async () => {
    const library = path.join(tmp, "library");
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "abc123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/abc123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "skills/browser/SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/example/skills/abc123/skills/browser/SKILL.md") {
        return new Response("---\nname: browser\ndescription: Browser skill.\n---\n");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const metadata = await installGithubSkill({
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/browser",
      ref: "main",
      libraryPath: library,
      fetchImpl
    });

    expect(metadata).toMatchObject({
      id: "browser",
      name: "browser",
      description: "Browser skill.",
      source: {
        type: "github",
        githubUrl: "https://github.com/example/skills",
        githubPath: "skills/browser",
        ref: "main",
        commit: "abc123"
      },
      keepUpdated: true
    });
    await expect(fs.pathExists(path.join(library, "browser", "SKILL.md"))).resolves.toBe(true);
  });

  it("installs a skills.sh skill with registry and resolved provenance", async () => {
    const library = path.join(tmp, "library");
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/stable") {
        return new Response(JSON.stringify({ sha: "def456" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/def456?recursive=1") {
        return new Response(
          JSON.stringify({ tree: [{ path: "skills/registry-browser/SKILL.md", type: "blob" }] })
        );
      }

      if (url === "https://raw.githubusercontent.com/example/skills/def456/skills/registry-browser/SKILL.md") {
        return new Response("---\nname: registry-browser\ndescription: Registry browser skill.\n---\n");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });
    const client = {
      skill: vi.fn(async () => ({
        id: "registry-browser",
        githubUrl: "https://github.com/example/skills",
        githubPath: "skills/registry-browser",
        ref: "stable"
      }))
    };

    const metadata = await installSkillsShSkill({
      skillsShId: "registry-browser",
      libraryPath: library,
      client,
      fetchImpl
    });

    expect(client.skill).toHaveBeenCalledWith("registry-browser");
    expect(metadata).toMatchObject({
      id: "registry-browser",
      name: "registry-browser",
      description: "Registry browser skill.",
      source: {
        type: "skills.sh",
        skillsShId: "registry-browser",
        githubUrl: "https://github.com/example/skills",
        githubPath: "skills/registry-browser",
        ref: "stable",
        commit: "def456"
      },
      keepUpdated: true
    });
    await expect(fs.pathExists(path.join(library, "registry-browser", "SKILL.md"))).resolves.toBe(true);
  });

  it("installs a skills.sh skill from public search fallback data", async () => {
    const library = path.join(tmp, "library");
    const fetchImpl = mockFetch((url) => {
      if (url === "https://skills.sh/api/v1/skills/agent-browser") {
        return new Response("nope", { status: 401, statusText: "Unauthorized" });
      }

      if (url === "https://skills.sh/api/search?q=agent-browser") {
        return new Response(
          JSON.stringify({
            skills: [
              {
                id: "example/skills/agent-browser",
                skillId: "agent-browser",
                name: "agent-browser",
                source: "example/skills"
              }
            ]
          })
        );
      }

      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "abc123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/abc123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "agent-browser/SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/example/skills/abc123/agent-browser/SKILL.md") {
        return new Response("---\nname: agent-browser\ndescription: Agent browser skill.\n---\n");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const metadata = await installSkillsShSkill({
      skillsShId: "agent-browser",
      libraryPath: library,
      fetchImpl
    });

    expect(metadata).toMatchObject({
      id: "agent-browser",
      name: "agent-browser",
      description: "Agent browser skill.",
      source: {
        type: "skills.sh",
        skillsShId: "example/skills/agent-browser",
        githubUrl: "https://github.com/example/skills",
        githubPath: "agent-browser",
        ref: "HEAD",
        commit: "abc123"
      },
      keepUpdated: true
    });
    await expect(fs.pathExists(path.join(library, "agent-browser", "SKILL.md"))).resolves.toBe(true);
  });
});
