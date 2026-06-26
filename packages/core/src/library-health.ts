import fs from "fs-extra";
import path from "node:path";
import { hashDirectory } from "./file-ops.js";
import { updateInstalledSkill } from "./installer.js";
import { MetadataStore } from "./metadata-store.js";
import type { SkillMetadata, SkillSource } from "./types.js";
import { validateSkill } from "./validator.js";

/**
 * Why a tracked skill's library copy is considered unhealthy.
 * - missing-folder: the library directory does not exist.
 * - empty-folder: the directory exists but has no SKILL.md.
 * - invalid: SKILL.md exists but the skill fails validation.
 * - hash-mismatch: the directory content no longer matches the recorded hash.
 */
export type SkillHealthReason = "missing-folder" | "empty-folder" | "invalid" | "hash-mismatch";

export interface SkillHealthIssue {
  id: string;
  name: string;
  reason: SkillHealthReason;
  /** Whether the recorded source allows an automatic re-fetch. */
  refetchable: boolean;
}

export interface LibraryHealthReport {
  checkedAt: string;
  healthy: number;
  issues: SkillHealthIssue[];
}

export interface RepairResultEntry {
  id: string;
  reason: SkillHealthReason;
  status: "repaired" | "skipped" | "error";
  message?: string;
}

export interface RepairLibraryReport {
  checkedAt: string;
  repaired: RepairResultEntry[];
  skipped: RepairResultEntry[];
  errors: RepairResultEntry[];
}

export interface CheckLibraryHealthInput {
  libraryPath: string;
  /**
   * When true (default), flag skills whose content hash no longer matches the
   * recorded contentHash. Skills without a recorded hash are never flagged for
   * this reason.
   */
  checkContentHash?: boolean;
  metadataStore?: MetadataStore;
  now?: () => Date;
}

export interface RepairLibraryInput extends CheckLibraryHealthInput {
  /** Restrict the repair to these skill ids (defaults to all unhealthy skills). */
  skillIds?: string[];
  fetchImpl?: typeof fetch;
}

function isRefetchableSource(source: SkillSource): boolean {
  return (
    (source.type === "github" || source.type === "skills.sh") &&
    typeof source.githubUrl === "string" &&
    source.githubUrl.length > 0 &&
    typeof source.ref === "string" &&
    source.ref.length > 0
  );
}

async function detectReason(
  skill: SkillMetadata,
  checkContentHash: boolean
): Promise<SkillHealthReason | undefined> {
  if (!(await fs.pathExists(skill.libraryPath))) return "missing-folder";

  const skillMd = path.join(skill.libraryPath, "SKILL.md");
  if (!(await fs.pathExists(skillMd))) return "empty-folder";

  const validation = await validateSkill(skill.libraryPath);
  if (!validation.valid) return "invalid";

  if (checkContentHash && skill.contentHash) {
    let currentHash: string;
    try {
      currentHash = await hashDirectory(skill.libraryPath);
    } catch {
      // If we cannot hash the directory, treat it as a content problem.
      return "hash-mismatch";
    }
    if (currentHash !== skill.contentHash) return "hash-mismatch";
  }

  return undefined;
}

/**
 * Inspect every tracked skill's on-disk library copy and report the ones whose
 * content is missing, empty, invalid, or no longer matches the recorded hash.
 * Read-only: nothing is fetched or written.
 */
export async function checkLibraryHealth(input: CheckLibraryHealthInput): Promise<LibraryHealthReport> {
  if (!path.isAbsolute(input.libraryPath)) {
    throw new Error("Library path must be absolute before checking library health");
  }

  const store = input.metadataStore ?? new MetadataStore(input.libraryPath);
  const skills = await store.list();
  const checkContentHash = input.checkContentHash !== false;
  const issues: SkillHealthIssue[] = [];
  let healthy = 0;

  for (const skill of skills) {
    const reason = await detectReason(skill, checkContentHash);
    if (!reason) {
      healthy += 1;
      continue;
    }
    issues.push({
      id: skill.id,
      name: skill.name,
      reason,
      refetchable: isRefetchableSource(skill.source)
    });
  }

  return {
    checkedAt: (input.now?.() ?? new Date()).toISOString(),
    healthy,
    issues
  };
}

/**
 * Detect unhealthy tracked skills and re-fetch the ones whose recorded source
 * allows it (github / skills.sh), restoring their library content from the
 * source's ref. Skills with non-refetchable sources (local / unknown) are
 * reported as skipped. This is the self-healing half of the library health
 * check and is safe to run repeatedly.
 */
export async function repairLibrary(input: RepairLibraryInput): Promise<RepairLibraryReport> {
  if (!path.isAbsolute(input.libraryPath)) {
    throw new Error("Library path must be absolute before repairing the library");
  }

  const store = input.metadataStore ?? new MetadataStore(input.libraryPath);
  const now = input.now ?? (() => new Date());
  const report = await checkLibraryHealth({
    libraryPath: input.libraryPath,
    ...(input.checkContentHash !== undefined ? { checkContentHash: input.checkContentHash } : {}),
    metadataStore: store,
    now
  });

  const onlyIds = input.skillIds ? new Set(input.skillIds) : undefined;
  const targets = onlyIds ? report.issues.filter((issue) => onlyIds.has(issue.id)) : report.issues;

  const repaired: RepairResultEntry[] = [];
  const skipped: RepairResultEntry[] = [];
  const errors: RepairResultEntry[] = [];

  for (const issue of targets) {
    if (!issue.refetchable) {
      skipped.push({
        id: issue.id,
        reason: issue.reason,
        status: "skipped",
        message: "Skill source cannot be re-fetched automatically"
      });
      continue;
    }

    try {
      await updateInstalledSkill({
        skillId: issue.id,
        libraryPath: input.libraryPath,
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
      });
      repaired.push({ id: issue.id, reason: issue.reason, status: "repaired" });
    } catch (error) {
      errors.push({
        id: issue.id,
        reason: issue.reason,
        status: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    checkedAt: report.checkedAt,
    repaired,
    skipped,
    errors
  };
}
