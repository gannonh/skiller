import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SkillMetadata, SkillSetMetadata } from "../../lib/api.js";
import type { SetSkillSetEnabledResult } from "../../lib/api.js";

let helpers: typeof import("./library-helpers.js");

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

function skillSet(id: string, name: string, skillIds: string[] = []): SkillSetMetadata {
  return {
    id,
    name,
    skillIds,
    targets: [],
    enabled: true,
    createdAt: "2026-05-12T00:00:00.000Z",
    updatedAt: "2026-05-12T00:00:00.000Z"
  };
}

describe("library helpers", () => {
  beforeAll(async () => {
    helpers = await import("./library-helpers.js");
  });

  it("filters by set ungrouped and all selected tags", () => {
    const skills = [
      skill({ id: "one", tags: ["browser", "testing"] }),
      skill({ id: "two", tags: ["browser"] }),
      skill({ id: "three", tags: ["browser"] })
    ];
    const skillSets = [skillSet("automation", "Automation", ["one", "three"])];

    expect(
      helpers.filterLibrarySkills(skills, { type: "set", skillSetId: "automation" }, ["browser", "testing"], skillSets).map(
        (item) => item.id
      )
    ).toEqual(["one"]);
    expect(
      helpers.filterLibrarySkills(skills, { type: "ungrouped" }, ["browser"], skillSets).map((item) => item.id)
    ).toEqual(["two"]);
  });

  it("distinguishes set ids from reserved filter names", () => {
    const skills = [skill({ id: "one", tags: ["browser"] }), skill({ id: "two", tags: ["browser"] }), skill({ id: "three", tags: ["browser"] })];
    const skillSets = [skillSet("ungrouped", "Ungrouped", ["one"]), skillSet("all", "All", ["three"])];

    expect(
      helpers.filterLibrarySkills(skills, { type: "set", skillSetId: "ungrouped" }, [], skillSets).map((item) => item.id)
    ).toEqual(["one"]);
    expect(helpers.filterLibrarySkills(skills, { type: "set", skillSetId: "all" }, [], skillSets).map((item) => item.id)).toEqual([
      "three"
    ]);
    expect(helpers.filterLibrarySkills(skills, { type: "ungrouped" }, [], skillSets).map((item) => item.id)).toEqual(["two"]);
  });

  it("derives skill set state", () => {
    const skillSets = [skillSet("set", "Set", ["one", "two"])];

    expect(helpers.skillSetStateForId([skill({ id: "one", enabled: true })], skillSets, "set")).toBe("on");
    expect(helpers.skillSetStateForId([skill({ id: "one", enabled: false })], skillSets, "set")).toBe("off");
    expect(
      helpers.skillSetStateForId(
        [skill({ id: "one", enabled: true }), skill({ id: "two", enabled: false })],
        skillSets,
        "set"
      )
    ).toBe("mixed");
  });

  it("reports a disabled skill set as off regardless of member enablement", () => {
    const skillSets: SkillSetMetadata[] = [{ ...skillSet("set", "Set", ["one", "two"]), enabled: false }];

    expect(
      helpers.skillSetStateForId([skill({ id: "one", enabled: true }), skill({ id: "two", enabled: true })], skillSets, "set")
    ).toBe("off");
  });

  it("sorts by name for library table", () => {
    const skills = [skill({ id: "zeta" }), skill({ id: "alpha" }), skill({ id: "beta" })];

    expect(helpers.sortSkills(skills, "name", "asc").map((item) => item.id)).toEqual(["alpha", "beta", "zeta"]);
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
    const result: SetSkillSetEnabledResult = {
      state: { skills: [], skillSets: [], tags: [] },
      scanErrors: [
        { path: "/tmp/skills", message: "permission denied" },
        { path: "/tmp/other-skills", message: "missing" }
      ]
    };

    expect(helpers.setSkillSetEnabledScanErrorMessage(result)).toBe(
      "Target sync failed for /tmp/skills: permission denied and 1 more"
    );
  });
});
