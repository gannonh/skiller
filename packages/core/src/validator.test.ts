import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateSkill } from "./validator.js";

const fixtures = path.join(process.cwd(), "test-fixtures");

describe("validateSkill", () => {
  it("accepts a skill with required frontmatter", async () => {
    const result = await validateSkill(path.join(fixtures, "valid-skill"));
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("warns when description is missing", async () => {
    const result = await validateSkill(path.join(fixtures, "invalid-skill"));
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      code: "missing-description",
      message: "SKILL.md frontmatter must include description.",
      severity: "warning",
      path: "SKILL.md"
    });
  });

  it("warns when SKILL.md is missing", async () => {
    const result = await validateSkill(path.join(fixtures, "missing-skill"));
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe("missing-skill-md");
  });

  it("warns when scripts resolves outside the skill directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-validator-"));
    const skillPath = path.join(root, "skill");
    const outsidePath = path.join(root, "outside-scripts");
    await fs.ensureDir(skillPath);
    await fs.ensureDir(outsidePath);
    await fs.writeFile(
      path.join(skillPath, "SKILL.md"),
      "---\nname: symlinked-scripts\ndescription: Test skill.\n---\n"
    );
    await fs.symlink(outsidePath, path.join(skillPath, "scripts"), "dir");

    try {
      const result = await validateSkill(skillPath);

      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual({
        code: "path-outside-skill",
        message: "scripts must stay inside the skill directory.",
        severity: "warning",
        path: "scripts"
      });
    } finally {
      await fs.remove(root);
    }
  });

  it("accepts CRLF frontmatter delimiters", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-validator-"));
    const skillPath = path.join(root, "skill");
    await fs.ensureDir(skillPath);
    await fs.writeFile(
      path.join(skillPath, "SKILL.md"),
      "---\r\nname: crlf-skill\r\ndescription: Test skill.\r\n---\r\n"
    );

    try {
      const result = await validateSkill(skillPath);

      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    } finally {
      await fs.remove(root);
    }
  });
});
