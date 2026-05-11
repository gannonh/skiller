import fs from "fs-extra";
import path from "node:path";
import type { SkillMetadata } from "./types.js";

const MANIFEST_FILE = "skiller.manifest.json";
const LEGACY_METADATA_FILE = "skiller.metadata.json";

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

function normalizeMetadata(metadata: SkillMetadata): SkillMetadata {
  return {
    ...metadata,
    enabled: typeof metadata.enabled === "boolean" ? metadata.enabled : true
  };
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

    await fs.writeJson(this.manifestPath(), manifest, { spaces: 2 });
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

    const manifest = (await fs.readJson(this.manifestPath())) as SkillManifest;

    return Array.isArray(manifest.skills) ? manifest.skills.map(normalizeMetadata) : [];
  }

  async save(metadata: SkillMetadata): Promise<void> {
    await fs.ensureDir(this.libraryPath);

    const libraryRoot = await fs.realpath(this.libraryPath);
    const metadataPath = path.resolve(metadata.libraryPath);
    const effectiveMetadataPath = await resolveEffectivePath(metadataPath);

    if (!isPathInside(libraryRoot, effectiveMetadataPath)) {
      throw new Error("Metadata path must be inside the configured library");
    }

    const currentSkills = await this.list();
    const existingIndex = currentSkills.findIndex((skill) => skill.id === metadata.id);
    const nextSkills =
      existingIndex === -1
        ? [...currentSkills, metadata]
        : currentSkills.map((skill, index) => (index === existingIndex ? metadata : skill));

    await this.writeManifest(nextSkills);
  }
}
