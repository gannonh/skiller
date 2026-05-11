import type { SkillMetadata } from "./api.js";

export function sourceLabel(skill: SkillMetadata): string {
  if (skill.source.type === "skills.sh") return "Registry";
  if (skill.source.type === "github") return "GitHub";
  if (skill.source.type === "local") return "Local";
  return "Unknown";
}

export function sourceDetail(skill: SkillMetadata): string {
  if (skill.source.type === "local") return skill.source.path;
  if (skill.source.type === "unknown") return skill.source.discoveredFrom ?? "Untracked source";
  if (skill.source.githubPath) return `${skill.source.githubUrl}/${skill.source.githubPath}`;
  return skill.source.githubUrl;
}

export function isUpdateable(skill: SkillMetadata): boolean {
  return (
    (skill.source.type === "github" || skill.source.type === "skills.sh") &&
    Boolean(skill.source.githubUrl && skill.source.ref && skill.source.commit)
  );
}
