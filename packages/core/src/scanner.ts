import fs from "fs-extra";
import path from "node:path";
import YAML from "yaml";
import { copySkillToLibrary, hashDirectory, replaceWithSymlink } from "./file-ops.js";
import { MetadataStore } from "./metadata-store.js";
import type { SkillMetadata } from "./types.js";
import { validateSkill } from "./validator.js";

export interface ScanTargetsInput {
  libraryPath: string;
  targetDirectories: string[];
}

export interface ScanTargetsResult {
  imported: SkillMetadata[];
  enabled: SkillMetadata[];
  errors: Array<{ path: string; message: string }>;
}

function slugFromPath(skillPath: string): string {
  return path.basename(skillPath).toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

function normalizeSkillId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function skillIdFromSkillPath(skillPath: string): Promise<string> {
  const markdown = await fs.readFile(path.join(skillPath, "SKILL.md"), "utf8");
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (match) {
    const frontmatter = YAML.parse(match[1]) ?? {};

    if (typeof frontmatter.name === "string" && frontmatter.name.trim() !== "") {
      return normalizeSkillId(frontmatter.name);
    }
  }

  return slugFromPath(skillPath);
}

async function isSkillDirectory(candidate: string): Promise<boolean> {
  try {
    return (await fs.pathExists(path.join(candidate, "SKILL.md"))) && (await fs.stat(candidate)).isDirectory();
  } catch (error) {
    if (isMissingPathError(error)) return false;
    throw error;
  }
}

async function resolveEffectivePath(targetPath: string): Promise<string> {
  let existingAncestor = targetPath;

  while (!(await fs.pathExists(existingAncestor))) {
    const parent = path.dirname(existingAncestor);
    /* v8 ignore next -- filesystem roots normally exist */
    if (parent === existingAncestor) break;
    existingAncestor = parent;
  }

  const realAncestor = await fs.realpath(existingAncestor);
  const suffix = path.relative(existingAncestor, targetPath);
  return suffix === "" ? realAncestor : path.join(realAncestor, suffix);
}

function isPathInsideOrEqual(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  /* v8 ignore next -- covers Windows drive-boundary paths */
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

async function isUnsafeTargetDirectory(targetDir: string, libraryPath: string): Promise<boolean> {
  const realTargetPath = await fs.realpath(targetDir);
  const realLibraryPath = await resolveEffectivePath(libraryPath);
  return isPathInsideOrEqual(realTargetPath, realLibraryPath);
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

async function findMetadataByRealLibraryPath(records: SkillMetadata[], libraryPath: string): Promise<SkillMetadata | undefined> {
  const realLibraryPath = await fs.realpath(libraryPath);

  for (const record of records) {
    let realRecordPath: string;

    try {
      realRecordPath = await fs.realpath(record.libraryPath);
    } catch {
      continue;
    }

    if (realRecordPath === realLibraryPath) {
      return record;
    }
  }

  return undefined;
}

function findMetadataById(records: SkillMetadata[], id: string): SkillMetadata | undefined {
  return records.find((record) => record.id === id);
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export async function scanTargets(input: ScanTargetsInput): Promise<ScanTargetsResult> {
  if (!path.isAbsolute(input.libraryPath)) {
    throw new Error("Library path must be absolute before scanning targets");
  }

  const store = new MetadataStore(input.libraryPath);
  const records = await store.list();
  const imported: SkillMetadata[] = [];
  const enabled: SkillMetadata[] = [];
  const errors: Array<{ path: string; message: string }> = [];
  const configuredTargets = new Set(input.targetDirectories);
  const observedEnabledTargets = new Map(records.map((record) => [record.id, new Set<string>()]));

  function markEnabled(metadata: SkillMetadata, targetDir: string): void {
    let targets = observedEnabledTargets.get(metadata.id);

    if (!targets) {
      targets = new Set();
      observedEnabledTargets.set(metadata.id, targets);
    }

    targets.add(targetDir);
  }

  for (const targetDir of input.targetDirectories) {
    if (!(await fs.pathExists(targetDir))) continue;
    if (await isUnsafeTargetDirectory(targetDir, input.libraryPath)) continue;

    const entries = await fs.readdir(targetDir);

    for (const entry of entries) {
      const targetSkillPath = path.join(targetDir, entry);

      try {
        const stat = await fs.lstat(targetSkillPath);
        if (stat.isSymbolicLink()) {
          const metadata = await findMetadataByRealLibraryPath(records, targetSkillPath);

          if (!metadata) continue;

          markEnabled(metadata, targetDir);
          enabled.push(metadata);
          continue;
        }
        if (!(await isSkillDirectory(targetSkillPath))) continue;

        const declaredId = await skillIdFromSkillPath(targetSkillPath);
        const existingMetadata = findMetadataById(records, declaredId);

        if (existingMetadata) {
          await replaceWithSymlink(targetSkillPath, existingMetadata.libraryPath);
          markEnabled(existingMetadata, targetDir);
          enabled.push(existingMetadata);
          continue;
        }

        const id = await uniqueSkillId(input.libraryPath, declaredId);
        const librarySkillPath = await copySkillToLibrary(targetSkillPath, input.libraryPath, id);
        const validation = await validateSkill(librarySkillPath);
        const metadata: SkillMetadata = {
          id,
          name: id,
          libraryPath: librarySkillPath,
          source: { type: "unknown" },
          installedAt: new Date().toISOString(),
          contentHash: await hashDirectory(librarySkillPath),
          keepUpdated: false,
          validation,
          enabledTargets: [targetDir],
        };

        await replaceWithSymlink(targetSkillPath, librarySkillPath);
        await store.save(metadata);
        records.push(metadata);
        markEnabled(metadata, targetDir);
        imported.push(metadata);
      } catch (error) {
        if (isMissingPathError(error)) continue;
        errors.push({ path: targetSkillPath, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  for (const record of records) {
    const preservedTargets = record.enabledTargets.filter((targetDir) => !configuredTargets.has(targetDir));
    const observedTargets = input.targetDirectories.filter((targetDir) => observedEnabledTargets.get(record.id)?.has(targetDir));
    const nextTargets = [...preservedTargets, ...observedTargets];

    if (!arraysEqual(record.enabledTargets, nextTargets)) {
      record.enabledTargets = nextTargets;
      await store.save(record);
    }
  }

  return { imported, enabled, errors };
}
