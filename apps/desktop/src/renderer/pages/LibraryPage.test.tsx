import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DiscoveredGithubSkill } from "@skiller/core";
import { sourceLabel, sourceUrl } from "../lib/skill-source.js";
import type { SkillMetadata } from "../lib/api.js";

let helpers: typeof import("./LibraryPage.js");

function skill(input: Partial<SkillMetadata> & { id: string }): SkillMetadata {
  return {
    id: input.id,
    name: input.name ?? input.id,
    libraryPath: `/tmp/${input.id}`,
    source: { type: "local", path: `/tmp/${input.id}` },
    installedAt: "2026-05-12T00:00:00.000Z",
    keepUpdated: false,
    enabled: input.enabled ?? true,
    tags: input.tags ?? [],
    validation: { valid: true, issues: [] }
  };
}

describe("LibraryPage helpers", () => {
  beforeAll(async () => {
    vi.stubGlobal("window", {});
    helpers = await import("./LibraryPage.js");
  }, 30_000);

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("parses tag input", () => {
    expect(helpers.parseTagInput(" Browser, testing, browser, UI   QA ")).toEqual(["browser", "testing", "ui qa"]);
  });

  it("normalizes GitHub owner/repository shorthand for Add from GitHub", () => {
    expect(helpers.normalizeGithubInput("gannonh/skiller")).toBe("https://github.com/gannonh/skiller");
    expect(helpers.normalizeGithubInput("@gannonh/skiller")).toBe("https://github.com/gannonh/skiller");
    expect(helpers.normalizeGithubInput("https://github.com/gannonh/skiller")).toBe("https://github.com/gannonh/skiller");
  });

  it("removes selected tags that no longer exist", () => {
    expect(helpers.reconcileSelectedTags(["browser", "removed", "testing"], ["browser", "testing"])).toEqual([
      "browser",
      "testing"
    ]);
  });

  it("labels skills.sh skills as Skills Registry in the Source column", () => {
    expect(
      sourceLabel({
        ...skill({ id: "registry" }),
        source: { type: "skills.sh", skillsShId: "registry", githubUrl: "https://github.com/example/skills" }
      })
    ).toBe("Skills Registry");
  });

  it("derives clickable GitHub source URLs for SKILL.md files", () => {
    expect(
      sourceUrl({
        ...skill({ id: "github-root" }),
        source: { type: "github", githubUrl: "https://github.com/example/skills" }
      })
    ).toBe("https://github.com/example/skills/blob/HEAD/SKILL.md");

    expect(
      sourceUrl({
        ...skill({ id: "github-path" }),
        source: {
          type: "github",
          githubUrl: "https://github.com/example/skills/",
          githubPath: "skills/agent browser",
          ref: "main"
        }
      })
    ).toBe("https://github.com/example/skills/blob/main/skills/agent%20browser/SKILL.md");
  });

  it("derives clickable skills registry source URLs for SKILL.md files", () => {
    expect(
      sourceUrl({
        ...skill({ id: "registry" }),
        source: {
          type: "skills.sh",
          skillsShId: "registry",
          githubUrl: "https://github.com/example/skills",
          githubPath: "skills/registry"
        }
      })
    ).toBe("https://github.com/example/skills/blob/HEAD/skills/registry/SKILL.md");
  });

  it("does not derive clickable URLs for local sources", () => {
    expect(sourceUrl(skill({ id: "local" }))).toBeNull();
  });

  it("derives the GitHub sheet select-all checkbox state", () => {
    const choices: DiscoveredGithubSkill[] = [
      { name: "one", path: "skills/one", githubUrl: "https://github.com/example/skills", ref: "HEAD", commit: "abc123" },
      { name: "two", path: "skills/two", githubUrl: "https://github.com/example/skills", ref: "HEAD", commit: "abc123" }
    ];

    expect(helpers.githubSelectionState(choices, new Set())).toBe(false);
    expect(helpers.githubSelectionState(choices, new Set(["skills/one"]))).toBe("indeterminate");
    expect(helpers.githubSelectionState(choices, new Set(["skills/one", "skills/two"]))).toBe(true);
  });

  it("selects or clears every GitHub skill path for the sheet checkbox", () => {
    const choices: DiscoveredGithubSkill[] = [
      { name: "one", path: "skills/one", githubUrl: "https://github.com/example/skills", ref: "HEAD", commit: "abc123" },
      { name: "two", path: "skills/two", githubUrl: "https://github.com/example/skills", ref: "HEAD", commit: "abc123" }
    ];

    expect(Array.from(helpers.githubSelectionPaths(choices, true))).toEqual(["skills/one", "skills/two"]);
    expect(Array.from(helpers.githubSelectionPaths(choices, false))).toEqual([]);
  });
});
