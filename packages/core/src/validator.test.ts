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
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-validator-"));
    const skillPath = path.join(root, "missing-skill");
    await fs.ensureDir(skillPath);

    const result = await validateSkill(skillPath);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe("missing-skill-md");

    await fs.remove(root);
  });

  it("warns when the skill path is missing", async () => {
    const result = await validateSkill(path.join(fixtures, "does-not-exist"));
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe("missing-skill-md");
  });

  it("warns when the skill path is a file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-validator-"));
    const skillPath = path.join(root, "SKILL.md");
    await fs.writeFile(skillPath, "---\nname: file-skill\ndescription: File.\n---\n");

    try {
      const result = await validateSkill(skillPath);
      expect(result.valid).toBe(false);
      expect(result.issues[0]?.code).toBe("not-directory");
    } finally {
      await fs.remove(root);
    }
  });

  it("warns when frontmatter is missing or invalid", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-validator-"));
    const missingFrontmatter = path.join(root, "missing-frontmatter");
    const invalidFrontmatter = path.join(root, "invalid-frontmatter");
    await fs.ensureDir(missingFrontmatter);
    await fs.ensureDir(invalidFrontmatter);
    await fs.writeFile(path.join(missingFrontmatter, "SKILL.md"), "Plain markdown");
    await fs.writeFile(path.join(invalidFrontmatter, "SKILL.md"), "---\nname: \"unterminated\n---\n");

    try {
      await expect(validateSkill(missingFrontmatter)).resolves.toMatchObject({
        valid: false,
        issues: [expect.objectContaining({ code: "missing-frontmatter" })]
      });
      await expect(validateSkill(invalidFrontmatter)).resolves.toMatchObject({
        valid: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "invalid-frontmatter" }),
          expect.objectContaining({ code: "missing-frontmatter" })
        ])
      });
    } finally {
      await fs.remove(root);
    }
  });

  it("warns when frontmatter parses to an empty object", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-validator-"));
    const skillPath = path.join(root, "empty-frontmatter");
    await fs.ensureDir(skillPath);
    await fs.writeFile(path.join(skillPath, "SKILL.md"), "---\n\n---\n");

    try {
      const result = await validateSkill(skillPath);

      expect(result.valid).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toEqual(["missing-name", "missing-description"]);
    } finally {
      await fs.remove(root);
    }
  });

  it("warns when the frontmatter name is missing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-validator-"));
    const skillPath = path.join(root, "skill");
    await fs.ensureDir(skillPath);
    await fs.writeFile(path.join(skillPath, "SKILL.md"), "---\ndescription: Test skill.\n---\n");

    try {
      const result = await validateSkill(skillPath);
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual({
        code: "missing-name",
        message: "SKILL.md frontmatter must include name.",
        severity: "warning",
        path: "SKILL.md"
      });
    } finally {
      await fs.remove(root);
    }
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

  it("checks references and assets directories stay inside the skill directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-validator-"));
    const skillPath = path.join(root, "skill");
    const outsideReferences = path.join(root, "outside-references");
    const outsideAssets = path.join(root, "outside-assets");
    await fs.ensureDir(skillPath);
    await fs.ensureDir(outsideReferences);
    await fs.ensureDir(outsideAssets);
    await fs.writeFile(
      path.join(skillPath, "SKILL.md"),
      "---\nname: symlinked-children\ndescription: Test skill.\n---\n"
    );
    await fs.symlink(outsideReferences, path.join(skillPath, "references"), "dir");
    await fs.symlink(outsideAssets, path.join(skillPath, "assets"), "dir");

    try {
      const result = await validateSkill(skillPath);

      expect(result.valid).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toEqual(["path-outside-skill", "path-outside-skill"]);
      expect(result.issues.map((issue) => issue.path)).toEqual(["references", "assets"]);
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
