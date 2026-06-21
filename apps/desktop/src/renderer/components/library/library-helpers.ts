import type { SkillMetadata, SkillSetMetadata } from "../../lib/api.js";
import { sourceDetail, sourceLabel } from "../../lib/skill-source.js";

export type SkillPickerSortColumn = "name" | "source" | "status" | "enabled";
export type SortDirection = "asc" | "desc";

function statusLabel(skill: SkillMetadata): string {
  return skill.validation?.valid ? "valid" : "invalid";
}

function sortValue(skill: SkillMetadata, column: SkillPickerSortColumn): string {
  if (column === "name") return skill.name || skill.id;
  if (column === "source") return `${sourceLabel(skill)} ${sourceDetail(skill)}`;
  if (column === "status") return statusLabel(skill);
  return skill.enabled ? "enabled" : "disabled";
}

export function sortSkills(
  skills: SkillMetadata[],
  column: SkillPickerSortColumn,
  direction: SortDirection
): SkillMetadata[] {
  return [...skills].sort((left, right) => {
    const primary = sortValue(left, column).localeCompare(sortValue(right, column), undefined, {
      numeric: true,
      sensitivity: "base"
    });
    const fallback = (left.name || left.id).localeCompare(right.name || right.id, undefined, {
      numeric: true,
      sensitivity: "base"
    });
    const result = primary || fallback || left.id.localeCompare(right.id);
    return direction === "asc" ? result : -result;
  });
}

export function skillSetIdsForSkill(skillId: string, skillSets: SkillSetMetadata[]): string[] {
  return skillSets.filter((skillSet) => skillSet.skillIds.includes(skillId)).map((skillSet) => skillSet.id);
}

export function isUngroupedSkill(skillId: string, skillSets: SkillSetMetadata[]): boolean {
  return !skillSets.some((skillSet) => skillSet.skillIds.includes(skillId));
}

export function skillSetState(skills: SkillMetadata[], skillSet: SkillSetMetadata): "on" | "off" | "mixed" {
  const memberIds = new Set(skillSet.skillIds);
  const members = skills.filter((skill) => memberIds.has(skill.id));
  if (members.length === 0 || members.every((skill) => !skill.enabled)) return "off";
  if (members.every((skill) => skill.enabled)) return "on";
  return "mixed";
}

export function filterLibrarySkills(
  skills: SkillMetadata[],
  setFilter: { type: "all" } | { type: "ungrouped" } | { type: "set"; skillSetId: string },
  selectedTags: string[],
  skillSets: SkillSetMetadata[]
): SkillMetadata[] {
  return skills.filter((skill) => {
    if (setFilter.type === "ungrouped" && !isUngroupedSkill(skill.id, skillSets)) return false;
    if (setFilter.type === "set") {
      const skillSet = skillSets.find((candidate) => candidate.id === setFilter.skillSetId);
      if (!skillSet || !skillSet.skillIds.includes(skill.id)) return false;
    }
    return selectedTags.every((tag) => skill.tags.includes(tag));
  });
}
