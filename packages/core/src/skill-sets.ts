import type { SkillMetadata, SkillSetMetadata, TargetConfig } from "./types.js";

export function skillSetIdsForSkill(skillId: string, skillSets: SkillSetMetadata[]): string[] {
  return skillSets.filter((skillSet) => skillSet.skillIds.includes(skillId)).map((skillSet) => skillSet.id);
}

export function skillsInSet(skillSet: SkillSetMetadata, skills: SkillMetadata[]): SkillMetadata[] {
  const memberIds = new Set(skillSet.skillIds);
  return skills.filter((skill) => memberIds.has(skill.id));
}

export function isUngrouped(skillId: string, skillSets: SkillSetMetadata[]): boolean {
  return !skillSets.some((skillSet) => skillSet.skillIds.includes(skillId));
}

export function normalizeSkillSetTargets(value: unknown): TargetConfig[] {
  if (!Array.isArray(value)) return [];
  const targets: TargetConfig[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const targetPath = typeof record.path === "string" ? record.path.trim() : "";
    if (!targetPath || seen.has(targetPath)) continue;
    seen.add(targetPath);
    targets.push({ path: targetPath, enabled: typeof record.enabled === "boolean" ? record.enabled : true });
  }

  return targets;
}

export function normalizeSkillSetSkillIds(value: unknown, validSkillIds: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  const skillIds: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string" || !validSkillIds.has(item) || seen.has(item)) continue;
    seen.add(item);
    skillIds.push(item);
  }

  return skillIds;
}

export interface SaveSkillSetInput {
  id?: string;
  name: string;
  skillIds: string[];
  targets: TargetConfig[];
}
