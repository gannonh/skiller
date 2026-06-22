import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installGithubSkill, installLocalSkill, installSkillsShSkill, updateInstalledSkill } from "./installer.js";
import { MetadataStore } from "./metadata-store.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-installer-"));
});

afterEach(async () => {
  vi.unstubAllGlobals();
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

  it("fails loud when a skill with the same name already exists", async () => {
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

    expect(first.id).toBe("local");
    await expect(installLocalSkill({ sourcePath: secondSource, libraryPath: library })).rejects.toMatchObject({
      name: "DuplicateSkillNameError",
      skillId: "local",
      skillName: "local"
    });
    expect(await fs.readFile(path.join(library, "local", "SKILL.md"), "utf8")).toBe(firstContent);
    await expect(fs.pathExists(path.join(library, "local-2"))).resolves.toBe(false);
  });

  it("replaces an existing skill in place when requested", async () => {
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
    const second = await installLocalSkill({ sourcePath: secondSource, libraryPath: library, replaceExisting: true });

    expect(first.id).toBe("local");
    expect(second).toMatchObject({
      id: "local",
      name: "local",
      description: "Second."
    });
    expect(await fs.readFile(path.join(library, "local", "SKILL.md"), "utf8")).toBe(secondContent);
    await expect(fs.pathExists(path.join(library, "local-2"))).resolves.toBe(false);
  });

  it("preserves target scope when replacing an existing skill", async () => {
    const firstSource = path.join(tmp, "first-source");
    const secondSource = path.join(tmp, "second-source");
    const library = path.join(tmp, "library");

    await fs.ensureDir(firstSource);
    await fs.ensureDir(secondSource);
    await fs.writeFile(path.join(firstSource, "SKILL.md"), "---\nname: local\ndescription: First.\n---\n");
    await fs.writeFile(path.join(secondSource, "SKILL.md"), "---\nname: local\ndescription: Second.\n---\n");

    await installLocalSkill({ sourcePath: firstSource, libraryPath: library });
    const store = new MetadataStore(library);
    await store.setTargetScope("local", "projects");

    const second = await installLocalSkill({ sourcePath: secondSource, libraryPath: library, replaceExisting: true });

    expect(second.targetScope).toBe("projects");
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

  it("replaces a duplicate GitHub skill after approval without fetching it twice", async () => {
    const source = path.join(tmp, "source");
    const library = path.join(tmp, "library");
    await fs.ensureDir(source);
    await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: browser\ndescription: Existing.\n---\n");
    await installLocalSkill({ sourcePath: source, libraryPath: library });

    const fetchedUrls: string[] = [];
    const fetchImpl = mockFetch((url) => {
      fetchedUrls.push(url);
      if (fetchedUrls.filter((candidate) => candidate === url).length > 1) {
        throw new Error(`unexpected second fetch for ${url}`);
      }

      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "abc123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/abc123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "skills/browser/SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/example/skills/abc123/skills/browser/SKILL.md") {
        return new Response("---\nname: browser\ndescription: Replacement.\n---\n");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });
    const onDuplicateSkillName = vi.fn(async () => true);

    const metadata = await installGithubSkill({
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/browser",
      ref: "main",
      libraryPath: library,
      fetchImpl,
      onDuplicateSkillName
    });

    expect(onDuplicateSkillName).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "DuplicateSkillNameError",
        skillId: "browser",
        skillName: "browser"
      })
    );
    expect(metadata).toMatchObject({
      id: "browser",
      description: "Replacement.",
      source: {
        type: "github",
        githubUrl: "https://github.com/example/skills",
        githubPath: "skills/browser",
        ref: "main",
        commit: "abc123"
      }
    });
    expect(fetchedUrls).toEqual([
      "https://api.github.com/repos/example/skills/commits/main",
      "https://api.github.com/repos/example/skills/git/trees/abc123?recursive=1",
      "https://raw.githubusercontent.com/example/skills/abc123/skills/browser/SKILL.md"
    ]);
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

  it("installs a skills.sh skill from provided registry row data", async () => {
    const library = path.join(tmp, "library");
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "abc123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/abc123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "agent-browser/SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/example/skills/abc123/agent-browser/SKILL.md") {
        return new Response("---\nname: agent-browser\n---\n");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });
    const client = {
      skill: vi.fn(async () => {
        throw new Error("skill detail should not be fetched");
      })
    };

    const metadata = await installSkillsShSkill({
      skillsShId: "agent-browser",
      libraryPath: library,
      registrySkill: {
        id: "example/skills/agent-browser",
        skillId: "agent-browser",
        name: "agent-browser",
        source: "example/skills"
      },
      client,
      fetchImpl
    });

    expect(client.skill).not.toHaveBeenCalled();
    expect(metadata.source).toMatchObject({
      type: "skills.sh",
      skillsShId: "example/skills/agent-browser",
      githubUrl: "https://github.com/example/skills",
      githubPath: "agent-browser"
    });
  });

  it("installs a GitHub skill with defaults and global fetch", async () => {
    const library = path.join(tmp, "library");
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "abc123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/abc123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/example/skills/abc123/SKILL.md") {
        return new Response("---\nname: root-skill\n---\n");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });
    vi.stubGlobal("fetch", fetchImpl);

    const metadata = await installGithubSkill({
      githubUrl: "https://github.com/example/skills",
      libraryPath: library
    });

    expect(metadata.source).toMatchObject({
      type: "github",
      githubUrl: "https://github.com/example/skills",
      ref: "HEAD",
      commit: "abc123"
    });
  });

  it("installs a skills.sh skill from registry defaults and global fetch", async () => {
    const library = path.join(tmp, "library");
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "abc123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/abc123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/example/skills/abc123/SKILL.md") {
        return new Response("---\nname: root-skill\n---\n");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });
    vi.stubGlobal("fetch", fetchImpl);
    const client = {
      skill: vi.fn(async () => ({
        id: "example/skills/",
        githubUrl: "https://github.com/example/skills"
      }))
    };

    const metadata = await installSkillsShSkill({
      skillsShId: "root-skill",
      libraryPath: library,
      client
    });

    expect(metadata.source).toMatchObject({
      type: "skills.sh",
      skillsShId: "example/skills/",
      githubUrl: "https://github.com/example/skills",
      ref: "HEAD",
      commit: "abc123"
    });
  });

  it("installs a skills.sh skill with default client and global fetch", async () => {
    const library = path.join(tmp, "library");
    const fetchImpl = mockFetch((url) => {
      if (url === "https://skills.sh/api/v1/skills/root-skill") {
        return new Response(
          JSON.stringify({
            id: "root-skill",
            githubUrl: "https://github.com/example/skills"
          })
        );
      }

      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "abc123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/abc123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/example/skills/abc123/SKILL.md") {
        return new Response("---\nname: root-skill\n---\n");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });
    vi.stubGlobal("fetch", fetchImpl);

    const metadata = await installSkillsShSkill({
      skillsShId: "root-skill",
      libraryPath: library
    });

    expect(metadata.source).toMatchObject({
      type: "skills.sh",
      skillsShId: "root-skill",
      githubUrl: "https://github.com/example/skills",
      ref: "HEAD",
      commit: "abc123"
    });
  });
});

