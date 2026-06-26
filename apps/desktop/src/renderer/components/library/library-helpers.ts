import type { SkillMetadata, SkillSetMetadata } from "../../lib/api.js";
import type { SetSkillSetEnabledResult } from "../../lib/api.js";
import { sourceDetail, sourceLabel } from "../../lib/skill-source.js";

export type SkillPickerSortColumn = "included" | "name" | "source" | "status" | "enabled";
export type SortDirection = "asc" | "desc";
export type SetFilter = { type: "all" } | { type: "ungrouped" } | { type: "set"; skillSetId: string };

export function skillStatusLabel(skill: SkillMetadata): string {
  return skill.validation?.valid ? "valid" : "invalid";
}

function sortValue(
  skill: SkillMetadata,
  column: SkillPickerSortColumn,
  selectedSkillIds: Set<string>
): string {
  if (column === "included") return selectedSkillIds.has(skill.id) ? "1included" : "0not-included";
  if (column === "name") return skill.name || skill.id;
  if (column === "source") return `${sourceLabel(skill)} ${sourceDetail(skill)}`;
  if (column === "status") return skillStatusLabel(skill);
  return skill.enabled ? "enabled" : "disabled";
}

export function sortSkills(
  skills: SkillMetadata[],
  column: SkillPickerSortColumn,
  direction: SortDirection,
  selectedSkillIds: Set<string> = new Set()
): SkillMetadata[] {
  return [...skills].sort((left, right) => {
    const primary = sortValue(left, column, selectedSkillIds).localeCompare(
      sortValue(right, column, selectedSkillIds),
      undefined,
      { numeric: true, sensitivity: "base" }
    );
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

function groupedSkillIds(skillSets: SkillSetMetadata[]): Set<string> {
  const grouped = new Set<string>();
  for (const skillSet of skillSets) {
    for (const skillId of skillSet.skillIds) grouped.add(skillId);
  }
  return grouped;
}

export function isUngroupedSkill(skillId: string, skillSets: SkillSetMetadata[]): boolean {
  return !groupedSkillIds(skillSets).has(skillId);
}

export function skillSetState(_skills: SkillMetadata[], skillSet: SkillSetMetadata): "on" | "off" {
  return skillSet.enabled ? "on" : "off";
}

export function skillSetStateForId(
  skills: SkillMetadata[],
  skillSets: SkillSetMetadata[],
  skillSetId: string
): "on" | "off" {
  const skillSet = skillSets.find((candidate) => candidate.id === skillSetId);
  if (!skillSet) return "off";
  return skillSetState(skills, skillSet);
}

export function filterLibrarySkills(
  skills: SkillMetadata[],
  setFilter: SetFilter,
  selectedTags: string[],
  skillSets: SkillSetMetadata[]
): SkillMetadata[] {
  const grouped = groupedSkillIds(skillSets);
  const filteredSet =
    setFilter.type === "set" ? skillSets.find((candidate) => candidate.id === setFilter.skillSetId) : undefined;

  return skills.filter((skill) => {
    if (setFilter.type === "ungrouped" && grouped.has(skill.id)) return false;
    if (setFilter.type === "set" && (!filteredSet || !filteredSet.skillIds.includes(skill.id))) return false;
    return selectedTags.every((tag) => skill.tags.includes(tag));
  });
}

export function filterAfterDeletingSkillSet(currentFilter: SetFilter, skillSetId: string): SetFilter {
  if (currentFilter.type === "set" && currentFilter.skillSetId === skillSetId) return { type: "all" };
  return currentFilter;
}

export function setSkillSetEnabledScanErrorMessage(result: SetSkillSetEnabledResult): string | null {
  if (result.scanErrors.length === 0) return null;
  const firstError = result.scanErrors[0];
  const suffix = result.scanErrors.length === 1 ? "" : ` and ${result.scanErrors.length - 1} more`;
  return `Target sync failed for ${firstError.path}: ${firstError.message}${suffix}`;
}
