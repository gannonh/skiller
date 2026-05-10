import fs from "fs-extra";
import path from "node:path";
import YAML from "yaml";
import type { ValidationIssue, ValidationResult } from "./types.js";

function issue(code: string, message: string, pathName?: string): ValidationIssue {
  return { code, message, severity: "warning", path: pathName };
}

function parseFrontmatter(markdown: string): Record<string, unknown> | null {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  return YAML.parse(match[1]) ?? {};
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  /* v8 ignore next -- covers Windows drive-boundary paths */
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function validateSkill(skillPath: string): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const statExists = await fs.pathExists(skillPath);

  if (!statExists) {
    return {
      valid: false,
      issues: [issue("missing-skill-path", "Skill path does not exist.")]
    };
  }

  if (!(await fs.stat(skillPath)).isDirectory()) {
    return {
      valid: false,
      issues: [issue("not-directory", "Skill path must be a directory.")]
    };
  }

  const skillMd = path.join(skillPath, "SKILL.md");
  if (!(await fs.pathExists(skillMd))) {
    return {
      valid: false,
      issues: [issue("missing-skill-md", "Skill directory must contain SKILL.md.", "SKILL.md")]
    };
  }

  const markdown = await fs.readFile(skillMd, "utf8");
  let frontmatter: Record<string, unknown> | null = null;

  try {
    frontmatter = parseFrontmatter(markdown);
  } catch {
    issues.push(issue("invalid-frontmatter", "SKILL.md frontmatter must parse as YAML.", "SKILL.md"));
  }

  if (!frontmatter) {
    issues.push(issue("missing-frontmatter", "SKILL.md must start with YAML frontmatter.", "SKILL.md"));
  } else {
    if (typeof frontmatter.name !== "string" || frontmatter.name.trim() === "") {
      issues.push(issue("missing-name", "SKILL.md frontmatter must include name.", "SKILL.md"));
    }

    if (typeof frontmatter.description !== "string" || frontmatter.description.trim() === "") {
      issues.push(issue("missing-description", "SKILL.md frontmatter must include description.", "SKILL.md"));
    }
  }

  for (const child of ["scripts", "references", "assets"]) {
    const childPath = path.join(skillPath, child);
    if (!(await fs.pathExists(childPath))) continue;

    const realSkillPath = await fs.realpath(skillPath);
    const realChildPath = await fs.realpath(childPath);
    if (!isInside(realSkillPath, realChildPath)) {
      issues.push(issue("path-outside-skill", `${child} must stay inside the skill directory.`, child));
    }
  }

  return { valid: issues.length === 0, issues };
}
