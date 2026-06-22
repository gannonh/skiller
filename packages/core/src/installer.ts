import fs from "fs-extra";
import path from "node:path";
import YAML from "yaml";
import { copySkillToLibrary, hashDirectory } from "./file-ops.js";
import { MetadataStore } from "./metadata-store.js";
import { SkillsShClient } from "./skills-sh-client.js";
import { extractRegistrySkillSource, fetchGithubSkillSource } from "./source-fetcher.js";
import type { SkillMetadata, SkillSource } from "./types.js";
import { validateSkill } from "./validator.js";

export type DuplicateSkillNameHandler = (error: DuplicateSkillNameError) => boolean | Promise<boolean>;

export interface InstallLocalSkillInput {
  sourcePath: string;
  libraryPath: string;
  replaceExisting?: boolean;
  onDuplicateSkillName?: DuplicateSkillNameHandler;
}

export interface InstallGithubSkillInput {
  githubUrl: string;
  githubPath?: string;
  ref?: string;
  libraryPath: string;
  fetchImpl?: typeof fetch;
  replaceExisting?: boolean;
  onDuplicateSkillName?: DuplicateSkillNameHandler;
}

export interface InstallSkillsShSkillInput {
  skillsShId: string;
  libraryPath: string;
  registrySkill?: Record<string, unknown>;
  client?: {
    skill(id: string): Promise<Record<string, unknown>>;
  };
  fetchImpl?: typeof fetch;
  replaceExisting?: boolean;
  onDuplicateSkillName?: DuplicateSkillNameHandler;
}

export interface UpdateInstalledSkillInput {
  skillId: string;
  libraryPath: string;
  fetchImpl?: typeof fetch;
}

interface SkillInfo {
  name: string;
  description?: string;
}

interface InstallSkillFromDirectoryInput {
  sourcePath: string;
  libraryPath: string;
  source: SkillSource;
  keepUpdated: boolean;
  skillId?: string;
  existingMetadata?: SkillMetadata;
  replaceExisting?: boolean;
  onDuplicateSkillName?: DuplicateSkillNameHandler;
}

export class DuplicateSkillNameError extends Error {
  constructor(
    readonly skillId: string,
    readonly skillName: string
  ) {
    super(`Skill already exists: ${skillName}`);
    this.name = "DuplicateSkillNameError";
  }
}

function stringField(frontmatter: Record<string, unknown>, key: string): string | undefined {
  const value = frontmatter[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseSkillInfo(markdown: string, fallback: string): SkillInfo {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { name: fallback };

  try {
    const frontmatter = YAML.parse(match[1]) ?? {};
    if (typeof frontmatter !== "object" || frontmatter === null || Array.isArray(frontmatter)) {
      return { name: fallback };
    }

    const record = frontmatter as Record<string, unknown>;
    const name = stringField(record, "name") ?? fallback;
    const description = stringField(record, "description");

    return {
      name,
      ...(description ? { description } : {})
    };
  } catch {
    return { name: fallback };
  }
}

function slugifySkillId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "") || "skill";
}

export async function installLocalSkill(input: InstallLocalSkillInput): Promise<SkillMetadata> {
  return installSkillFromDirectory({
    sourcePath: input.sourcePath,
    libraryPath: input.libraryPath,
    source: { type: "local", path: input.sourcePath },
    keepUpdated: false,
    replaceExisting: input.replaceExisting,
    onDuplicateSkillName: input.onDuplicateSkillName
  });
}

async function installSkillFromDirectory(input: InstallSkillFromDirectoryInput): Promise<SkillMetadata> {
  const skillMd = await fs.readFile(path.join(input.sourcePath, "SKILL.md"), "utf8");
  const skillInfo = parseSkillInfo(skillMd, path.basename(input.sourcePath));
  const slug = slugifySkillId(skillInfo.name);
  const store = new MetadataStore(input.libraryPath);
  const id = input.skillId ?? slug;
  const existingMetadata = input.existingMetadata ?? (await store.list()).find((skill) => skill.id === id);
  const duplicateExists = Boolean(existingMetadata) || (await fs.pathExists(path.join(input.libraryPath, id)));

  if (!input.skillId && duplicateExists && !input.replaceExisting) {
    const error = new DuplicateSkillNameError(id, skillInfo.name);
    if (!input.onDuplicateSkillName || !(await input.onDuplicateSkillName(error))) {
      throw error;
    }
  }

  const librarySkillPath = await copySkillToLibrary(input.sourcePath, input.libraryPath, id);
  const validation = await validateSkill(librarySkillPath);
  const now = new Date().toISOString();

  const metadata: SkillMetadata = {
    id,
    name: skillInfo.name,
    ...(skillInfo.description ? { description: skillInfo.description } : {}),
    libraryPath: librarySkillPath,
    source: input.source,
    installedAt: existingMetadata?.installedAt ?? now,
    updatedAt: now,
    ...(existingMetadata?.lastCheckedAt ? { lastCheckedAt: now } : {}),
    contentHash: await hashDirectory(librarySkillPath),
    keepUpdated: input.keepUpdated,
    enabled: existingMetadata?.enabled ?? true,
    tags: existingMetadata?.tags ?? [],
    ...(existingMetadata?.targetScope ? { targetScope: existingMetadata.targetScope } : {}),
    validation
  };

  await store.save(metadata);
  return metadata;
}

