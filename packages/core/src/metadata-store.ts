import fs from "fs-extra";
import { open } from "node:fs/promises";
import path from "node:path";
import {
  isUngrouped,
  normalizeSkillSetSkillIds,
  normalizeSkillSetTargets,
  skillsInSet,
  type SaveSkillSetInput
} from "./skill-sets.js";
import type { LibraryState, SkillMetadata, SkillSetMetadata, SkillSource, SkillTargetScope, TargetConfig } from "./types.js";

const MANIFEST_FILE = "skiller.manifest.json";
const LEGACY_METADATA_FILE = "skiller.metadata.json";
const MAX_TAG_LENGTH = 64;
const MAX_SKILL_SET_NAME_LENGTH = 128;
const writeLocks = new Map<string, Promise<unknown>>();

interface SkillManifest {
  version: 1;
  skills: SkillMetadata[];
  skillSets?: SkillSetMetadata[];
}

interface LegacyRecords {
  records: SkillMetadata[];
  files: string[];
}

export type SkillSetEnablement = "on" | "off" | "mixed";

export interface SkillFilter {
  skillSetId?: string;
  ungrouped?: boolean;
  tags?: string[];
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

function normalizeTag(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  if (normalized.length > MAX_TAG_LENGTH) throw new Error(`Tag cannot exceed ${MAX_TAG_LENGTH} characters`);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSkillTargetScope(value: unknown): SkillTargetScope {
  return value === "projects" || value === "global" || value === "both" ? value : "both";
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const tag = normalizeTag(item);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }

  return tags;
}

function normalizeSkillSets(value: unknown, validSkillIds: Set<string> = new Set()): SkillSetMetadata[] {
  if (!Array.isArray(value)) return [];
  const skillSets: SkillSetMetadata[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = stringField(record, "id");
    const name = stringField(record, "name");
    const createdAt = stringField(record, "createdAt");
    const updatedAt = stringField(record, "updatedAt");
    if (!id || !name || !createdAt || !updatedAt || seen.has(id)) continue;
    seen.add(id);
    skillSets.push({
      id,
      name,
      skillIds: normalizeSkillSetSkillIds(record.skillIds, validSkillIds),
      targets: normalizeSkillSetTargets(record.targets),
      createdAt,
      updatedAt
    });
  }

  return skillSets;
}

function knownTags(skills: SkillMetadata[]): string[] {
  return Array.from(new Set(skills.flatMap((skill) => skill.tags))).sort((left, right) => left.localeCompare(right));
}

function normalizeSkillSetName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) throw new Error("Skill set name cannot be blank");
  if (normalized.length > MAX_SKILL_SET_NAME_LENGTH) {
    throw new Error(`Skill set name cannot exceed ${MAX_SKILL_SET_NAME_LENGTH} characters`);
  }
  return normalized;
}

function slugifySkillSetId(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "") || "skill-set"
  );
}

function uniqueSkillSetId(skillSets: SkillSetMetadata[], name: string): string {
  const base = slugifySkillSetId(name);
  const existingIds = new Set(skillSets.map((skillSet) => skillSet.id));
  let id = base;
  let suffix = 2;

  while (existingIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }

  return id;
}

function normalizeMetadata(metadata: SkillMetadata): SkillMetadata {
  const tags = normalizeTags((metadata as SkillMetadata & { tags?: unknown }).tags);
  const { skillSetId: _skillSetId, ...metadataWithoutSkillSetId } = metadata as SkillMetadata & {
    skillSetId?: string;
  };

  return {
    ...metadataWithoutSkillSetId,
    source: normalizeSource(metadata),
    enabled: typeof metadata.enabled === "boolean" ? metadata.enabled : true,
    targetScope: normalizeSkillTargetScope((metadata as SkillMetadata & { targetScope?: unknown }).targetScope),
    tags
  };
}

function readLegacySkillSetId(metadata: SkillMetadata): string | undefined {
  return stringField(metadata as unknown as Record<string, unknown>, "skillSetId");
}

