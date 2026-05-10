import fs from "fs-extra";
import path from "node:path";
import type { SkillMetadata } from "./types.js";

const METADATA_FILE = "skiller.metadata.json";

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

  async list(): Promise<SkillMetadata[]> {
    const dirExists = await fs.pathExists(this.libraryPath);
    if (!dirExists) return [];

    const entries = await fs.readdir(this.libraryPath, { withFileTypes: true });
    const records: SkillMetadata[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === ".staging") continue;

      const file = path.join(this.libraryPath, entry.name, METADATA_FILE);
      if (await fs.pathExists(file)) {
        try {
          records.push(normalizeMetadata(await fs.readJson(file)));
        } catch {
          continue;
        }
      }
    }

    return records;
  }

  async save(metadata: SkillMetadata): Promise<void> {
    await fs.ensureDir(this.libraryPath);

    const libraryRoot = await fs.realpath(this.libraryPath);
    const metadataPath = path.resolve(metadata.libraryPath);
    const effectiveMetadataPath = await resolveEffectivePath(metadataPath);

    if (!isPathInside(libraryRoot, effectiveMetadataPath)) {
      throw new Error("Metadata path must be inside the configured library");
    }

    await fs.ensureDir(effectiveMetadataPath);
    await fs.writeJson(path.join(effectiveMetadataPath, METADATA_FILE), metadata, { spaces: 2 });
  }
}