export async function installGithubSkill(input: InstallGithubSkillInput): Promise<SkillMetadata> {
  let rootPath: string | undefined;

  try {
    const fetched = await fetchGithubSkillSource({
      githubUrl: input.githubUrl,
      ...(input.githubPath ? { githubPath: input.githubPath } : {}),
      ...(input.ref ? { ref: input.ref } : {}),
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
    });
    rootPath = fetched.rootPath;

    return await installSkillFromDirectory({
      sourcePath: fetched.sourcePath,
      libraryPath: input.libraryPath,
      source: { type: "github", ...fetched.resolved },
      keepUpdated: true,
      replaceExisting: input.replaceExisting,
      onDuplicateSkillName: input.onDuplicateSkillName
    });
  } finally {
    if (rootPath) await fs.remove(rootPath);
  }
}

export async function installSkillsShSkill(input: InstallSkillsShSkillInput): Promise<SkillMetadata> {
  const client = input.client ?? new SkillsShClient({ ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}) });
  const registrySource = extractRegistrySkillSource(input.registrySkill ?? await client.skill(input.skillsShId));
  let rootPath: string | undefined;

  try {
    const fetched = await fetchGithubSkillSource({
      githubUrl: registrySource.githubUrl,
      ...(registrySource.githubPath ? { githubPath: registrySource.githubPath } : {}),
      ...(registrySource.ref ? { ref: registrySource.ref } : {}),
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
    });
    rootPath = fetched.rootPath;

    return await installSkillFromDirectory({
      sourcePath: fetched.sourcePath,
      libraryPath: input.libraryPath,
      source: { type: "skills.sh", skillsShId: registrySource.skillsShId, ...fetched.resolved },
      keepUpdated: true,
      replaceExisting: input.replaceExisting,
      onDuplicateSkillName: input.onDuplicateSkillName
    });
  } finally {
    if (rootPath) await fs.remove(rootPath);
  }
}

function hasUpdateableSource(source: SkillSource): source is SkillSource & {
  type: "github" | "skills.sh";
  githubUrl: string;
  ref: string;
  commit: string;
} {
  return (
    (source.type === "github" || source.type === "skills.sh") &&
    typeof source.githubUrl === "string" &&
    source.githubUrl.length > 0 &&
    typeof source.ref === "string" &&
    source.ref.length > 0 &&
    typeof source.commit === "string" &&
    source.commit.length > 0
  );
}

export async function updateInstalledSkill(input: UpdateInstalledSkillInput): Promise<SkillMetadata> {
  const store = new MetadataStore(input.libraryPath);
  const existing = (await store.list()).find((skill) => skill.id === input.skillId || skill.name === input.skillId);

  if (!existing) {
    throw new Error(`Skill not found: ${input.skillId}`);
  }

  if (!hasUpdateableSource(existing.source)) {
    throw new Error(`Skill cannot be updated: ${input.skillId}`);
  }

  let rootPath: string | undefined;

  try {
    const fetched = await fetchGithubSkillSource({
      githubUrl: existing.source.githubUrl,
      ...(existing.source.githubPath ? { githubPath: existing.source.githubPath } : {}),
      ref: existing.source.ref,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
    });
    rootPath = fetched.rootPath;

    return await installSkillFromDirectory({
      sourcePath: fetched.sourcePath,
      libraryPath: input.libraryPath,
      source:
        existing.source.type === "skills.sh"
          ? { type: "skills.sh", skillsShId: existing.source.skillsShId, ...fetched.resolved }
          : { type: "github", ...fetched.resolved },
      keepUpdated: existing.keepUpdated,
      skillId: existing.id,
      existingMetadata: existing
    });
  } finally {
    if (rootPath) await fs.remove(rootPath);
  }
}
