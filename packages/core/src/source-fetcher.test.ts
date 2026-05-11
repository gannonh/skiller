import fs from "fs-extra";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverGithubSkills,
  extractRegistrySkillSource,
  fetchGithubSkillSource,
  parseGithubRepository
} from "./source-fetcher.js";

const tempRoots: string[] = [];

function mockFetch(handler: (url: string) => Promise<Response> | Response): typeof fetch {
  return vi.fn(async (input: Parameters<typeof fetch>[0]) => handler(String(input))) as unknown as typeof fetch;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((dir) => fs.remove(dir)));
});

describe("parseGithubRepository", () => {
  it("parses github repository urls", () => {
    expect(parseGithubRepository("https://github.com/example/skills.git")).toEqual({
      owner: "example",
      repo: "skills"
    });
  });

  it("parses github file and raw urls", () => {
    expect(parseGithubRepository("https://github.com/example/skills/blob/main/browser/SKILL.md")).toEqual({
      owner: "example",
      repo: "skills"
    });
    expect(parseGithubRepository("https://raw.githubusercontent.com/example/skills/main/browser/SKILL.md")).toEqual({
      owner: "example",
      repo: "skills"
    });
  });

  it("returns null for non-github repository urls", () => {
    expect(parseGithubRepository("https://example.com/example/skills")).toBeNull();
    expect(parseGithubRepository("not a url")).toBeNull();
    expect(parseGithubRepository("https://github.com/example")).toBeNull();
    expect(parseGithubRepository("https://raw.githubusercontent.com/example/skills/main")).toBeNull();
  });
});

describe("extractRegistrySkillSource", () => {
  it("extracts github source fields from id/githubUrl/githubPath/ref payloads", () => {
    expect(
      extractRegistrySkillSource({
        id: "agent-browser",
        githubUrl: "https://github.com/example/skills",
        githubPath: "skills/agent-browser",
        ref: "main"
      })
    ).toEqual({
      skillsShId: "agent-browser",
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/agent-browser",
      ref: "main"
    });
  });

  it("extracts github source fields from slug/repositoryUrl/path/branch payloads", () => {
    expect(
      extractRegistrySkillSource({
        slug: "agent-browser",
        repositoryUrl: "https://github.com/example/skills",
        path: "skills/agent-browser",
        branch: "main"
      })
    ).toEqual({
      skillsShId: "agent-browser",
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/agent-browser",
      ref: "main"
    });
  });

  it("extracts github source fields from name/repoUrl/skillPath/tag aliases", () => {
    expect(
      extractRegistrySkillSource({
        name: "agent-browser",
        repoUrl: "https://github.com/example/skills",
        skillPath: "skills/agent-browser",
        tag: "v1.0.0"
      })
    ).toEqual({
      skillsShId: "agent-browser",
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/agent-browser",
      ref: "v1.0.0"
    });
  });

  it("extracts github source fields from snake-case and directory aliases", () => {
    expect(
      extractRegistrySkillSource({
        id: "agent-browser",
        github_url: "https://github.com/example/skills",
        github_path: "skills/agent-browser",
        ref: "main"
      })
    ).toEqual({
      skillsShId: "agent-browser",
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/agent-browser",
      ref: "main"
    });

    expect(
      extractRegistrySkillSource({
        id: "agent-browser",
        sourceUrl: "https://github.com/example/skills",
        directory: "skills/agent-browser"
      })
    ).toEqual({
      skillsShId: "agent-browser",
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/agent-browser"
    });
  });

  it("derives github source fields from public skills.sh search rows", () => {
    expect(
      extractRegistrySkillSource({
        id: "vercel-labs/agent-browser/agent-browser",
        skillId: "agent-browser",
        name: "agent-browser",
        source: "vercel-labs/agent-browser"
      })
    ).toEqual({
      skillsShId: "vercel-labs/agent-browser/agent-browser",
      githubUrl: "https://github.com/vercel-labs/agent-browser",
      githubPath: "agent-browser"
    });
  });

  it("rejects payloads without an id", () => {
    expect(() => extractRegistrySkillSource({ githubUrl: "https://github.com/example/skills" })).toThrow(
      "skills.sh payload is missing an id"
    );
  });

  it("rejects payloads without a github url", () => {
    expect(() => extractRegistrySkillSource({ id: "agent-browser" })).toThrow(
      "skills.sh payload is missing a GitHub URL"
    );
  });
});