describe("updateInstalledSkill", () => {
  it("replaces a GitHub skill in place and updates its provenance", async () => {
    const library = path.join(tmp, "library");
    await fs.ensureDir(path.join(library, "browser"));
    await fs.writeFile(path.join(library, "browser", "SKILL.md"), "---\nname: browser\ndescription: Old.\n---\n");
    await fs.writeJson(path.join(library, "skiller.manifest.json"), {
      version: 1,
      skills: [
        {
          id: "browser",
          name: "browser",
          description: "Old.",
          libraryPath: path.join(library, "browser"),
          source: {
            type: "github",
            githubUrl: "https://github.com/example/skills",
            githubPath: "skills/browser",
            ref: "main",
            commit: "abc123"
          },
          installedAt: "2026-05-09T00:00:00.000Z",
          keepUpdated: true,
          enabled: false,
          validation: { valid: true, issues: [] }
        }
      ]
    });
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "def456" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/def456?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "skills/browser/SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/example/skills/def456/skills/browser/SKILL.md") {
        return new Response("---\nname: browser\ndescription: New.\n---\n");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const metadata = await updateInstalledSkill({
      skillId: "browser",
      libraryPath: library,
      fetchImpl
    });

    expect(metadata).toMatchObject({
      id: "browser",
      name: "browser",
      description: "New.",
      source: {
        type: "github",
        githubUrl: "https://github.com/example/skills",
        githubPath: "skills/browser",
        ref: "main",
        commit: "def456"
      },
      installedAt: "2026-05-09T00:00:00.000Z",
      keepUpdated: true,
      enabled: false
    });
    await expect(fs.readFile(path.join(library, "browser", "SKILL.md"), "utf8")).resolves.toContain("New.");
  });

  it("preserves organization fields when updating an installed skill", async () => {
    const library = path.join(tmp, "library");
    await fs.ensureDir(path.join(library, "browser"));
    await fs.writeFile(path.join(library, "browser", "SKILL.md"), "---\nname: browser\ndescription: Old.\n---\n");
    await fs.writeJson(path.join(library, "skiller.manifest.json"), {
      version: 1,
      skillSets: [
        {
          id: "automation",
          name: "Automation",
          skillIds: ["browser"],
          targets: [],
          createdAt: "2026-05-12T00:00:00.000Z",
          updatedAt: "2026-05-12T00:00:00.000Z"
        }
      ],
      skills: [
        {
          id: "browser",
          name: "browser",
          description: "Old.",
          libraryPath: path.join(library, "browser"),
          source: {
            type: "github",
            githubUrl: "https://github.com/example/skills",
            githubPath: "skills/browser",
            ref: "main",
            commit: "abc123"
          },
          installedAt: "2026-05-09T00:00:00.000Z",
          keepUpdated: true,
          enabled: true,
          tags: ["browser", "testing"],
          validation: { valid: true, issues: [] }
        }
      ]
    });
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "def456" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/def456?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "skills/browser/SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/example/skills/def456/skills/browser/SKILL.md") {
        return new Response("---\nname: browser\ndescription: New.\n---\n");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const updated = await updateInstalledSkill({
      skillId: "browser",
      libraryPath: library,
      fetchImpl
    });

    expect(updated).toMatchObject({
      id: "browser",
      tags: ["browser", "testing"]
    });
    await expect(new MetadataStore(library).libraryState()).resolves.toMatchObject({
      skillSets: [{ id: "automation", skillIds: ["browser"] }]
    });
  });

  it("rejects skills without an updateable source", async () => {
    const source = path.join(tmp, "source");
    const library = path.join(tmp, "library");
    await fs.ensureDir(source);
    await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: local\n---\n");
    await installLocalSkill({ sourcePath: source, libraryPath: library });

    await expect(updateInstalledSkill({ skillId: "local", libraryPath: library })).rejects.toThrow(
      "Skill cannot be updated: local"
    );
  });

  it("rejects missing skills", async () => {
    const library = path.join(tmp, "library");

    await expect(updateInstalledSkill({ skillId: "missing", libraryPath: library })).rejects.toThrow(
      "Skill not found: missing"
    );
  });

  it("replaces a skills.sh skill in place and preserves the registry id", async () => {
    const library = path.join(tmp, "library");
    await fs.ensureDir(path.join(library, "registry-browser"));
    await fs.writeFile(path.join(library, "registry-browser", "SKILL.md"), "---\nname: registry-browser\n---\n");
    await fs.writeJson(path.join(library, "skiller.manifest.json"), {
      version: 1,
      skills: [
        {
          id: "registry-browser",
          name: "registry-browser",
          libraryPath: path.join(library, "registry-browser"),
          source: {
            type: "skills.sh",
            skillsShId: "registry-browser",
            githubUrl: "https://github.com/example/skills",
            githubPath: "skills/registry-browser",
            ref: "main",
            commit: "abc123"
          },
          installedAt: "2026-05-09T00:00:00.000Z",
          keepUpdated: true,
          enabled: true,
          validation: { valid: true, issues: [] }
        }
      ]
    });
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "def456" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/def456?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "skills/registry-browser/SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/example/skills/def456/skills/registry-browser/SKILL.md") {
        return new Response("---\nname: registry-browser\ndescription: New.\n---\n");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const metadata = await updateInstalledSkill({
      skillId: "registry-browser",
      libraryPath: library,
      fetchImpl
    });

    expect(metadata.source).toMatchObject({
      type: "skills.sh",
      skillsShId: "registry-browser",
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/registry-browser",
      ref: "main",
      commit: "def456"
    });
  });

  it("updates a root GitHub skill with global fetch and stamps last checked metadata", async () => {
    const library = path.join(tmp, "library");
    await fs.ensureDir(path.join(library, "root-skill"));
    await fs.writeFile(path.join(library, "root-skill", "SKILL.md"), "---\nname: root-skill\n---\n");
    await fs.writeJson(path.join(library, "skiller.manifest.json"), {
      version: 1,
      skills: [
        {
          id: "root-skill",
          name: "Root Skill",
          libraryPath: path.join(library, "root-skill"),
          source: {
            type: "github",
            githubUrl: "https://github.com/example/skills",
            ref: "main",
            commit: "abc123"
          },
          installedAt: "2026-05-09T00:00:00.000Z",
          lastCheckedAt: "2026-05-10T00:00:00.000Z",
          keepUpdated: true,
          enabled: true,
          validation: { valid: true, issues: [] }
        }
      ]
    });
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "def456" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/def456?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/example/skills/def456/SKILL.md") {
        return new Response("---\nname: root-skill\n---\n");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });
    vi.stubGlobal("fetch", fetchImpl);

    const metadata = await updateInstalledSkill({
      skillId: "Root Skill",
      libraryPath: library
    });

    expect(metadata.lastCheckedAt).not.toBe("2026-05-10T00:00:00.000Z");
    expect(metadata.source).toMatchObject({
      type: "github",
      githubUrl: "https://github.com/example/skills",
      ref: "main",
      commit: "def456"
    });
  });
});
