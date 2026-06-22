import fs from "fs-extra";
import path from "node:path";
import YAML from "yaml";
import { copySkillToLibrary, hashDirectory, replaceWithCopy, replaceWithSymlink } from "./file-ops.js";
import { MetadataStore } from "./metadata-store.js";
import { expandHome } from "./paths.js";
import type { SkillMetadata, SkillSetMetadata, TargetConfig, TargetInstallMode } from "./types.js";
import { validateSkill } from "./validator.js";

export interface ScanTargetsInput {
  libraryPath: string;
  targets: TargetConfig[];
  skillSets?: SkillSetMetadata[];
  globalTargetInstallMode?: TargetInstallMode;
  projectTargetInstallMode?: TargetInstallMode;
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

function isInvalidPathError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EINVAL";
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

  let realAncestor = existingAncestor;
  try {
    realAncestor = await fs.realpath(existingAncestor);
  } catch (error) {
    if (!isMissingPathError(error) && !isInvalidPathError(error)) throw error;
  }

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

function enabledTargetPaths(targets: TargetConfig[]): Set<string> {
  return new Set(targets.filter((target) => target.enabled).map((target) => target.path));
}

function resolveTargetsForSkill(
  metadata: SkillMetadata,
  skillSets: SkillSetMetadata[],
  globalTargets: TargetConfig[]
): Set<string> {
  const targetScope = metadata.targetScope ?? "both";
  const targets = new Set<string>();

  if (targetScope === "global" || targetScope === "both") {
    for (const target of enabledTargetPaths(globalTargets)) {
      targets.add(target);
    }
  }

  if (targetScope === "projects" || targetScope === "both") {
    const memberSets = skillSets.filter((skillSet) => skillSet.skillIds.includes(metadata.id));
    for (const target of memberSets.flatMap((skillSet) => skillSet.targets.filter(isProjectSkillSetTarget))) {
      if (target.enabled) targets.add(target.path);
    }
  }

  return targets;
}

function isProjectSkillSetTarget(target: TargetConfig): boolean {
  return target.scope === "project";
}

function upsertScanTarget(targetsByPath: Map<string, TargetConfig>, target: TargetConfig): void {
  const existing = targetsByPath.get(target.path);
  targetsByPath.set(target.path, { ...target, enabled: existing ? existing.enabled || target.enabled : target.enabled });
}

function allScanTargets(globalTargets: TargetConfig[], skillSets: SkillSetMetadata[]): TargetConfig[] {
  const byPath = new Map<string, TargetConfig>();

  for (const target of globalTargets) {
    upsertScanTarget(byPath, target);
  }

  for (const skillSet of skillSets) {
    for (const target of skillSet.targets.filter(isProjectSkillSetTarget)) {
      upsertScanTarget(byPath, target);
    }
  }

  return uniqueTargets([...byPath.values()]);
}

function expandTargetConfig(target: TargetConfig): TargetConfig {
  return { ...target, path: expandHome(target.path) };
}

function expandSkillSets(skillSets: SkillSetMetadata[]): SkillSetMetadata[] {
  return skillSets.map((skillSet) => ({
    ...skillSet,
    targets: skillSet.targets.map(expandTargetConfig)
  }));
}

function projectTargetPaths(skillSets: SkillSetMetadata[]): Set<string> {
  return new Set(
    skillSets
      .flatMap((skillSet) => skillSet.targets.filter(isProjectSkillSetTarget))
      .map((target) => expandHome(target.path))
  );
}

function installModeForTargetDir(
  targetDir: string,
  projectPaths: Set<string>,
  installModes: { global: TargetInstallMode; project: TargetInstallMode }
): TargetInstallMode {
  return projectPaths.has(expandHome(targetDir)) ? installModes.project : installModes.global;
}

export async function scanTargets(input: ScanTargetsInput): Promise<ScanTargetsResult> {
  if (!path.isAbsolute(input.libraryPath)) throw new Error("Library path must be absolute before scanning targets");
  const store = new MetadataStore(input.libraryPath);
  let records: SkillMetadata[];
  let skillSets: SkillSetMetadata[];
  if (input.skillSets === undefined) {
    const libraryState = await store.libraryState();
    records = libraryState.skills;
    skillSets = expandSkillSets(libraryState.skillSets);
  } else {
    records = await store.list();
    skillSets = expandSkillSets(input.skillSets);
  }
  const imported: SkillMetadata[] = [];
  const enabled: TargetSkillChange[] = [];
  const disabled: TargetSkillChange[] = [];
  const errors: Array<{ path: string; message: string }> = [];
  const globalTargets = uniqueTargets(input.targets.map(expandTargetConfig));
  const targets = allScanTargets(globalTargets, skillSets);
  const projectPaths = projectTargetPaths(skillSets);
  const installModes = {
    global: input.globalTargetInstallMode ?? "symlink",
    project: input.projectTargetInstallMode ?? "symlink"
  };
  const enabledChangeKeys = new Set<string>();
  const disabledChangeKeys = new Set<string>();
  let metadataByRealLibraryPath: Map<string, SkillMetadata> | undefined;

  async function isManagedCopy(targetSkillPath: string, metadata: SkillMetadata): Promise<boolean> {
    if (!metadata.contentHash) return false;

    try {
      return (await hashDirectory(targetSkillPath)) === metadata.contentHash;
    } catch {
      return false;
    }
  }

  async function installToTarget(targetPath: string, masterPath: string, mode: TargetInstallMode): Promise<void> {
    if (mode === "copy") {
      await replaceWithCopy(targetPath, masterPath);
      return;
    }

    await replaceWithSymlink(targetPath, masterPath);
  }

  async function findMetadataByRealLibraryPath(libraryPath: string): Promise<SkillMetadata | undefined> {
    metadataByRealLibraryPath ??= await buildMetadataByRealLibraryPath(records);
    try {
      return metadataByRealLibraryPath.get(await fs.realpath(libraryPath));
    } catch (error) {
      if (isMissingPathError(error) || isInvalidPathError(error)) return undefined;
      throw error;
    }
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

  async function removeManagedCopy(
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

    /* v8 ignore next 3 */
    if (stat.isSymbolicLink() || !stat.isDirectory()) return;
    if (!(await isSkillDirectory(targetSkillPath))) return;

    /* v8 ignore next -- removeManagedCopy is only called after metadata is resolved */
    const metadata = verifiedMetadata ?? findMetadataById(records, path.basename(targetSkillPath));
    /* v8 ignore next */
    if (!metadata || path.basename(targetSkillPath) !== metadata.id) return;

    const declaredId = await skillIdFromSkillPath(targetSkillPath);
    /* v8 ignore next */
    if (declaredId !== metadata.id) return;

    await fs.remove(targetSkillPath);
    markDisabled(metadata, targetDir);
  }

  async function ensureManagedCopy(metadata: SkillMetadata, targetDir: string): Promise<void> {
    const targetSkillPath = path.join(targetDir, metadata.id);

    try {
      const stat = await fs.lstat(targetSkillPath);

      if (stat.isSymbolicLink()) {
        await fs.remove(targetSkillPath);
      } else if (stat.isDirectory()) {
        /* v8 ignore next */
        if (path.basename(targetSkillPath) !== metadata.id) return;
        if (!(await isSkillDirectory(targetSkillPath))) return;

        const declaredId = await skillIdFromSkillPath(targetSkillPath);
        /* v8 ignore next */
        if (declaredId !== metadata.id) return;

        const currentHash = await hashDirectory(targetSkillPath);
        if (currentHash === metadata.contentHash) {
          markEnabled(metadata, targetDir);
          return;
        }

        await fs.remove(targetSkillPath);
      } else {
        return;
      }
    } catch (error) {
      /* v8 ignore next */
      if (!isMissingPathError(error)) throw error;
    }

    await replaceWithCopy(targetSkillPath, metadata.libraryPath);
    markEnabled(metadata, targetDir);
  }

  async function ensureManagedInstall(metadata: SkillMetadata, targetDir: string, mode: TargetInstallMode): Promise<void> {
    if (mode === "copy") {
      await ensureManagedCopy(metadata, targetDir);
      return;
    }

    await ensureManagedSymlink(metadata, targetDir);
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
    const installMode = installModeForTargetDir(targetDir, projectPaths, installModes);
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
          await installToTarget(targetSkillPath, existingMetadata.libraryPath, installMode);
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

          await installToTarget(targetSkillPath, librarySkillPath, installMode);
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
    const installMode = installModeForTargetDir(targetDir, projectPaths, installModes);

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

        if (stat.isSymbolicLink()) {
          const metadata = await findMetadataByRealLibraryPath(targetSkillPath);
          if (!metadata) continue;

          const allowedTargets = resolveTargetsForSkill(metadata, skillSets, globalTargets);
          const shouldRemove =
            !targetEnabled || !metadata.enabled || !allowedTargets.has(targetDir) || installMode === "copy";

          if (shouldRemove) {
            await removeManagedSymlink(targetSkillPath, targetDir, metadata);
          }

          continue;
        }

        if (!stat.isDirectory() || !(await isSkillDirectory(targetSkillPath))) continue;

        const declaredId = await skillIdFromSkillPath(targetSkillPath);
        const metadata = findMetadataById(records, declaredId);
        if (!metadata || entry !== metadata.id) continue;

        const allowedTargets = resolveTargetsForSkill(metadata, skillSets, globalTargets);
        const managedCopy = await isManagedCopy(targetSkillPath, metadata);
        const shouldRemove =
          managedCopy &&
          (!targetEnabled || !metadata.enabled || !allowedTargets.has(targetDir) || installMode === "symlink");

        if (shouldRemove) {
          await removeManagedCopy(targetSkillPath, targetDir, metadata);
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

      const allowedTargets = resolveTargetsForSkill(record, skillSets, globalTargets);
      if (!allowedTargets.has(targetDir)) continue;

      try {
        await ensureManagedInstall(record, targetDir, installMode);
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
