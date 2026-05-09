import crypto from "node:crypto";
import fs from "fs-extra";
import path from "node:path";

async function listFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolute)));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }

  return files.sort();
}

function updateHashFrame(hash: crypto.Hash, label: string, data: Buffer | string): void {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  hash.update(label);
  hash.update("\0");
  hash.update(String(bytes.length));
  hash.update("\0");
  hash.update(bytes);
}

export async function hashDirectory(root: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const files = await listFiles(root);

  for (const file of files) {
    const relative = path.relative(root, file);
    updateHashFrame(hash, "path", relative);
    updateHashFrame(hash, "content", await fs.readFile(file));
  }

  return hash.digest("hex");
}

export async function copySkillToLibrary(sourcePath: string, libraryPath: string, skillId: string): Promise<string> {
  const destination = path.join(libraryPath, skillId);
  const staging = path.join(libraryPath, ".staging", `${skillId}-${Date.now()}`);

  await fs.ensureDir(path.dirname(staging));
  await fs.copy(sourcePath, staging, { dereference: true });
  await fs.ensureDir(libraryPath);
  await fs.move(staging, destination, { overwrite: true });

  return destination;
}

export async function replaceWithSymlink(targetPath: string, masterPath: string): Promise<void> {
  const backup = `${targetPath}.skiller-backup-${Date.now()}`;
  let symlinkCreated = false;
  await fs.move(targetPath, backup);

  try {
    await fs.symlink(masterPath, targetPath, "dir");
    symlinkCreated = true;
    await fs.remove(backup);
  } catch (error) {
    if (symlinkCreated) {
      await fs.remove(targetPath);
    }

    await fs.move(backup, targetPath);
    throw error;
  }
}