describe("discoverGithubSkills", () => {
  it("lists skills from a repository url", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "alpha/SKILL.md", type: "blob" },
              { path: "beta/SKILL.md", type: "blob" },
              { path: "README.md", type: "blob" }
            ]
          })
        );
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/alpha/SKILL.md") {
        return new Response("---\nname: Alpha\ndescription: Alpha skill.\n---\n");
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/beta/SKILL.md") {
        return new Response("---\nname: Beta\n---\n");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    await expect(discoverGithubSkills({ githubUrl: "https://github.com/example/skills", fetchImpl })).resolves.toEqual({
      repositoryOnly: true,
      githubUrl: "https://github.com/example/skills",
      ref: "HEAD",
      commit: "commit123",
      skills: [
        {
          name: "Alpha",
          path: "alpha",
          description: "Alpha skill.",
          githubUrl: "https://github.com/example/skills",
          githubPath: "alpha",
          ref: "HEAD",
          commit: "commit123"
        },
        {
          name: "Beta",
          path: "beta",
          githubUrl: "https://github.com/example/skills",
          githubPath: "beta",
          ref: "HEAD",
          commit: "commit123"
        }
      ]
    });
  });

  it("returns no choices for a direct skill url", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "alpha/SKILL.md", type: "blob" }] }));
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    await expect(
      discoverGithubSkills({ githubUrl: "https://github.com/example/skills/tree/main/alpha", fetchImpl })
    ).resolves.toEqual({
      repositoryOnly: false,
      githubUrl: "https://github.com/example/skills",
      ref: "main",
      commit: "commit123",
      skills: []
    });
  });
});

