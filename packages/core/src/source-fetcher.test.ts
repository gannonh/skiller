import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverGithubSkills,
  extractRegistrySkillSource,
  fetchGithubSkillSource,
  parseGithubRepository
} from "./source-fetcher.js";

const tempRoots: string[] = [];

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response): typeof fetch {
  return vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    handler(String(input), init)
  ) as unknown as typeof fetch;
}

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
    expect(parseGithubRepository("https://raw.githubusercontent.com/example/skills/main/README.md")).toEqual({
      owner: "example",
      repo: "skills"
    });
    expect(parseGithubRepository("https://raw.githubusercontent.com/example/skills/main/SKILL.md")).toEqual({
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

  it("derives github source fields from a full source url and skill id", () => {
    expect(
      extractRegistrySkillSource({
        id: "agent-browser",
        skillId: "skills/agent-browser",
        source: "https://github.com/example/skills"
      })
    ).toEqual({
      skillsShId: "agent-browser",
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/agent-browser"
    });
  });

  it("uses the registry name as a github path fallback", () => {
    expect(
      extractRegistrySkillSource({
        id: "agent-browser",
        name: "agent-browser",
        source: "example/skills"
      })
    ).toEqual({
      skillsShId: "agent-browser",
      githubUrl: "https://github.com/example/skills",
      githubPath: "agent-browser"
    });
  });

  it("omits derived registry paths when the id has no source suffix", () => {
    expect(
      extractRegistrySkillSource({
        id: "example/skills/",
        source: "example/skills"
      })
    ).toEqual({
      skillsShId: "example/skills/",
      githubUrl: "https://github.com/example/skills"
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

  it("rejects unsupported source strings without a github url", () => {
    expect(() => extractRegistrySkillSource({ id: "agent-browser", source: "not a github source" })).toThrow(
      "skills.sh payload is missing a GitHub URL"
    );
  });
});

describe("discoverGithubSkills", () => {
  it("authenticates github requests with an environment token", async () => {
    vi.stubEnv("GITHUB_TOKEN", "token123");
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "alpha/SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/alpha/SKILL.md") {
        return new Response("---\nname: Alpha\n---\n");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    await discoverGithubSkills({ githubUrl: "https://github.com/example/skills", fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/example/skills/commits/HEAD",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token123" })
      })
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/example/skills/commit123/alpha/SKILL.md",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token123" })
      })
    );
  });

  it("explains github rate limit failures with gh authentication guidance", async () => {
    vi.stubEnv("GITHUB_TOKEN", "token123");
    const fetchImpl = mockFetch(() => new Response("rate limited", { status: 403, statusText: "rate limit exceeded" }));

    await expect(discoverGithubSkills({ githubUrl: "https://github.com/example/skills", fetchImpl })).rejects.toThrow(
      'GitHub commit lookup failed: 403 rate limit exceeded. GitHub API rate limit exceeded. Authenticate with GitHub by running "gh auth status", set GITHUB_TOKEN, or set SKILLER_GH_PATH to the gh executable, then try again.'
    );
  });

  it("omits github authorization when no token is available", async () => {
    const emptyPath = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-empty-path-"));
    tempRoots.push(emptyPath);
    vi.stubEnv("PATH", emptyPath);
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("GH_TOKEN", "");
    vi.stubEnv("SKILLER_GH_PATH", path.join(emptyPath, "gh"));
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(JSON.stringify({ tree: [] }));
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    await discoverGithubSkills({ githubUrl: "https://github.com/example/skills", fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/example/skills/commits/HEAD",
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.any(String) })
      })
    );
  });

  it("authenticates github requests with a gh cli token", async () => {
    const binPath = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-gh-bin-"));
    tempRoots.push(binPath);
    const ghPath = path.join(binPath, "gh");
    await fs.writeFile(ghPath, "#!/bin/sh\nprintf token-from-gh\n");
    await fs.chmod(ghPath, 0o755);
    vi.stubEnv("PATH", binPath);
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("GH_TOKEN", "");
    await vi.resetModules();
    const { discoverGithubSkills: freshDiscoverGithubSkills } = await import("./source-fetcher.js");
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(JSON.stringify({ tree: [] }));
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    await freshDiscoverGithubSkills({ githubUrl: "https://github.com/example/skills", fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/example/skills/commits/HEAD",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token-from-gh" })
      })
    );
  });

  it("refreshes gh cli tokens after the token cache expires", async () => {
    const binPath = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-gh-refresh-bin-"));
    tempRoots.push(binPath);
    const tokenPath = path.join(binPath, "token.txt");
    const ghPath = path.join(binPath, "gh");
    await fs.writeFile(tokenPath, "token-one");
    await fs.writeFile(ghPath, `#!/bin/sh\nread token < "${tokenPath}"\nprintf "$token"\n`);
    await fs.chmod(ghPath, 0o755);
    vi.stubEnv("PATH", binPath);
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("GH_TOKEN", "");
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    await vi.resetModules();
    const { discoverGithubSkills: freshDiscoverGithubSkills } = await import("./source-fetcher.js");
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(JSON.stringify({ tree: [] }));
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    await freshDiscoverGithubSkills({ githubUrl: "https://github.com/example/skills", fetchImpl });
    await fs.writeFile(tokenPath, "token-two");
    now.mockReturnValue(5 * 60 * 1000 + 1);
    await freshDiscoverGithubSkills({ githubUrl: "https://github.com/example/skills", fetchImpl });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://api.github.com/repos/example/skills/commits/HEAD",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token-two" })
      })
    );
  });

  it("omits github authorization when gh returns no token", async () => {
    const binPath = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-gh-empty-bin-"));
    tempRoots.push(binPath);
    const ghPath = path.join(binPath, "gh");
    await fs.writeFile(ghPath, "#!/bin/sh\nexit 0\n");
    await fs.chmod(ghPath, 0o755);
    vi.stubEnv("PATH", binPath);
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("GH_TOKEN", "");
    await vi.resetModules();
    const { discoverGithubSkills: freshDiscoverGithubSkills } = await import("./source-fetcher.js");
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(JSON.stringify({ tree: [] }));
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    await freshDiscoverGithubSkills({ githubUrl: "https://github.com/example/skills", fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/example/skills/commits/HEAD",
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.any(String) })
      })
    );
  });

  it("uses global fetch when no discover fetch implementation is provided", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(JSON.stringify({ tree: [] }));
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });
    vi.stubGlobal("fetch", fetchImpl);

    await expect(discoverGithubSkills({ githubUrl: "https://github.com/example/skills" })).resolves.toMatchObject({
      repositoryOnly: true,
      skills: []
    });
  });

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

  it("rejects failed github skill metadata downloads", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "alpha/SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/alpha/SKILL.md") {
        return new Response("server error", { status: 500, statusText: "Server Error" });
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    await expect(discoverGithubSkills({ githubUrl: "https://github.com/example/skills", fetchImpl })).rejects.toThrow(
      "GitHub blob fetch failed: 500 Server Error"
    );
  });

  it("uses repository name fallback metadata for root skills", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/SKILL.md") {
        return new Response("Plain markdown");
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
          name: "skills",
          path: ".",
          githubUrl: "https://github.com/example/skills",
          ref: "HEAD",
          commit: "commit123"
        }
      ]
    });
  });

  it("falls back when discovered skill frontmatter is invalid", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "array/SKILL.md", type: "blob" },
              { path: "broken/SKILL.md", type: "blob" },
              { path: "empty/SKILL.md", type: "blob" },
              { path: "unnamed/SKILL.md", type: "blob" }
            ]
          })
        );
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/array/SKILL.md") {
        return new Response("---\n- one\n---\n");
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/broken/SKILL.md") {
        return new Response("---\nname: \"unterminated\n---\n");
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/empty/SKILL.md") {
        return new Response("---\n\n---\n");
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/unnamed/SKILL.md") {
        return new Response("---\ndescription: Details.\n---\n");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    await expect(discoverGithubSkills({ githubUrl: "https://github.com/example/skills", fetchImpl })).resolves.toMatchObject({
      skills: [
        { name: "array", path: "array" },
        { name: "broken", path: "broken" },
        { name: "empty", path: "empty" },
        { name: "unnamed", path: "unnamed", description: "Details." }
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

  it("downloads a skill from a github tree url with a slash-containing ref", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/gannonh/skills/commits/feature%2Fnew-ui") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/gannonh/skills/git/trees/commit123?recursive=1") {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "fix-github-ci/SKILL.md", type: "blob" },
              { path: "fix-github-ci/scripts/fix.sh", type: "blob" }
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
      githubUrl: "https://github.com/gannonh/skills/tree/feature/new-ui/fix-github-ci",
      fetchImpl
    });
    tempRoots.push(fetched.rootPath);

    await expect(fs.readFile(path.join(fetched.sourcePath, "SKILL.md"), "utf8")).resolves.toBe("# Fix GitHub CI");
    expect(fetched.resolved).toEqual({
      githubUrl: "https://github.com/gannonh/skills",
      githubPath: "fix-github-ci",
      ref: "feature/new-ui",
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

  it("resolves a unique nested github path by basename", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "nested/browser/SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/nested/browser/SKILL.md") {
        return new Response("# Browser");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const fetched = await fetchGithubSkillSource({
      githubUrl: "https://github.com/example/skills",
      githubPath: "browser",
      ref: "main",
      fetchImpl
    });
    tempRoots.push(fetched.rootPath);

    await expect(fs.readFile(path.join(fetched.sourcePath, "SKILL.md"), "utf8")).resolves.toBe("# Browser");
    expect(fetched.resolved.githubPath).toBe("nested/browser");
  });

  it("keeps ambiguous github path matches unresolved", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "first/other/SKILL.md", type: "blob" },
              { path: "first/browser/SKILL.md", type: "blob" },
              { path: "second/browser/SKILL.md", type: "blob" }
            ]
          })
        );
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    await expect(
      fetchGithubSkillSource({
        githubUrl: "https://github.com/example/skills",
        githubPath: "browser",
        ref: "main",
        fetchImpl
      })
    ).rejects.toThrow("GitHub source does not contain SKILL.md");
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

  it("resolves a skill whose registry slug differs from its folder via SKILL.md frontmatter name", async () => {
    // skills.sh exposes the SKILL.md frontmatter `name` as the slug, which can differ from the
    // repository folder name (e.g. slug "vercel-react-best-practices" lives in skills/react-best-practices).
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "skills/react-best-practices/SKILL.md", type: "blob" },
              { path: "skills/react-best-practices/rules/perf.md", type: "blob" },
              { path: "skills/other/SKILL.md", type: "blob" }
            ]
          })
        );
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/skills/react-best-practices/SKILL.md") {
        return new Response("---\nname: vercel-react-best-practices\n---\n# React");
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/skills/other/SKILL.md") {
        return new Response("---\nname: other\n---\n# Other");
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/skills/react-best-practices/rules/perf.md") {
        return new Response("perf");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const fetched = await fetchGithubSkillSource({
      githubUrl: "https://github.com/example/skills",
      githubPath: "vercel-react-best-practices",
      fetchImpl
    });
    tempRoots.push(fetched.rootPath);

    await expect(fs.readFile(path.join(fetched.sourcePath, "SKILL.md"), "utf8")).resolves.toContain(
      "name: vercel-react-best-practices"
    );
    await expect(fs.readFile(path.join(fetched.sourcePath, "rules", "perf.md"), "utf8")).resolves.toBe("perf");
    expect(fetched.resolved.githubPath).toBe("skills/react-best-practices");
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

  it("rejects commit lookups without a sha", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({}));
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    await expect(
      fetchGithubSkillSource({
        githubUrl: "https://github.com/example/skills/tree/main/skills/browser",
        fetchImpl
      })
    ).rejects.toThrow("GitHub commit lookup did not return a commit sha");
  });

  it("treats malformed github trees as empty", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(JSON.stringify({ tree: null }));
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    await expect(
      fetchGithubSkillSource({
        githubUrl: "https://github.com/example/skills/tree/main/skills/browser",
        fetchImpl
      })
    ).rejects.toThrow("GitHub source does not contain SKILL.md");
  });

  it("uses global fetch when no github fetch implementation is provided", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "skills/browser/SKILL.md", type: "blob" }] }));
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/skills/browser/SKILL.md") {
        return new Response("# Browser");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });
    vi.stubGlobal("fetch", fetchImpl);

    const fetched = await fetchGithubSkillSource({
      githubUrl: "https://github.com/example/skills/tree/main/skills/browser"
    });
    tempRoots.push(fetched.rootPath);

    await expect(fs.readFile(path.join(fetched.sourcePath, "SKILL.md"), "utf8")).resolves.toBe("# Browser");
  });

  it("ignores non-file github tree entries and empty relative paths", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response(JSON.stringify({ sha: "commit123" }));
      }

      if (url === "https://api.github.com/repos/example/skills/git/trees/commit123?recursive=1") {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "skills/browser", type: "tree" },
              { path: 123, type: "blob" },
              { path: "skills/browser", type: "blob" },
              { path: "skills/browser/SKILL.md", type: "blob" }
            ]
          })
        );
      }

      if (url === "https://raw.githubusercontent.com/example/skills/commit123/skills/browser/SKILL.md") {
        return new Response("# Browser");
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const fetched = await fetchGithubSkillSource({
      githubUrl: "https://github.com/example/skills/tree/main/skills/browser",
      fetchImpl
    });
    tempRoots.push(fetched.rootPath);

    await expect(fs.readFile(path.join(fetched.sourcePath, "SKILL.md"), "utf8")).resolves.toBe("# Browser");
    expect(fetchImpl).not.toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/example/skills/commit123/skills/browser",
      expect.anything()
    );
  });

  it("reports rate limits from response bodies and unreadable bodies", async () => {
    const bodyLimitedFetch = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/main") {
        return new Response("API rate limit exceeded", { status: 403, statusText: "Forbidden" });
      }

      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    await expect(
      fetchGithubSkillSource({
        githubUrl: "https://github.com/example/skills/tree/main/skills/browser",
        fetchImpl: bodyLimitedFetch
      })
    ).rejects.toThrow("GitHub API rate limit exceeded");

    const unreadableResponse = {
      ok: false,
      status: 403,
      statusText: "",
      headers: new Headers(),
      clone() {
        throw new Error("clone failed");
      }
    } as unknown as Response;
    const unreadableFetch = mockFetch(() => unreadableResponse);

    await expect(
      fetchGithubSkillSource({
        githubUrl: "https://github.com/example/skills/tree/main/skills/browser",
        fetchImpl: unreadableFetch
      })
    ).rejects.toThrow("GitHub commit lookup failed: 403 HTTP error");
  });

  it("rejects invalid github source urls", async () => {
    await expect(
      fetchGithubSkillSource({
        githubUrl: "https://example.com/example/skills",
        fetchImpl: mockFetch(() => new Response("missing", { status: 404, statusText: "Not Found" }))
      })
    ).rejects.toThrow("Invalid GitHub repository URL");
  });

  it("wraps non-error commit lookup failures", async () => {
    await expect(
      fetchGithubSkillSource({
        githubUrl: "https://github.com/example/skills",
        fetchImpl: mockFetch(() => {
          throw "network down";
        })
      })
    ).rejects.toThrow("GitHub commit lookup failed");
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
