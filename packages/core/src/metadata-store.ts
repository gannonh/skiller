import fs from "fs-extra";
import { open } from "node:fs/promises";
import path from "node:path";
import type { SkillMetadata, SkillSource } from "./types.js";

const MANIFEST_FILE = "skiller.manifest.json";
const LEGACY_METADATA_FILE = "skiller.metadata.json";
const writeLocks = new Map<string, Promise<unknown>>();

interface SkillManifest {
  version: 1;
  skills: SkillMetadata[];
}

interface LegacyRecords {
  records: SkillMetadata[];
  files: string[];
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

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  /* v8 ignore next -- covers Windows drive-boundary paths */
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeSource(metadata: SkillMetadata): SkillSource {
  const source = metadata.source as unknown;
  if (typeof source !== "object" || source === null) return { type: "unknown" };

  const record = source as Record<string, unknown>;

  if (record.type === "skills.sh") {
    const skillsShId = stringField(record, "skillsShId") ?? metadata.id;
    const githubUrl = stringField(record, "githubUrl");
    if (!githubUrl) return { type: "unknown" };
    const githubPath = stringField(record, "githubPath");
    const ref = stringField(record, "ref");
    const commit = stringField(record, "commit");

    return {
      type: "skills.sh",
      skillsShId,
      githubUrl,
      ...(githubPath ? { githubPath } : {}),
      ...(ref ? { ref } : {}),
      ...(commit ? { commit } : {})
    };
  }

  if (record.type === "github") {
    const githubUrl = stringField(record, "githubUrl");
    if (!githubUrl) return { type: "unknown" };
    const githubPath = stringField(record, "githubPath");
    const ref = stringField(record, "ref");
    const commit = stringField(record, "commit");

    return {
      type: "github",
      githubUrl,
      ...(githubPath ? { githubPath } : {}),
      ...(ref ? { ref } : {}),
      ...(commit ? { commit } : {})
    };
  }

  if (record.type === "local") {
    const sourcePath = stringField(record, "path");
    return { type: "local", path: sourcePath ?? metadata.libraryPath };
  }

  if (record.type === "unknown") {
    const discoveredFrom = stringField(record, "discoveredFrom");
    return discoveredFrom ? { type: "unknown", discoveredFrom } : { type: "unknown" };
  }

  return { type: "unknown" };
}

function normalizeMetadata(metadata: SkillMetadata): SkillMetadata {
  return {
    ...metadata,
    source: normalizeSource(metadata),
    enabled: typeof metadata.enabled === "boolean" ? metadata.enabled : true
  };
}

async function assertMetadataPathInsideLibrary(libraryPath: string, metadataPath: string): Promise<void> {
  const libraryRoot = await fs.realpath(libraryPath);
  const resolvedMetadataPath = path.resolve(metadataPath);
  const effectiveMetadataPath = await resolveEffectivePath(resolvedMetadataPath);

  if (!isPathInside(libraryRoot, effectiveMetadataPath)) {
    throw new Error("Metadata path must be inside the configured library");
  }
}

export class MetadataStore {
  constructor(private readonly libraryPath: string) {}

  private manifestPath(): string {
    return path.join(this.libraryPath, MANIFEST_FILE);
  }

  private async readLegacyRecords(): Promise<LegacyRecords> {
    if (!(await fs.pathExists(this.libraryPath))) return { records: [], files: [] };

    const entries = await fs.readdir(this.libraryPath, { withFileTypes: true });
    const records: SkillMetadata[] = [];
    const files: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === ".staging") continue;

      const file = path.join(this.libraryPath, entry.name, LEGACY_METADATA_FILE);
      if (!(await fs.pathExists(file))) continue;

      try {
        records.push(normalizeMetadata(await fs.readJson(file)));
        files.push(file);
      } catch {
        continue;
      }
    }

