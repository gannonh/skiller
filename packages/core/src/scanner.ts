import fs from "fs-extra";
import path from "node:path";
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

async function isSkillDirectory(candidate: string): Promise<boolean> {
  return (await fs.pathExists(path.join(candidate, "SKILL.md"))) && (await fs.stat(candidate)).isDirectory();
}

async function resolveEffectivePath(targetPath: string): Promise<string> {
  let existingAncestor = targetPath;

  while (!(await fs.pathExists(existingAncestor))) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) break;
    existingAncestor = parent;
  }

  const realAncestor = await fs.realpath(existingAncestor);
  const suffix = path.relative(existingAncestor, targetPath);
  return suffix === "" ? realAncestor : path.join(realAncestor, suffix);
}

function isPathInsideOrEqual(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

async function isUnsafeTargetDirectory(targetDir: string, libraryPath: string): Promise<boolean> {
  if (!(await fs.pathExists(targetDir))) return false;

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

export async function scanTargets(input: ScanTargetsInput): Promise<ScanTargetsResult> {
  if (!path.isAbsolute(input.libraryPath)) {
    throw new Error("Library path must be absolute before scanning targets");
  }

  const store = new MetadataStore(input.libraryPath);
  const records = await store.list();
  const imported: SkillMetadata[] = [];
  const enabled: SkillMetadata[] = [];
  const errors: Array<{ path: string; message: string }> = [];

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

          if (!metadata.enabledTargets.includes(targetDir)) {
            metadata.enabledTargets = [...metadata.enabledTargets, targetDir];
            await store.save(metadata);
          }

          enabled.push(metadata);
          continue;
        }
        if (!(await isSkillDirectory(targetSkillPath))) continue;

        const id = await uniqueSkillId(input.libraryPath, slugFromPath(targetSkillPath));
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
        imported.push(metadata);
      } catch (error) {
        errors.push({ path: targetSkillPath, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return { imported, enabled, errors };
}
