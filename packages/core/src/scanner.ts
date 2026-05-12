import fs from "fs-extra";
import path from "node:path";
import YAML from "yaml";
import { copySkillToLibrary, hashDirectory, replaceWithSymlink } from "./file-ops.js";
import { MetadataStore } from "./metadata-store.js";
import type { SkillMetadata, TargetConfig } from "./types.js";
import { validateSkill } from "./validator.js";

export interface ScanTargetsInput {
  libraryPath: string;
  targets: TargetConfig[];
}

export interface TargetSkillChange {
  skillId: string;
  targetPath: string;
}

export interface ScanTargetsResult {
  imported: SkillMetadata[];
  enabled: TargetSkillChange[];
  disabled: TargetSkillChange[];
  errors: Array<{ path: string; message: string }>;
}

function normalizeSkillId(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "") || "skill"
  );
}

function slugFromPath(skillPath: string): string {
  return normalizeSkillId(path.basename(skillPath));
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
  const realTargetPath = await resolveEffectivePath(targetDir);
  const realLibraryPath = await resolveEffectivePath(libraryPath);
  return isPathInsideOrEqual(realTargetPath, realLibraryPath);
}

async function prepareTargetDirectory(targetDir: string, targetEnabled: boolean): Promise<boolean> {
  if (await fs.pathExists(targetDir)) return true;
  if (!targetEnabled) return false;

  await fs.ensureDir(targetDir);
  return true;
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

async function buildMetadataByRealLibraryPath(records: SkillMetadata[]): Promise<Map<string, SkillMetadata>> {
  const metadataByPath = new Map<string, SkillMetadata>();

  for (const record of records) {
    let realRecordPath: string;

    try {
      realRecordPath = await fs.realpath(record.libraryPath);
    } catch {
      continue;
    }

    metadataByPath.set(realRecordPath, record);
  }

  return metadataByPath;
}

function findMetadataById(records: SkillMetadata[], id: string): SkillMetadata | undefined {
  return records.find((record) => record.id === id);
}

function uniqueTargets(targets: TargetConfig[]): TargetConfig[] {
  const seen = new Set<string>();
  const unique: TargetConfig[] = [];

  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const target = targets[index]!;
    if (seen.has(target.path)) continue;
    seen.add(target.path);
    unique.push(target);
  }

  return unique.reverse();
}

function changeKey(skillId: string, targetPath: string): string {
  return `${skillId}\0${targetPath}`;
}

