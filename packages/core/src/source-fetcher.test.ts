import fs from "fs-extra";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
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

  it("returns null for non-github repository urls", () => {
    expect(parseGithubRepository("https://example.com/example/skills")).toBeNull();
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
      githubUrl: "https://github.com/example/skills.git",
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
});