describe("fetchGithubSkillSource", () => {
  it("downloads only the requested github path", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "skills/agent-browser/SKILL.md", type: "blob" },
              { path: "skills/agent-browser/assets/icon.txt", type: "blob" },
              { path: "skills/other/SKILL.md", type: "blob" }
            ]
          })
        );
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/skills/agent-browser/SKILL.md") {
        return new Response("# Agent Browser");
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/skills/agent-browser/assets/icon.txt") {
        return new Response("icon");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const fetched = await fetchGithubSkillSource({
      githubUrl: "https://github.com/example/skills.git",
      githubPath: "skills/agent-browser",
      ref: "main",
      fetchImpl
    });
    tempRoots.push(fetched.rootPath);

    await expect(fs.readFile(`${fetched.sourcePath}/SKILL.md`, "utf8")).resolves.toBe("# Agent Browser");
    await expect(fs.readFile(`${fetched.sourcePath}/assets/icon.txt`, "utf8")).resolves.toBe("icon");
    await expect(fs.pathExists(`${fetched.sourcePath}/../other/SKILL.md`)).resolves.toBe(false);
    expect(fetched.resolved).toEqual({
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/agent-browser",
      ref: "main",
      commit: "commit123"
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/example/skills/commit123/skills/agent-browser/SKILL.md",
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": "skiller" })
      })
    );
    expect(fetchImpl).not.toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/example/skills/commit123/skills/other/SKILL.md",
      expect.anything()
    );
  });

  it("downloads a skill from a github tree url", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/gannonh/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/gannonh/skills/git/trees/commit123?recursive=1") {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "fix-github-ci/SKILL.md", type: "blob" },
              { path: "fix-github-ci/scripts/fix.sh", type: "blob" },
              { path: "other-skill/SKILL.md", type: "blob" }
            ]
          })
        );
      }

      if (url === "https://raw.githubusercontent.com/gannonh/skills/commit123/fix-github-ci/SKILL.md") {
        return new Response("# Fix GitHub CI");
      }

      if (url === "https://raw.githubusercontent.com/gannonh/skills/commit123/fix-github-ci/scripts/fix.sh") {
        return new Response("echo fix");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const fetched = await fetchGithubSkillSource({
      githubUrl: "https://github.com/gannonh/skills/tree/main/fix-github-ci",
      fetchImpl
    });
    tempRoots.push(fetched.rootPath);

    await expect(fs.readFile(path.join(fetched.sourcePath, "SKILL.md"), "utf8")).resolves.toBe("# Fix GitHub CI");
    await expect(fs.readFile(path.join(fetched.sourcePath, "scripts", "fix.sh"), "utf8")).resolves.toBe("echo fix");
    await expect(fs.pathExists(path.join(fetched.sourcePath, "..", "other-skill", "SKILL.md"))).resolves.toBe(false);
    expect(fetched.resolved).toEqual({
      githubUrl: "https://github.com/gannonh/skills",
      githubPath: "fix-github-ci",
      ref: "main",
      commit: "commit123"
    });
  });

  it("downloads a skill from a github SKILL.md file url", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/gannonh/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/gannonh/skills/git/trees/commit123?recursive=1") {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "fix-github-ci/SKILL.md", type: "blob" },
              { path: "fix-github-ci/assets/config.json", type: "blob" }
            ]
          })
        );
      }

      if (url === "https://raw.githubusercontent.com/gannonh/skills/commit123/fix-github-ci/SKILL.md") {
        return new Response("# Fix GitHub CI");
      }

      if (url === "https://raw.githubusercontent.com/gannonh/skills/commit123/fix-github-ci/assets/config.json") {
        return new Response("{}");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const fetched = await fetchGithubSkillSource({
      githubUrl: "https://github.com/gannonh/skills/blob/main/fix-github-ci/SKILL.md",
      fetchImpl
    });
    tempRoots.push(fetched.rootPath);

    await expect(fs.readFile(path.join(fetched.sourcePath, "SKILL.md"), "utf8")).resolves.toBe("# Fix GitHub CI");
    await expect(fs.readFile(path.join(fetched.sourcePath, "assets", "config.json"), "utf8")).resolves.toBe("{}");
    expect(fetched.resolved.githubPath).toBe("fix-github-ci");
  });

  it("downloads a repository-root skill from a github SKILL.md file url", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/gannonh/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/gannonh/skills/git/trees/commit123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/gannonh/skills/commit123/SKILL.md") {
        return new Response("# Root Skill");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const fetched = await fetchGithubSkillSource({
      githubUrl: "https://github.com/gannonh/skills/blob/main/SKILL.md",
      fetchImpl
    });
    tempRoots.push(fetched.rootPath);

    await expect(fs.readFile(path.join(fetched.sourcePath, "SKILL.md"), "utf8")).resolves.toBe("# Root Skill");
    expect(fetched.resolved.githubPath).toBeUndefined();
  });

  it("downloads a skill from a raw github SKILL.md url", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/gannonh/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/gannonh/skills/git/trees/commit123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "fix-github-ci/SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/gannonh/skills/commit123/fix-github-ci/SKILL.md") {
        return new Response("# Fix GitHub CI");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const fetched = await fetchGithubSkillSource({
      githubUrl: "https://raw.githubusercontent.com/gannonh/skills/main/fix-github-ci/SKILL.md",
      fetchImpl
    });
    tempRoots.push(fetched.rootPath);

    await expect(fs.readFile(path.join(fetched.sourcePath, "SKILL.md"), "utf8")).resolves.toBe("# Fix GitHub CI");
    expect(fetched.resolved.githubPath).toBe("fix-github-ci");
  });

  it("resolves common skills.sh repository paths when the registry row names only the skill", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "skills/agent-browser/SKILL.md", type: "blob" },
              { path: "skills/agent-browser/assets/icon.txt", type: "blob" },
              { path: "agent-browser/README.md", type: "blob" }
            ]
          })
        );
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/skills/agent-browser/SKILL.md") {
        return new Response("# Agent Browser");
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/skills/agent-browser/assets/icon.txt") {
        return new Response("icon");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const fetched = await fetchGithubSkillSource({
      githubUrl: "https://github.com/example/skills",
      githubPath: "agent-browser",
      fetchImpl
    });
    tempRoots.push(fetched.rootPath);

    await expect(fs.readFile(path.join(fetched.sourcePath, "SKILL.md"), "utf8")).resolves.toBe("# Agent Browser");
    await expect(fs.readFile(path.join(fetched.sourcePath, "assets", "icon.txt"), "utf8")).resolves.toBe("icon");
    expect(fetched.resolved.githubPath).toBe("skills/agent-browser");
  });

  it("preserves executable mode for github source files", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "skills/agent-browser/SKILL.md", type: "blob", mode: "100644" },
              { path: "skills/agent-browser/scripts/run.mjs", type: "blob", mode: "100755" }
            ]
          })
        );
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/skills/agent-browser/SKILL.md") {
        return new Response("# Agent Browser");
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/skills/agent-browser/scripts/run.mjs") {
        return new Response("console.log('run');");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const fetched = await fetchGithubSkillSource({
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/agent-browser",
      ref: "main",
      fetchImpl
    });
    tempRoots.push(fetched.rootPath);

    const stat = await fs.stat(path.join(fetched.sourcePath, "scripts", "run.mjs"));
    expect(stat.mode & 0o111).not.toBe(0);
  });

  it("encodes github raw url path segments while writing decoded local paths", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "skills/agent-browser/SKILL.md", type: "blob" },
              { path: "skills/agent-browser/assets/icon #1.txt", type: "blob" }
            ]
          })
        );
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/skills/agent-browser/SKILL.md") {
        return new Response("# Agent Browser");
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/skills/agent-browser/assets/icon%20%231.txt") {
        return new Response("icon");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const fetched = await fetchGithubSkillSource({
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/agent-browser",
      ref: "main",
      fetchImpl
    });
    tempRoots.push(fetched.rootPath);

    await expect(fs.readFile(path.join(fetched.sourcePath, "assets", "icon #1.txt"), "utf8")).resolves.toBe("icon");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/example/skills/commit123/skills/agent-browser/assets/icon%20%231.txt",
      expect.anything()
    );
  });

  it("rejects a tree without SKILL.md", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "skills/agent-browser/README.md", type: "blob" }] }));
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    await expect(
      fetchGithubSkillSource({
        githubUrl: "https://github.com/example/skills",
        githubPath: "skills/agent-browser",
        ref: "main",
        fetchImpl
      })
    ).rejects.toThrow("GitHub source does not contain SKILL.md");
  });

  it("rejects invalid github source urls", async () => {
    await expect(
      fetchGithubSkillSource({
        githubUrl: "https://example.com/example/skills",
        fetchImpl: mockFetch(() => new Response("missing", { status: 404, statusText: "Not Found" }))
      })
    ).rejects.toThrow("Invalid GitHub repository URL");
  });

  it("rejects failed github blob downloads", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "skills/browser/SKILL.md", type: "blob" }] }));
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    await expect(
      fetchGithubSkillSource({
        githubUrl: "https://github.com/example/skills/tree/main/skills/browser",
        fetchImpl
      })
    ).rejects.toThrow("GitHub blob fetch failed: 404 Not Found");
  });

  it("rejects unsafe github tree paths", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "skills/browser/SKILL.md", type: "blob" },
              { path: "skills/browser/../escape.txt", type: "blob" }
            ]
          })
        );
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/skills/browser/SKILL.md") {
        return new Response("# Unsafe");
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/skills/browser/../escape.txt") {
        return new Response("escape");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    await expect(
      fetchGithubSkillSource({
        githubUrl: "https://github.com/example/skills/tree/main/skills/browser",
        fetchImpl
      })
    ).rejects.toThrow("GitHub source contains an invalid path");
  });
});
