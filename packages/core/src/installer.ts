import fs from "fs-extra";
import path from "node:path";
import YAML from "yaml";
import { copySkillToLibrary, hashDirectory } from "./file-ops.js";
import { MetadataStore } from "./metadata-store.js";
import type { SkillMetadata } from "./types.js";
import { validateSkill } from "./validator.js";

export interface InstallLocalSkillInput {
  sourcePath: string;
  libraryPath: string;
}

function parseSkillName(markdown: string, fallback: string): string {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return fallback;

  try {
    const frontmatter = YAML.parse(match[1]) ?? {};
    return (
      typeof frontmatter === "object" &&
      frontmatter !== null &&
      "name" in frontmatter &&
      typeof frontmatter.name === "string" &&
      frontmatter.name.trim()
    )
      ? frontmatter.name.trim()
      : fallback;
  } catch {
    return fallback;
  }
}

function slugifySkillId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "") || "skill";
}

async function uniqueSkillId(libraryPath: string, slug: string): Promise<string> {
  let id = slug;
  let suffix = 2;

  while (await fs.pathExists(path.join(libraryPath, id))) {
    id = `${slug}-${suffix}`;
    suffix += 1;
  }

  return id;
}

export async function installLocalSkill(input: InstallLocalSkillInput): Promise<SkillMetadata> {
  const skillMd = await fs.readFile(path.join(input.sourcePath, "SKILL.md"), "utf8");
  const displayName = parseSkillName(skillMd, path.basename(input.sourcePath));
  const slug = slugifySkillId(displayName);
  const id = await uniqueSkillId(input.libraryPath, slug);
  const librarySkillPath = await copySkillToLibrary(input.sourcePath, input.libraryPath, id);
  const validation = await validateSkill(librarySkillPath);

  const metadata: SkillMetadata = {
    id,
    name: displayName,
    libraryPath: librarySkillPath,
    source: { type: "local" },
    installedAt: new Date().toISOString(),
    contentHash: await hashDirectory(librarySkillPath),
    keepUpdated: false,
    enabled: true,
    validation
  };

  await new MetadataStore(input.libraryPath).save(metadata);
  return metadata;
}
