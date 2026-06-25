import { describe, expect, it } from "vitest";
import {
  isUngrouped,
  normalizeSkillSetSkillIds,
  normalizeSkillSetTargets,
  skillSetIdsForSkill,
  skillsInSet
} from "./skill-sets.js";
import type { SkillMetadata, SkillSetMetadata } from "./types.js";

function skill(id: string): SkillMetadata {
  return {
    id,
    name: id,
    libraryPath: `/tmp/${id}`,
    source: { type: "local", path: `/tmp/${id}` },
    installedAt: "2026-05-12T00:00:00.000Z",
    keepUpdated: false,
    enabled: true,
    tags: [],
    validation: { valid: true, issues: [] }
  };
}

function set(id: string, skillIds: string[]): SkillSetMetadata {
  return {
    id,
    name: id,
    skillIds,
    targets: [],
    enabled: true,
    createdAt: "2026-05-12T00:00:00.000Z",
    updatedAt: "2026-05-12T00:00:00.000Z"
  };
}

describe("skill-sets helpers", () => {
  const skillSets = [set("automation", ["alpha"]), set("browser", ["alpha", "beta"])];

  it("returns skill set ids for a skill", () => {
    expect(skillSetIdsForSkill("alpha", skillSets)).toEqual(["automation", "browser"]);
    expect(skillSetIdsForSkill("missing", skillSets)).toEqual([]);
  });

  it("returns skills in a set", () => {
    expect(skillsInSet(set("browser", ["alpha", "beta"]), [skill("alpha"), skill("beta"), skill("gamma")])).toEqual([
      skill("alpha"),
      skill("beta")
    ]);
  });

  it("detects ungrouped skills", () => {
    expect(isUngrouped("gamma", skillSets)).toBe(true);
    expect(isUngrouped("alpha", skillSets)).toBe(false);
  });

  it("normalizes skill set skill ids", () => {
    expect(normalizeSkillSetSkillIds(["alpha", "alpha", "missing", 1], new Set(["alpha", "beta"]))).toEqual(["alpha"]);
  });

  it("normalizes skill set targets", () => {
    expect(
      normalizeSkillSetTargets([
        { path: "~/skills", enabled: true },
        { path: "~/skills", enabled: false },
        null,
        { path: " ", enabled: true },
        { path: 123, enabled: true },
        { path: "~/other", enabled: "yes" }
      ])
    ).toEqual([
      { path: "~/skills", enabled: true },
      { path: "~/other", enabled: true }
    ]);
  });
});
