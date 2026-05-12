import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetadataStore } from "./metadata-store.js";
import type { SkillMetadata } from "./types.js";

const tempDirs: string[] = [];

function metadataFor(libraryPath: string): SkillMetadata {
  return {
    id: "example-skill",
    name: "Example Skill",
    libraryPath,
    source: { type: "local", path: libraryPath },
    installedAt: "2026-05-09T00:00:00.000Z",
    keepUpdated: false,
    validation: { valid: true, issues: [] },
    enabled: true,
    tags: []
  };
}

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-core-"));
  tempDirs.push(dir);
  return dir;
}

describe("MetadataStore", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map((dir) => fs.remove(dir)));
  });

  it("round trips metadata through a root manifest", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const store = new MetadataStore(libraryPath);
    const metadata = metadataFor(skillPath);

    await store.save(metadata);

    expect(await store.list()).toEqual([metadata]);
    await expect(fs.readJson(path.join(libraryPath, "skiller.manifest.json"))).resolves.toEqual({
      version: 1,
      skills: [metadata],
      skillSets: []
    });
    await expect(fs.pathExists(path.join(skillPath, "skiller.metadata.json"))).resolves.toBe(false);
  });

  it("updates existing manifest records by skill id", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const store = new MetadataStore(libraryPath);
    const metadata = metadataFor(skillPath);

    await store.save(metadata);
    await store.save({ ...metadata, enabled: false });

    expect(await store.list()).toEqual([{ ...metadata, enabled: false }]);
  });

  it("defaults manifest metadata without enabled to enabled", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const store = new MetadataStore(libraryPath);
    const { enabled: _enabled, ...metadata } = metadataFor(skillPath);

    await fs.writeJson(path.join(libraryPath, "skiller.manifest.json"), {
      version: 1,
      skills: [metadata]
    });

    expect(await store.list()).toEqual([metadataFor(skillPath)]);
  });

  it("defaults manifest organization fields", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const { enabled: _enabled, ...metadata } = metadataFor(skillPath);

    await fs.writeJson(path.join(libraryPath, "skiller.manifest.json"), {
      version: 1,
      skills: [{ ...metadata, enabled: true }]
    });

    await expect(new MetadataStore(libraryPath).libraryState()).resolves.toEqual({
      skills: [{ ...metadataFor(skillPath), tags: [] }],
      skillSets: [],
      tags: []
    });
  });

  it("clears skill set ids that do not exist", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");

    await fs.writeJson(path.join(libraryPath, "skiller.manifest.json"), {
      version: 1,
      skillSets: [],
      skills: [{ ...metadataFor(skillPath), skillSetId: "missing", tags: ["browser"] }]
    });

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([
      { ...metadataFor(skillPath), tags: ["browser"] }
    ]);
  });

  it("drops non-string tag values from manifest records", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");

    await fs.writeJson(path.join(libraryPath, "skiller.manifest.json"), {
      version: 1,
      skills: [{ ...metadataFor(skillPath), tags: ["Browser", 123, null, "browser"] }]
    });

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([
      { ...metadataFor(skillPath), tags: ["browser"] }
    ]);
  });

  it("ignores invalid and duplicate skill set manifest entries", async () => {
    const libraryPath = await makeTempDir();

    await fs.writeJson(path.join(libraryPath, "skiller.manifest.json"), {
      version: 1,
      skillSets: [
        null,
        { id: "automation", name: "Automation", createdAt: "2026-05-12T00:00:00.000Z" },
        {
          id: "automation",
          name: "Automation",
          createdAt: "2026-05-12T00:00:00.000Z",
          updatedAt: "2026-05-12T00:00:00.000Z"
        },
        {
          id: "automation",
          name: "Duplicate",
          createdAt: "2026-05-12T00:00:00.000Z",
          updatedAt: "2026-05-12T00:00:00.000Z"
        }
      ],
      skills: []
    });

    await expect(new MetadataStore(libraryPath).libraryState()).resolves.toEqual({
      skills: [],
      skillSets: [
        {
          id: "automation",
          name: "Automation",
          createdAt: "2026-05-12T00:00:00.000Z",
          updatedAt: "2026-05-12T00:00:00.000Z"
        }
      ],
      tags: []
    });
  });

  it("creates renames and deletes skill sets", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const otherSkillPath = path.join(libraryPath, "other-skill");
    const store = new MetadataStore(libraryPath);
    const otherMetadata = { ...metadataFor(otherSkillPath), id: "other-skill", name: "Other Skill" };

    await store.save(metadataFor(skillPath));
    await store.save(otherMetadata);
    const created = await store.createSkillSet("Automation");
    expect(created.name).toBe("Automation");

    const renamed = await store.renameSkillSet(created.id, "Browser Automation");
    expect(renamed).toEqual({ ...created, name: "Browser Automation", updatedAt: renamed.updatedAt });

    await store.assignSkillSet("example-skill", created.id);
    expect((await store.list())[0]).toMatchObject({ skillSetId: created.id });

    await store.deleteSkillSet(created.id);
    expect(await store.libraryState()).toEqual({
      skills: [{ ...metadataFor(skillPath), tags: [] }, otherMetadata],
      skillSets: [],
      tags: []
    });
  });

  it("rejects renaming an unknown skill set", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);

    await expect(store.renameSkillSet("missing", "Automation")).rejects.toThrow("Skill set not found: missing");
  });

  it("rejects deleting an unknown skill set", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);

    await expect(store.deleteSkillSet("missing")).rejects.toThrow("Skill set not found: missing");
  });

  it("creates a skill set in a missing library directory", async () => {
    const parentPath = await makeTempDir();
    const libraryPath = path.join(parentPath, "missing-library");
    const store = new MetadataStore(libraryPath);

    const created = await store.createSkillSet("Automation");

    expect(await store.libraryState()).toEqual({
      skills: [],
      skillSets: [created],
      tags: []
    });
  });

  it("creates unique skill set ids for duplicate names", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);

    const first = await store.createSkillSet("Automation");
    const second = await store.createSkillSet("Automation");

    expect(first.id).toBe("automation");
    expect(second.id).toBe("automation-2");
  });

  it("uses a generic skill set id when a name has no slug characters", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);

    await expect(store.createSkillSet("!!!")).resolves.toMatchObject({ id: "skill-set", name: "!!!" });
  });

  it("rejects blank skill set names", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);

    await expect(store.createSkillSet("   ")).rejects.toThrow("Skill set name cannot be blank");
  });

  it("rejects skill set names that exceed the storage limit", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);

    await expect(store.createSkillSet("a".repeat(129))).rejects.toThrow("Skill set name cannot exceed 128 characters");
  });

  it("renames one skill set while preserving other sets", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);
    const first = await store.createSkillSet("Automation");
    const second = await store.createSkillSet("Testing");

    await store.renameSkillSet(first.id, "Browser Automation");

    expect((await store.libraryState()).skillSets).toEqual([
      { ...first, name: "Browser Automation", updatedAt: expect.any(String) },
      second
    ]);
  });

  it("normalizes skill tags and filters with all selected tags", async () => {
    const libraryPath = await makeTempDir();
    const firstPath = path.join(libraryPath, "example-skill");
    const secondPath = path.join(libraryPath, "other-skill");
    const store = new MetadataStore(libraryPath);

    await store.save(metadataFor(firstPath));
    await store.save({ ...metadataFor(secondPath), id: "other-skill", name: "Other Skill" });

    await store.replaceSkillTags("example-skill", [" Browser ", "Testing", "browser", "", "UI   QA"]);
    await store.replaceSkillTags("other-skill", ["browser"]);

    expect(await store.libraryState()).toMatchObject({
      tags: ["browser", "testing", "ui qa"]
    });
    expect((await store.filterSkills({ tags: ["browser", "testing"] })).map((skill) => skill.id)).toEqual([
      "example-skill"
    ]);
  });

  it("rejects tags that exceed the storage limit", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const store = new MetadataStore(libraryPath);

    await store.save(metadataFor(skillPath));

    await expect(store.replaceSkillTags("example-skill", ["a".repeat(65)])).rejects.toThrow(
      "Tag cannot exceed 64 characters"
    );
  });

  it("filters by set and ungrouped skills", async () => {
    const libraryPath = await makeTempDir();
    const firstPath = path.join(libraryPath, "example-skill");
    const secondPath = path.join(libraryPath, "other-skill");
    const store = new MetadataStore(libraryPath);

    await store.save(metadataFor(firstPath));
    await store.save({ ...metadataFor(secondPath), id: "other-skill", name: "Other Skill" });
    const skillSet = await store.createSkillSet("Automation");
    await store.assignSkillSet("example-skill", skillSet.id);

    expect((await store.filterSkills({ skillSetId: skillSet.id })).map((skill) => skill.id)).toEqual(["example-skill"]);
    expect((await store.filterSkills({ ungrouped: true })).map((skill) => skill.id)).toEqual(["other-skill"]);
  });

  it("rejects assigning a skill to an unknown skill set", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const store = new MetadataStore(libraryPath);

    await store.save(metadataFor(skillPath));

    await expect(store.assignSkillSet("example-skill", "missing")).rejects.toThrow("Skill set not found: missing");
  });

  it("rejects assigning an unknown skill to a skill set", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);
    const skillSet = await store.createSkillSet("Automation");

    await expect(store.assignSkillSet("missing", skillSet.id)).rejects.toThrow("Skill not found: missing");
  });

  it("clears a skill set assignment", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const store = new MetadataStore(libraryPath);

    await store.save(metadataFor(skillPath));
    const skillSet = await store.createSkillSet("Automation");
    await store.assignSkillSet("example-skill", skillSet.id);

    await expect(store.assignSkillSet("example-skill")).resolves.toEqual(metadataFor(skillPath));
  });

  it("rejects replacing tags for an unknown skill", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);

    await expect(store.replaceSkillTags("missing", ["browser"])).rejects.toThrow("Skill not found: missing");
  });

  it("derives mixed set state and toggles a whole set", async () => {
    const libraryPath = await makeTempDir();
    const firstPath = path.join(libraryPath, "example-skill");
    const secondPath = path.join(libraryPath, "other-skill");
    const unrelatedPath = path.join(libraryPath, "unrelated-skill");
    const store = new MetadataStore(libraryPath);

    await store.save(metadataFor(firstPath));
    await store.save({ ...metadataFor(secondPath), id: "other-skill", name: "Other Skill", enabled: false });
    await store.save({ ...metadataFor(unrelatedPath), id: "unrelated-skill", name: "Unrelated Skill" });
    const skillSet = await store.createSkillSet("Automation");
    await store.assignSkillSet("example-skill", skillSet.id);
    await store.assignSkillSet("other-skill", skillSet.id);

    expect(await store.skillSetEnablement(skillSet.id)).toBe("mixed");
    await store.setSkillSetEnabled(skillSet.id, false);
    expect((await store.filterSkills({ skillSetId: skillSet.id })).map((skill) => skill.enabled)).toEqual([false, false]);
    expect(await store.skillSetEnablement(skillSet.id)).toBe("off");
    await store.setSkillSetEnabled(skillSet.id, true);
    expect((await store.filterSkills({ skillSetId: skillSet.id })).map((skill) => skill.enabled)).toEqual([true, true]);
    expect(await store.skillSetEnablement(skillSet.id)).toBe("on");
  });

  it("rejects enablement reads for unknown skill sets", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);

    await expect(store.skillSetEnablement("missing")).rejects.toThrow("Skill set not found: missing");
  });

  it("rejects batch enablement for unknown skill sets", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);

    await expect(store.setSkillSetEnabled("missing", true)).rejects.toThrow("Skill set not found: missing");
  });

  it("normalizes source records from the root manifest", async () => {
    const libraryPath = await makeTempDir();
    const localPath = path.join(libraryPath, "local-skill");
    const githubPath = path.join(libraryPath, "github-skill");
    const unknownPath = path.join(libraryPath, "unknown-skill");
    await fs.ensureDir(localPath);
    await fs.ensureDir(githubPath);
    await fs.ensureDir(unknownPath);

    await fs.writeJson(path.join(libraryPath, "skiller.manifest.json"), {
      version: 1,
      skills: [
        { ...metadataFor(localPath), id: "local-skill", name: "Local Skill", source: { type: "local" } },
        {
          ...metadataFor(githubPath),
          id: "github-skill",
          name: "GitHub Skill",
          source: {
            type: "github",
            githubUrl: "https://github.com/example/skills",
            githubPath: "skills/github-skill",
            ref: "main",
            commit: "abc123"
          }
        },
        {
          ...metadataFor(unknownPath),
          id: "unknown-skill",
          name: "Unknown Skill",
          source: { type: "missing-type", value: 1 }
        }
      ]
    });

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([
      {
        ...metadataFor(localPath),
        id: "local-skill",
        name: "Local Skill",
        source: { type: "local", path: localPath }
      },
      {
        ...metadataFor(githubPath),
        id: "github-skill",
        name: "GitHub Skill",
        source: {
          type: "github",
          githubUrl: "https://github.com/example/skills",
          githubPath: "skills/github-skill",
          ref: "main",
          commit: "abc123"
        }
      },
      {
        ...metadataFor(unknownPath),
        id: "unknown-skill",
        name: "Unknown Skill",
        source: { type: "unknown" }
      }
    ]);
  });

  it("normalizes partial and invalid source records from the root manifest", async () => {
    const libraryPath = await makeTempDir();
    const paths = {
      missing: path.join(libraryPath, "missing-source"),
      skillsShMissingUrl: path.join(libraryPath, "skills-sh-missing-url"),
      skillsShMinimal: path.join(libraryPath, "skills-sh-minimal"),
      skillsShFull: path.join(libraryPath, "skills-sh-full"),
      githubMissingUrl: path.join(libraryPath, "github-missing-url"),
      githubMinimal: path.join(libraryPath, "github-minimal"),
      localFallback: path.join(libraryPath, "local-fallback")
    };
    await Promise.all(Object.values(paths).map((skillPath) => fs.ensureDir(skillPath)));

    await fs.writeJson(path.join(libraryPath, "skiller.manifest.json"), {
      version: 1,
      skills: [
        { ...metadataFor(paths.missing), id: "missing-source", name: "Missing Source", source: null },
        {
          ...metadataFor(paths.skillsShMissingUrl),
          id: "skills-sh-missing-url",
          name: "Skills Missing URL",
          source: { type: "skills.sh", skillsShId: "skills-sh-missing-url" }
        },
        {
          ...metadataFor(paths.skillsShMinimal),
          id: "skills-sh-minimal",
          name: "Skills Minimal",
          source: { type: "skills.sh", githubUrl: "https://github.com/example/skills" }
        },
        {
          ...metadataFor(paths.skillsShFull),
          id: "skills-sh-full",
          name: "Skills Full",
          source: {
            type: "skills.sh",
            skillsShId: "skills-sh-full",
            githubUrl: "https://github.com/example/skills",
            githubPath: "skills/skills-sh-full",
            ref: "main",
            commit: "abc123"
          }
        },
        {
          ...metadataFor(paths.githubMissingUrl),
          id: "github-missing-url",
          name: "GitHub Missing URL",
          source: { type: "github", githubPath: "skills/github-missing-url" }
        },
        {
          ...metadataFor(paths.githubMinimal),
          id: "github-minimal",
          name: "GitHub Minimal",
          source: { type: "github", githubUrl: "https://github.com/example/skills" }
        },
        {
          ...metadataFor(paths.localFallback),
          id: "local-fallback",
          name: "Local Fallback",
          source: { type: "local", path: "" }
        }
      ]
    });

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([
      {
        ...metadataFor(paths.missing),
        id: "missing-source",
        name: "Missing Source",
        source: { type: "unknown" }
      },
      {
        ...metadataFor(paths.skillsShMissingUrl),
        id: "skills-sh-missing-url",
        name: "Skills Missing URL",
        source: { type: "unknown" }
      },
      {
        ...metadataFor(paths.skillsShMinimal),
        id: "skills-sh-minimal",
        name: "Skills Minimal",
        source: {
          type: "skills.sh",
          skillsShId: "skills-sh-minimal",
          githubUrl: "https://github.com/example/skills"
        }
      },
      {
        ...metadataFor(paths.skillsShFull),
        id: "skills-sh-full",
        name: "Skills Full",
        source: {
          type: "skills.sh",
          skillsShId: "skills-sh-full",
          githubUrl: "https://github.com/example/skills",
          githubPath: "skills/skills-sh-full",
          ref: "main",
          commit: "abc123"
        }
      },
      {
        ...metadataFor(paths.githubMissingUrl),
        id: "github-missing-url",
        name: "GitHub Missing URL",
        source: { type: "unknown" }
      },
      {
        ...metadataFor(paths.githubMinimal),
        id: "github-minimal",
        name: "GitHub Minimal",
        source: { type: "github", githubUrl: "https://github.com/example/skills" }
      },
      {
        ...metadataFor(paths.localFallback),
        id: "local-fallback",
        name: "Local Fallback",
        source: { type: "local", path: paths.localFallback }
      }
    ]);
  });

  it("treats malformed manifest skills as empty", async () => {
    const libraryPath = await makeTempDir();

    await fs.writeJson(path.join(libraryPath, "skiller.manifest.json"), {
      version: 1,
      skills: null
    });

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([]);
  });

  it("returns an empty library when the manifest is missing", async () => {
    const libraryPath = await makeTempDir();

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([]);
  });

  it("consolidates legacy per-skill metadata into the root manifest", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const metadata = metadataFor(skillPath);

    await fs.ensureDir(skillPath);
    await fs.writeJson(path.join(skillPath, "skiller.metadata.json"), metadata);

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([metadata]);
    await expect(fs.readJson(path.join(libraryPath, "skiller.manifest.json"))).resolves.toEqual({
      version: 1,
      skills: [metadata],
      skillSets: []
    });
    await expect(fs.pathExists(path.join(skillPath, "skiller.metadata.json"))).resolves.toBe(false);
  });

  it("recovers a corrupt manifest from legacy per-skill metadata", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const metadata = metadataFor(skillPath);

    await fs.ensureDir(skillPath);
    await fs.writeFile(path.join(libraryPath, "skiller.manifest.json"), "{");
    await fs.writeJson(path.join(skillPath, "skiller.metadata.json"), metadata);

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([metadata]);
    await expect(fs.readJson(path.join(libraryPath, "skiller.manifest.json"))).resolves.toEqual({
      version: 1,
      skills: [metadata],
      skillSets: []
    });
    await expect(fs.pathExists(path.join(skillPath, "skiller.metadata.json"))).resolves.toBe(false);
  });

  it("returns an empty library for a corrupt manifest without legacy metadata", async () => {
    const libraryPath = await makeTempDir();

    await fs.writeFile(path.join(libraryPath, "skiller.manifest.json"), "{");

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([]);
  });

  it("rethrows non-parse manifest read failures", async () => {
    const libraryPath = await makeTempDir();

    await fs.writeJson(path.join(libraryPath, "skiller.manifest.json"), { version: 1, skills: [] });
    vi.spyOn(fs, "readJson").mockRejectedValueOnce(new Error("read failed"));

    await expect(new MetadataStore(libraryPath).list()).rejects.toThrow("read failed");
  });

  it("updates enabled without replacing unrelated metadata fields", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const otherSkillPath = path.join(libraryPath, "other-skill");
    const store = new MetadataStore(libraryPath);
    const metadata = { ...metadataFor(skillPath), lastCheckedAt: "2026-05-10T00:00:00.000Z" };
    const otherMetadata = { ...metadataFor(otherSkillPath), id: "other-skill", name: "Other Skill" };

    await store.save(metadata);
    await store.save(otherMetadata);
    await store.setEnabled("example-skill", false);

    expect(await store.list()).toEqual([{ ...metadata, enabled: false }, otherMetadata]);
  });

  it("prunes manifest records whose library path is missing", async () => {
    const libraryPath = await makeTempDir();
    const existingPath = path.join(libraryPath, "existing-skill");
    const missingPath = path.join(libraryPath, "missing-skill");
    const existingMetadata = { ...metadataFor(existingPath), id: "existing-skill", name: "Existing Skill" };
    const missingMetadata = { ...metadataFor(missingPath), id: "missing-skill", name: "Missing Skill" };
    const store = new MetadataStore(libraryPath);

    await fs.ensureDir(existingPath);
    await fs.writeJson(path.join(libraryPath, "skiller.manifest.json"), {
      version: 1,
      skills: [existingMetadata, missingMetadata]
    });

    await expect(store.pruneMissing()).resolves.toEqual([missingMetadata]);
    await expect(store.list()).resolves.toEqual([existingMetadata]);
    await expect(fs.readJson(path.join(libraryPath, "skiller.manifest.json"))).resolves.toEqual({
      version: 1,
      skills: [existingMetadata],
      skillSets: []
    });
  });

  it("deletes a manifest record and its library folder", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const otherSkillPath = path.join(libraryPath, "other-skill");
    const store = new MetadataStore(libraryPath);
    const metadata = metadataFor(skillPath);
    const otherMetadata = { ...metadataFor(otherSkillPath), id: "other-skill", name: "Other Skill" };

    await fs.ensureDir(skillPath);
    await fs.writeFile(path.join(skillPath, "SKILL.md"), "example");
    await fs.ensureDir(otherSkillPath);
    await fs.writeFile(path.join(otherSkillPath, "SKILL.md"), "other");
    await store.save(metadata);
    await store.save(otherMetadata);

    await expect(store.delete("example-skill")).resolves.toEqual(metadata);
    await expect(fs.pathExists(skillPath)).resolves.toBe(false);
    await expect(fs.pathExists(otherSkillPath)).resolves.toBe(true);
    await expect(store.list()).resolves.toEqual([otherMetadata]);
  });

  it("rejects deleting an unknown skill", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);

    await expect(store.delete("missing")).rejects.toThrow("Skill not found: missing");
  });

  it("rejects enabling an unknown skill", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);

    await expect(store.setEnabled("missing", true)).rejects.toThrow("Skill not found: missing");
  });

  it("removes temporary manifest files when an atomic replace fails", async () => {
    const libraryPath = await makeTempDir();
    const skillPath = path.join(libraryPath, "example-skill");
    const store = new MetadataStore(libraryPath);

    vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("rename failed"));

    await expect(store.save(metadataFor(skillPath))).rejects.toThrow("rename failed");

    const entries = await fs.readdir(libraryPath);
    expect(entries.filter((entry) => entry.includes("skiller.manifest.json") && entry.endsWith(".tmp"))).toEqual([]);
  });

  it("skips corrupt legacy metadata during consolidation", async () => {
    const libraryPath = await makeTempDir();
    const validPath = path.join(libraryPath, "valid");
    const corruptPath = path.join(libraryPath, "corrupt");
    const metadata = metadataFor(validPath);

    await fs.ensureDir(validPath);
    await fs.ensureDir(corruptPath);
    await fs.writeJson(path.join(validPath, "skiller.metadata.json"), metadata);
    await fs.writeFile(path.join(corruptPath, "skiller.metadata.json"), "{");

    await expect(new MetadataStore(libraryPath).list()).resolves.toEqual([metadata]);
  });

  it("rejects metadata paths outside the configured library", async () => {
    const libraryPath = await makeTempDir();
    const outsidePath = path.join(await makeTempDir(), "example-skill");
    const store = new MetadataStore(libraryPath);

    await expect(store.save(metadataFor(outsidePath))).rejects.toThrow(
      "Metadata path must be inside the configured library"
    );
    expect(await fs.pathExists(path.join(libraryPath, "skiller.manifest.json"))).toBe(false);
  });

  it("rejects metadata saved at the library root", async () => {
    const libraryPath = await makeTempDir();
    const store = new MetadataStore(libraryPath);

    await expect(store.save(metadataFor(libraryPath))).rejects.toThrow(
      "Metadata path must be inside the configured library"
    );
  });

  it("rejects symlinked metadata paths that resolve outside the configured library", async () => {
    const libraryPath = await makeTempDir();
    const outsidePath = await makeTempDir();
    const symlinkPath = path.join(libraryPath, "linked-outside");
    const store = new MetadataStore(libraryPath);

    await fs.symlink(outsidePath, symlinkPath);

    await expect(store.save(metadataFor(symlinkPath))).rejects.toThrow(
      "Metadata path must be inside the configured library"
    );
    expect(await fs.pathExists(path.join(libraryPath, "skiller.manifest.json"))).toBe(false);
  });
});