function migrateLegacyMembership(
  skills: SkillMetadata[],
  skillSets: SkillSetMetadata[]
): SkillSetMetadata[] {
  const skillSetById = new Map(skillSets.map((skillSet) => [skillSet.id, { ...skillSet, skillIds: [...skillSet.skillIds] }]));

  for (const skill of skills) {
    const legacySkillSetId = readLegacySkillSetId(skill);
    if (!legacySkillSetId) continue;

    const existing = skillSetById.get(legacySkillSetId);
    if (!existing || existing.skillIds.includes(skill.id)) continue;
    existing.skillIds.push(skill.id);
  }

  return skillSets.map((skillSet) => skillSetById.get(skillSet.id)!);
}

function normalizeSaveSkillSetTargets(targets: TargetConfig[]): TargetConfig[] {
  return normalizeSkillSetTargets(targets);
}

function normalizeSaveSkillSetSkillIds(skillIds: string[], validSkillIds: Set<string>): string[] {
  return normalizeSkillSetSkillIds(skillIds, validSkillIds);
}

function removeSkillFromSets(skillSets: SkillSetMetadata[], skillId: string): SkillSetMetadata[] {
  const now = new Date().toISOString();
  return skillSets.map((skillSet) => {
    if (!skillSet.skillIds.includes(skillId)) return skillSet;
    return {
      ...skillSet,
      skillIds: skillSet.skillIds.filter((id) => id !== skillId),
      updatedAt: now
    };
  });
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

  private async writeManifest(skills: SkillMetadata[], skillSets: SkillSetMetadata[] = []): Promise<void> {
    const manifest: SkillManifest = {
      version: 1,
      skills,
      skillSets
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

  private async readManifest(): Promise<{ skills: SkillMetadata[]; skillSets: SkillSetMetadata[] }> {
    if (!(await fs.pathExists(this.manifestPath()))) {
      const legacyRecords = await this.readLegacyRecords();

      if (legacyRecords.records.length === 0) return { skills: [], skillSets: [] };

      await this.writeManifest(legacyRecords.records, []);
      await this.removeLegacyRecords(legacyRecords.files);
      return { skills: legacyRecords.records.map((record) => normalizeMetadata(record)), skillSets: [] };
    }

    let manifest: SkillManifest;

    try {
      manifest = (await fs.readJson(this.manifestPath())) as SkillManifest;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;

      const legacyRecords = await this.readLegacyRecords();
      if (legacyRecords.records.length === 0) return { skills: [], skillSets: [] };

      await this.writeManifest(legacyRecords.records, []);
      await this.removeLegacyRecords(legacyRecords.files);
      return { skills: legacyRecords.records.map((record) => normalizeMetadata(record)), skillSets: [] };
    }

    const rawSkills = Array.isArray(manifest.skills) ? manifest.skills : [];
    const skills = rawSkills.map((metadata) => normalizeMetadata(metadata));
    const validSkillIds = new Set(skills.map((skill) => skill.id));
    let skillSets = normalizeSkillSets(manifest.skillSets, validSkillIds);
    skillSets = migrateLegacyMembership(rawSkills.map((metadata) => metadata as SkillMetadata), skillSets);
    skillSets = skillSets.map((skillSet) => ({
      ...skillSet,
      skillIds: normalizeSkillSetSkillIds(skillSet.skillIds, validSkillIds)
    }));

    return { skills, skillSets };
  }

  async list(): Promise<SkillMetadata[]> {
    return (await this.readManifest()).skills;
  }

  async libraryState(): Promise<LibraryState> {
    const { skills, skillSets } = await this.readManifest();
    return { skills, skillSets, tags: knownTags(skills) };
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
      const currentState = await this.readManifest();
      const normalized = normalizeMetadata(metadata);
      const currentSkills = currentState.skills;
      const existingIndex = currentSkills.findIndex((skill) => skill.id === normalized.id);
      const nextSkills =
        existingIndex === -1
          ? [...currentSkills, normalized]
          : currentSkills.map((skill, index) => (index === existingIndex ? normalized : skill));

      await this.writeManifest(nextSkills, currentState.skillSets);
    });
  }

  async setEnabled(skillId: string, enabled: boolean): Promise<SkillMetadata> {
    return this.withWriteLock(async () => {
      const currentState = await this.readManifest();
      const currentSkills = currentState.skills;
      const existingIndex = currentSkills.findIndex((skill) => skill.id === skillId);

      if (existingIndex === -1) {
        throw new Error(`Skill not found: ${skillId}`);
      }

      const updated = { ...currentSkills[existingIndex], enabled };
      await this.writeManifest(
        currentSkills.map((skill, index) => (index === existingIndex ? updated : skill)),
        currentState.skillSets
      );
      return updated;
    });
  }

  async setTargetScope(skillId: string, targetScope: SkillTargetScope): Promise<SkillMetadata> {
    return this.withWriteLock(async () => {
      const currentState = await this.readManifest();
      const currentSkills = currentState.skills;
      const existingIndex = currentSkills.findIndex((skill) => skill.id === skillId);

      if (existingIndex === -1) {
        throw new Error(`Skill not found: ${skillId}`);
      }

      const updated = { ...currentSkills[existingIndex], targetScope };
      await this.writeManifest(
        currentSkills.map((skill, index) => (index === existingIndex ? updated : skill)),
        currentState.skillSets
      );
      return updated;
    });
  }

  async saveSkillSet(input: SaveSkillSetInput): Promise<SkillSetMetadata> {
    const normalizedName = normalizeSkillSetName(input.name);
    await fs.ensureDir(this.libraryPath);

    return this.withWriteLock(async () => {
      const currentState = await this.readManifest();
      const validSkillIds = new Set(currentState.skills.map((skill) => skill.id));
      const skillIds = normalizeSaveSkillSetSkillIds(input.skillIds, validSkillIds);
      const targets = normalizeSaveSkillSetTargets(input.targets);
      const now = new Date().toISOString();

      if (input.id) {
        const existing = currentState.skillSets.find((skillSet) => skillSet.id === input.id);
        if (!existing) throw new Error(`Skill set not found: ${input.id}`);

        const updated: SkillSetMetadata = {
          ...existing,
          name: normalizedName,
          skillIds,
          targets,
          updatedAt: now
        };
        await this.writeManifest(
          currentState.skills,
          currentState.skillSets.map((skillSet) => (skillSet.id === input.id ? updated : skillSet))
        );
        return updated;
      }

      const skillSet: SkillSetMetadata = {
        id: uniqueSkillSetId(currentState.skillSets, normalizedName),
        name: normalizedName,
        skillIds,
        targets,
        createdAt: now,
        updatedAt: now
      };

      await this.writeManifest(currentState.skills, [...currentState.skillSets, skillSet]);
      return skillSet;
    });
  }

  async setSkillMembership(skillId: string, skillSetIds: string[]): Promise<LibraryState> {
    return this.withWriteLock(async () => {
      const currentState = await this.readManifest();
      if (!currentState.skills.some((skill) => skill.id === skillId)) {
        throw new Error(`Skill not found: ${skillId}`);
      }

      const requestedSetIds = new Set(skillSetIds);
      for (const skillSetId of requestedSetIds) {
        if (!currentState.skillSets.some((skillSet) => skillSet.id === skillSetId)) {
          throw new Error(`Skill set not found: ${skillSetId}`);
        }
      }

      const now = new Date().toISOString();
      const updatedSkillSets = currentState.skillSets.map((skillSet) => {
        const shouldInclude = requestedSetIds.has(skillSet.id);
        const currentlyIncluded = skillSet.skillIds.includes(skillId);
        if (shouldInclude === currentlyIncluded) return skillSet;

        const nextSkillIds = shouldInclude
          ? [...skillSet.skillIds, skillId]
          : skillSet.skillIds.filter((id) => id !== skillId);

        return { ...skillSet, skillIds: nextSkillIds, updatedAt: now };
      });

      await this.writeManifest(currentState.skills, updatedSkillSets);
      return { skills: currentState.skills, skillSets: updatedSkillSets, tags: knownTags(currentState.skills) };
    });
  }

  async deleteSkillSet(skillSetId: string): Promise<SkillSetMetadata> {
    return this.withWriteLock(async () => {
      const currentState = await this.readManifest();
      const existing = currentState.skillSets.find((skillSet) => skillSet.id === skillSetId);
      if (!existing) throw new Error(`Skill set not found: ${skillSetId}`);

      await this.writeManifest(currentState.skills, currentState.skillSets.filter((skillSet) => skillSet.id !== skillSetId));
      return existing;
    });
  }

  async filterSkills(filter: SkillFilter): Promise<SkillMetadata[]> {
    const state = await this.libraryState();
    const filterTags = normalizeTags(filter.tags ?? []);

    return state.skills.filter((skill) => {
      if (filter.ungrouped && !isUngrouped(skill.id, state.skillSets)) return false;
      if (filter.skillSetId) {
        const skillSet = state.skillSets.find((candidate) => candidate.id === filter.skillSetId);
        if (!skillSet || !skillSet.skillIds.includes(skill.id)) return false;
      }
      return filterTags.every((tag) => skill.tags.includes(tag));
    });
  }

  async skillSetEnablement(skillSetId: string): Promise<SkillSetEnablement> {
    const state = await this.libraryState();
    const skillSet = state.skillSets.find((candidate) => candidate.id === skillSetId);
    if (!skillSet) {
      throw new Error(`Skill set not found: ${skillSetId}`);
    }

    const members = skillsInSet(skillSet, state.skills);
    if (members.length === 0 || members.every((skill) => !skill.enabled)) return "off";
    if (members.every((skill) => skill.enabled)) return "on";
    return "mixed";
  }

  async setSkillSetEnabled(skillSetId: string, enabled: boolean): Promise<SkillMetadata[]> {
    return this.withWriteLock(async () => {
      const currentState = await this.readManifest();
      const skillSet = currentState.skillSets.find((candidate) => candidate.id === skillSetId);
      if (!skillSet) {
        throw new Error(`Skill set not found: ${skillSetId}`);
      }

      const memberIds = new Set(skillSet.skillIds);
      const updatedSkills = currentState.skills.map((skill) =>
        memberIds.has(skill.id) ? { ...skill, enabled } : skill
      );
      await this.writeManifest(updatedSkills, currentState.skillSets);
      return updatedSkills.filter((skill) => memberIds.has(skill.id));
    });
  }

  async replaceSkillTags(skillId: string, tags: string[]): Promise<SkillMetadata> {
    return this.withWriteLock(async () => {
      const currentState = await this.readManifest();
      const existingSkill = currentState.skills.find((skill) => skill.id === skillId);
      if (!existingSkill) throw new Error(`Skill not found: ${skillId}`);

      const updated = { ...existingSkill, tags: normalizeTags(tags) };
      await this.writeManifest(
        currentState.skills.map((skill) => (skill.id === skillId ? updated : skill)),
        currentState.skillSets
      );
      return updated;
    });
  }

  async pruneMissing(): Promise<SkillMetadata[]> {
    return this.withWriteLock(async () => {
      const currentState = await this.readManifest();
      const currentSkills = currentState.skills;
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
        const remainingSkillIds = new Set(existingSkills.map((skill) => skill.id));
        const nextSkillSets = currentState.skillSets.map((skillSet) => ({
          ...skillSet,
          skillIds: skillSet.skillIds.filter((id) => remainingSkillIds.has(id))
        }));
        await this.writeManifest(existingSkills, nextSkillSets);
      }

      return missingSkills;
    });
  }

  async delete(skillId: string): Promise<SkillMetadata> {
    await fs.ensureDir(this.libraryPath);

    return this.withWriteLock(async () => {
      const currentState = await this.readManifest();
      const currentSkills = currentState.skills;
      const existing = currentSkills.find((skill) => skill.id === skillId);

      if (!existing) {
        throw new Error(`Skill not found: ${skillId}`);
      }

      await assertMetadataPathInsideLibrary(this.libraryPath, existing.libraryPath);
      await fs.remove(existing.libraryPath);
      await this.writeManifest(
        currentSkills.filter((skill) => skill.id !== skillId),
        removeSkillFromSets(currentState.skillSets, skillId)
      );
      return existing;
    });
  }
}
