import type { SkillSetMetadata, TargetConfig } from "@skiller/core";

export function computeSkillSetEditorState(
  skillSet: SkillSetMetadata | null
): { name: string; selectedSkillIds: Set<string>; targets: TargetConfig[] } {
  const savedTargets = skillSet?.targets.map((target) => ({ ...target })) ?? [];
  return {
    name: skillSet?.name ?? "",
    selectedSkillIds: new Set(skillSet?.skillIds ?? []),
    targets: savedTargets
  };
}
