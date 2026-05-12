import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SkillMetadata, SkillSetMetadata } from "../lib/api.js";

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

  it("parses tag input", () => {
    expect(helpers.parseTagInput(" Browser, testing, browser, UI   QA ")).toEqual(["browser", "testing", "ui qa"]);
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

  it("sorts by displayed skill set name with ungrouped skills as none", () => {
    const skills = [
      skill({ id: "one", skillSetId: "zeta" }),
      skill({ id: "two" }),
      skill({ id: "three", skillSetId: "alpha" })
    ];
    const skillSets = [skillSet("zeta", "Zeta"), skillSet("alpha", "Alpha")];

    expect(helpers.sortSkills(skills, "skillSet", "asc", skillSets).map((item) => item.id)).toEqual([
      "three",
      "two",
      "one"
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
});
