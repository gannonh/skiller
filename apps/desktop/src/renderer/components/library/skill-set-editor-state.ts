import type { SkillSetMetadata, TargetConfig } from "@skiller/core";

export function computeSkillSetEditorState(
  skillSet: SkillSetMetadata | null,
  globalTargets: TargetConfig[]
): { name: string; selectedSkillIds: Set<string>; targets: TargetConfig[] } {
  const savedTargets = skillSet?.targets.map((target) => ({ ...target })) ?? [];
  const savedGlobalTargets = savedTargets.filter((target) => target.scope === "global");
  const projectTargets = savedTargets.filter((target) => target.scope === "project");
  const hasExplicitTargets = savedTargets.length > 0;
  const initialGlobalTargets = globalTargets.map((globalTarget) => {
    const saved = savedGlobalTargets.find((target) => target.path === globalTarget.path);
    return {
      path: globalTarget.path,
      enabled: saved?.enabled ?? (!hasExplicitTargets && globalTarget.enabled),
      scope: "global" as const
    };
  });

  return {
    name: skillSet?.name ?? "",
    selectedSkillIds: new Set(skillSet?.skillIds ?? []),
    targets: [...projectTargets, ...initialGlobalTargets]
  };
}
