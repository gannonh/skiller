import type { SkillMetadata } from "@skiller/core";

export interface UpdateCheckSkill {
  id: string;
  name: string;
}

export interface UpdateCheckResult {
  checkedAt: string;
  considered: UpdateCheckSkill[];
  available: UpdateCheckSkill[];
  updated: UpdateCheckSkill[];
}

export function createUpdateCheckResult(
  skills: Array<Pick<SkillMetadata, "id" | "name" | "keepUpdated">>,
  keepAllSkillsUpdated = false
): UpdateCheckResult {
  const considered = skills
    .filter((skill) => keepAllSkillsUpdated || skill.keepUpdated)
    .map((skill) => ({ id: skill.id, name: skill.name }));

  return {
    checkedAt: new Date().toISOString(),
    considered,
    available: [],
    updated: []
  };
}