    return { records, files };
  }

  private async writeManifest(skills: SkillMetadata[]): Promise<void> {
    const manifest: SkillManifest = {
      version: 1,
      skills
    };
    const finalPath = this.manifestPath();
    const tmpPath = `${finalPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;

    try {
      await fs.writeJson(tmpPath, manifest, { spaces: 2 });
      const handle = await open(tmpPath, "r");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(tmpPath, finalPath);
    } catch (error) {
      await fs.remove(tmpPath).catch(() => undefined);
      throw error;
    }
  }

  private async removeLegacyRecords(files: string[]): Promise<void> {
    await Promise.all(files.map((file) => fs.remove(file)));
  }

  async list(): Promise<SkillMetadata[]> {
    if (!(await fs.pathExists(this.manifestPath()))) {
      const legacyRecords = await this.readLegacyRecords();

      if (legacyRecords.records.length === 0) return [];

      await this.writeManifest(legacyRecords.records);
      await this.removeLegacyRecords(legacyRecords.files);
      return legacyRecords.records;
    }

    let manifest: SkillManifest;

    try {
      manifest = (await fs.readJson(this.manifestPath())) as SkillManifest;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;

      const legacyRecords = await this.readLegacyRecords();
      if (legacyRecords.records.length === 0) return [];

      await this.writeManifest(legacyRecords.records);
      await this.removeLegacyRecords(legacyRecords.files);
      return legacyRecords.records;
    }

    return Array.isArray(manifest.skills) ? manifest.skills.map(normalizeMetadata) : [];
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const key = path.resolve(this.libraryPath);
    const previous = writeLocks.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    const tracked = next.catch(() => undefined).then(() => {
      if (writeLocks.get(key) === tracked) {
        writeLocks.delete(key);
      }
    });

    writeLocks.set(key, tracked);

    return next;
  }

  async save(metadata: SkillMetadata): Promise<void> {
    await fs.ensureDir(this.libraryPath);

    await assertMetadataPathInsideLibrary(this.libraryPath, metadata.libraryPath);

    await this.withWriteLock(async () => {
      const currentSkills = await this.list();
      const existingIndex = currentSkills.findIndex((skill) => skill.id === metadata.id);
      const nextSkills =
        existingIndex === -1
          ? [...currentSkills, metadata]
          : currentSkills.map((skill, index) => (index === existingIndex ? metadata : skill));

      await this.writeManifest(nextSkills);
    });
  }

  async setEnabled(skillId: string, enabled: boolean): Promise<SkillMetadata> {
    return this.withWriteLock(async () => {
      const currentSkills = await this.list();
      const existingIndex = currentSkills.findIndex((skill) => skill.id === skillId);

      if (existingIndex === -1) {
        throw new Error(`Skill not found: ${skillId}`);
      }

      const updated = { ...currentSkills[existingIndex], enabled };
      await this.writeManifest(currentSkills.map((skill, index) => (index === existingIndex ? updated : skill)));
      return updated;
    });
  }

  async pruneMissing(): Promise<SkillMetadata[]> {
    return this.withWriteLock(async () => {
      const currentSkills = await this.list();
      const existingSkills: SkillMetadata[] = [];
      const missingSkills: SkillMetadata[] = [];

      for (const skill of currentSkills) {
        if (await fs.pathExists(skill.libraryPath)) {
          existingSkills.push(skill);
        } else {
          missingSkills.push(skill);
        }
      }

      if (missingSkills.length > 0) {
        await this.writeManifest(existingSkills);
      }

      return missingSkills;
    });
  }

  async delete(skillId: string): Promise<SkillMetadata> {
    await fs.ensureDir(this.libraryPath);

    return this.withWriteLock(async () => {
      const currentSkills = await this.list();
      const existing = currentSkills.find((skill) => skill.id === skillId);

      if (!existing) {
        throw new Error(`Skill not found: ${skillId}`);
      }

      await assertMetadataPathInsideLibrary(this.libraryPath, existing.libraryPath);
      await fs.remove(existing.libraryPath);
      await this.writeManifest(currentSkills.filter((skill) => skill.id !== skillId));
      return existing;
    });
  }
}
