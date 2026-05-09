import fs from "fs-extra";
import path from "node:path";
import type { SkillMetadata } from "./types.js";

const METADATA_FILE = "skiller.metadata.json";

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

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

export class MetadataStore {
  constructor(private readonly libraryPath: string) {}

  async list(): Promise<SkillMetadata[]> {
    const dirExists = await fs.pathExists(this.libraryPath);
    if (!dirExists) return [];

    const entries = await fs.readdir(this.libraryPath);
    const records: SkillMetadata[] = [];

    for (const entry of entries) {
      const file = path.join(this.libraryPath, entry, METADATA_FILE);
      if (await fs.pathExists(file)) {
        records.push(await fs.readJson(file));
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