export async function scanTargets(input: ScanTargetsInput): Promise<ScanTargetsResult> {
  if (!path.isAbsolute(input.libraryPath)) {
    throw new Error("Library path must be absolute before scanning targets");
  }

  const store = new MetadataStore(input.libraryPath);
  const records = await store.list();
  const imported: SkillMetadata[] = [];
  const enabled: TargetSkillChange[] = [];
  const disabled: TargetSkillChange[] = [];
  const errors: Array<{ path: string; message: string }> = [];
  const targets = uniqueTargets(input.targets);
  const enabledChangeKeys = new Set<string>();
  const disabledChangeKeys = new Set<string>();
  let metadataByRealLibraryPath: Map<string, SkillMetadata> | undefined;

  async function findMetadataByRealLibraryPath(libraryPath: string): Promise<SkillMetadata | undefined> {
    metadataByRealLibraryPath ??= await buildMetadataByRealLibraryPath(records);
    return metadataByRealLibraryPath.get(await fs.realpath(libraryPath));
  }

  function markEnabled(metadata: SkillMetadata, targetDir: string): void {
    const key = changeKey(metadata.id, targetDir);
    if (enabledChangeKeys.has(key)) return;

    enabledChangeKeys.add(key);
    enabled.push({ skillId: metadata.id, targetPath: targetDir });
  }

  function markDisabled(metadata: SkillMetadata, targetDir: string): void {
    const key = changeKey(metadata.id, targetDir);
    if (disabledChangeKeys.has(key)) return;

    disabledChangeKeys.add(key);
    disabled.push({ skillId: metadata.id, targetPath: targetDir });
  }

  async function removeManagedSymlink(
    targetSkillPath: string,
    targetDir: string,
    verifiedMetadata?: SkillMetadata
  ): Promise<void> {
    let stat;

    try {
      stat = await fs.lstat(targetSkillPath);
    } catch (error) {
      if (isMissingPathError(error)) return;
      throw error;
    }

    if (!stat.isSymbolicLink()) return;

    const metadata = await findMetadataByRealLibraryPath(targetSkillPath);
    if (!metadata) return;
    if (verifiedMetadata && metadata.id !== verifiedMetadata.id) return;

    await fs.remove(targetSkillPath);
    markDisabled(metadata, targetDir);
  }

  async function ensureManagedSymlink(metadata: SkillMetadata, targetDir: string): Promise<void> {
    const targetSkillPath = path.join(targetDir, metadata.id);

    try {
      const stat = await fs.lstat(targetSkillPath);

      if (stat.isSymbolicLink()) {
        const existingMetadata = await findMetadataByRealLibraryPath(targetSkillPath);
        if (existingMetadata?.id === metadata.id) {
          markEnabled(metadata, targetDir);
          return;
        }
      }

      return;
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
    }

    await fs.symlink(metadata.libraryPath, targetSkillPath, "dir");
    markEnabled(metadata, targetDir);
  }

  for (const { path: targetDir, enabled: targetEnabled } of targets) {
    if (!targetEnabled) continue;
    if (await isUnsafeTargetDirectory(targetDir, input.libraryPath)) continue;
    await prepareTargetDirectory(targetDir, targetEnabled);

    let entries: string[];
    try {
      entries = await fs.readdir(targetDir);
    } catch (error) {
      if (isMissingPathError(error)) continue;
      errors.push({ path: targetDir, message: error instanceof Error ? error.message : String(error) });
      continue;
    }

    for (const entry of entries) {
      const targetSkillPath = path.join(targetDir, entry);

      try {
        const stat = await fs.lstat(targetSkillPath);
        if (stat.isSymbolicLink()) continue;
        if (!(await isSkillDirectory(targetSkillPath))) continue;

        const declaredId = await skillIdFromSkillPath(targetSkillPath);
        const existingMetadata = findMetadataById(records, declaredId);

        if (existingMetadata) {
          if (!existingMetadata.enabled) continue;
          if (!(await fs.pathExists(existingMetadata.libraryPath))) continue;
          await replaceWithSymlink(targetSkillPath, existingMetadata.libraryPath);
          markEnabled(existingMetadata, targetDir);
          continue;
        }

        const id = await uniqueSkillId(input.libraryPath, declaredId);
        const librarySkillPath = await copySkillToLibrary(targetSkillPath, input.libraryPath, id);
        let linked = false;

        try {
          const validation = await validateSkill(librarySkillPath);
          const metadata: SkillMetadata = {
            id,
            name: id,
            libraryPath: librarySkillPath,
            source: { type: "unknown", discoveredFrom: targetSkillPath },
            installedAt: new Date().toISOString(),
            contentHash: await hashDirectory(librarySkillPath),
            keepUpdated: false,
            enabled: true,
            tags: [],
            validation
          };

          await replaceWithSymlink(targetSkillPath, librarySkillPath);
          linked = true;
          await store.save(metadata);
          records.push(metadata);
          metadataByRealLibraryPath = undefined;
          markEnabled(metadata, targetDir);
          imported.push(metadata);
        } catch (error) {
          if (!linked) {
            await fs.remove(librarySkillPath);
          }
          throw error;
        }
      } catch (error) {
        if (isMissingPathError(error)) continue;
        errors.push({ path: targetSkillPath, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  for (const { path: targetDir, enabled: targetEnabled } of targets) {
    if (await isUnsafeTargetDirectory(targetDir, input.libraryPath)) continue;
    if (!(await prepareTargetDirectory(targetDir, targetEnabled))) continue;

    let entries: string[];
    try {
      entries = await fs.readdir(targetDir);
    } catch (error) {
      if (isMissingPathError(error)) continue;
      errors.push({ path: targetDir, message: error instanceof Error ? error.message : String(error) });
      continue;
    }

    for (const entry of entries) {
      const targetSkillPath = path.join(targetDir, entry);

      try {
        const stat = await fs.lstat(targetSkillPath);
        if (!stat.isSymbolicLink()) continue;

        const metadata = await findMetadataByRealLibraryPath(targetSkillPath);
        if (!metadata) continue;

        if (!targetEnabled || !metadata.enabled) {
          await removeManagedSymlink(targetSkillPath, targetDir, metadata);
        }
      } catch (error) {
        if (isMissingPathError(error)) continue;
        errors.push({ path: targetSkillPath, message: error instanceof Error ? error.message : String(error) });
      }
    }

    if (!targetEnabled) continue;

    for (const record of records) {
      if (!record.enabled) continue;
      if (!(await fs.pathExists(record.libraryPath))) continue;

      try {
        await ensureManagedSymlink(record, targetDir);
      } catch (error) {
        if (isMissingPathError(error)) continue;
        errors.push({
          path: path.join(targetDir, record.id),
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  return { imported, enabled, disabled, errors };
}
