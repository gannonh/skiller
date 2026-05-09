export function defaultTargetDirectories(): string[] {
  return [
    "~/.agents/skills",
    "~/.claude/skills",
    "~/.codex/skills",
    "~/.cursor/skills",
    "~/.pi/agent/skills",
    "~/.gemini/skills",
    "~/.copilot/skills"
  ];
}

export function expandHome(path: string, home = process.env.HOME ?? ""): string {
  if (path === "~") return home;
  if (path.startsWith("~/")) return `${home}/${path.slice(2)}`;
  return path;
}
