import type { SkillMetadata } from "./api.js";

function encodeGithubPath(value: string): string {
  return value
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function sourceLabel(skill: SkillMetadata): string {
  if (skill.source.type === "skills.sh") return "Skills Registry";
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

export function sourceUrl(skill: SkillMetadata): string | null {
  if (skill.source.type !== "github" && skill.source.type !== "skills.sh") return null;

  const githubUrl = skill.source.githubUrl.replace(/\/+$/g, "");
  const githubPath = encodeGithubPath(skill.source.githubPath ?? "");
  const skillFilePath = githubPath ? `${githubPath}/SKILL.md` : "SKILL.md";

  return `${githubUrl}/blob/${encodeGithubPath(skill.source.ref ?? "HEAD")}/${skillFilePath}`;
}

export function isUpdateable(skill: SkillMetadata): boolean {
  return (
    (skill.source.type === "github" || skill.source.type === "skills.sh") &&
    Boolean(skill.source.githubUrl && skill.source.ref && skill.source.commit)
  );
}
