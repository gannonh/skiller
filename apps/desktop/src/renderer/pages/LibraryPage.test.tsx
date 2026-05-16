import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SkillMetadata, SkillSetMetadata } from "../lib/api.js";
import { sourceLabel, sourceUrl } from "../lib/skill-source.js";
import type { DiscoveredGithubSkill } from "@skiller/core";

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
    ...(input.skillSetId ? { skillSetId: input.skillSetId } : {}),
    validation: { valid: true, issues: [] }
  };
}

function skillSet(id: string, name: string): SkillSetMetadata {
  return {
    id,
    name,
    createdAt: "2026-05-12T00:00:00.000Z",
    updatedAt: "2026-05-12T00:00:00.000Z"
  };
}

describe("LibraryPage helpers", () => {
  beforeAll(async () => {
    vi.stubGlobal("window", {});
    helpers = await import("./LibraryPage.js");
  });

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

  it("filters by set ungrouped and all selected tags", () => {
    const skills = [
      skill({ id: "one", skillSetId: "automation", tags: ["browser", "testing"] }),
      skill({ id: "two", tags: ["browser"] }),
      skill({ id: "three", skillSetId: "automation", tags: ["browser"] })
    ];

    expect(
      helpers.filterLibrarySkills(skills, { type: "set", skillSetId: "automation" }, ["browser", "testing"]).map((item) => item.id)
    ).toEqual(["one"]);
    expect(helpers.filterLibrarySkills(skills, { type: "ungrouped" }, ["browser"]).map((item) => item.id)).toEqual([
      "two"
    ]);
  });

  it("distinguishes set ids from reserved filter names", () => {
    const skills = [
      skill({ id: "one", skillSetId: "ungrouped", tags: ["browser"] }),
      skill({ id: "two", tags: ["browser"] }),
      skill({ id: "three", skillSetId: "all", tags: ["browser"] })
    ];

    expect(helpers.filterLibrarySkills(skills, { type: "set", skillSetId: "ungrouped" }, []).map((item) => item.id)).toEqual([
      "one"
    ]);
    expect(helpers.filterLibrarySkills(skills, { type: "set", skillSetId: "all" }, []).map((item) => item.id)).toEqual([
      "three"
    ]);
    expect(helpers.filterLibrarySkills(skills, { type: "ungrouped" }, []).map((item) => item.id)).toEqual(["two"]);
  });

  it("derives skill set state", () => {
    expect(helpers.skillSetState([skill({ id: "one", skillSetId: "set", enabled: true })], "set")).toBe("on");
    expect(helpers.skillSetState([skill({ id: "one", skillSetId: "set", enabled: false })], "set")).toBe("off");
    expect(
      helpers.skillSetState(
        [skill({ id: "one", skillSetId: "set", enabled: true }), skill({ id: "two", skillSetId: "set", enabled: false })],
        "set"
      )
    ).toBe("mixed");
  });

  it("sorts by displayed skill set name with ungrouped skills last", () => {
    const skills = [
      skill({ id: "one", skillSetId: "zeta" }),
      skill({ id: "two" }),
      skill({ id: "three", skillSetId: "alpha" })
    ];
    const skillSets = [skillSet("zeta", "Zeta"), skillSet("alpha", "Alpha")];

    expect(helpers.sortSkills(skills, "skillSet", "asc", skillSets).map((item) => item.id)).toEqual([
      "three",
      "one",
      "two"
    ]);
  });

  it("resets only the current filter for the deleted skill set", () => {
    expect(helpers.filterAfterDeletingSkillSet({ type: "set", skillSetId: "automation" }, "automation")).toEqual({
      type: "all"
    });
    expect(helpers.filterAfterDeletingSkillSet({ type: "set", skillSetId: "browser" }, "automation")).toEqual({
      type: "set",
      skillSetId: "browser"
    });
    expect(helpers.filterAfterDeletingSkillSet({ type: "ungrouped" }, "automation")).toEqual({ type: "ungrouped" });
  });

  it("summarizes skill set target sync errors", () => {
    expect(
      helpers.setSkillSetEnabledScanErrorMessage({
        state: { skills: [], skillSets: [], tags: [] },
        scanErrors: [
          { path: "/tmp/skills", message: "permission denied" },
          { path: "/tmp/other-skills", message: "missing" }
        ]
      })
    ).toBe("Target sync failed for /tmp/skills: permission denied and 1 more");
  });

  it("labels skills.sh skills as Skills Registry in the Source column", () => {
    expect(
      sourceLabel({
        ...skill({ id: "registry" }),
        source: { type: "skills.sh", skillsShId: "registry", githubUrl: "https://github.com/example/skills" }
      })
    ).toBe("Skills Registry");
  });

  it("derives clickable GitHub source URLs", () => {
    expect(
      sourceUrl({
        ...skill({ id: "github-root" }),
        source: { type: "github", githubUrl: "https://github.com/example/skills" }
      })
    ).toBe("https://github.com/example/skills");

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
    ).toBe("https://github.com/example/skills/tree/main/skills/agent%20browser");
  });

  it("derives clickable skills registry source URLs", () => {
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
    ).toBe("https://github.com/example/skills/tree/HEAD/skills/registry");
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
