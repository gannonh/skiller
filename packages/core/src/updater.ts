import { MetadataStore } from "./metadata-store.js";
import type { SkillMetadata, SkillSource, SkillerConfig } from "./types.js";

export interface UpdateCheckSkill {
  id: string;
  name: string;
  currentCommit?: string;
  remoteCommit?: string;
}

export interface UpdateCheckError {
  id?: string;
  message: string;
}

export interface UpdateCheckResult {
  checkedAt: string;
  considered: UpdateCheckSkill[];
  available: UpdateCheckSkill[];
  updated: UpdateCheckSkill[];
  errors: UpdateCheckError[];
}

export type RemoteCommitResolver = (
  source: SkillSource,
  metadata: SkillMetadata
) => Promise<string | null | undefined>;

export interface CheckForSkillUpdatesInput {
  libraryPath: string;
  config: SkillerConfig;
  skillId?: string;
  remoteResolver?: RemoteCommitResolver;
  now?: () => Date;
  metadataStore?: MetadataStore;
  stampLastCheckedAt?: boolean;
}

function shouldConsiderSkill(metadata: SkillMetadata, config: SkillerConfig, skillId?: string): boolean {
  if (skillId) return metadata.id === skillId || metadata.name === skillId;
  return config.keepAllSkillsUpdated || metadata.keepUpdated;
}

function toUpdateCheckSkill(metadata: SkillMetadata): UpdateCheckSkill {
  return {
    id: metadata.id,
    name: metadata.name
  };
}

function hasResolvableGithubSource(source: SkillSource): source is SkillSource & {
  type: "github";
  githubUrl: string;
  ref: string;
  commit: string;
} {
  return (
    source.type === "github" &&
    typeof source.githubUrl === "string" &&
    source.githubUrl.length > 0 &&
    typeof source.ref === "string" &&
    source.ref.length > 0 &&
    typeof source.commit === "string" &&
    source.commit.length > 0
  );
}

export async function checkForSkillUpdates(input: CheckForSkillUpdatesInput): Promise<UpdateCheckResult> {
  const checkedAt = (input.now ?? (() => new Date()))().toISOString();
  const store = input.metadataStore ?? new MetadataStore(input.libraryPath);
  const skills = await store.list();
  const selected = skills.filter((metadata) => shouldConsiderSkill(metadata, input.config, input.skillId));
  const considered = selected.map(toUpdateCheckSkill);
  const available: UpdateCheckSkill[] = [];
  const errors: UpdateCheckError[] = [];

  for (const metadata of selected) {
    if (hasResolvableGithubSource(metadata.source) && input.remoteResolver) {
      try {
        const remoteCommit = await input.remoteResolver(metadata.source, metadata);
        if (remoteCommit && remoteCommit !== metadata.source.commit) {
          available.push({
            id: metadata.id,
            name: metadata.name,
            currentCommit: metadata.source.commit,
            remoteCommit
          });
        }
      } catch (error) {
        errors.push({ id: metadata.id, message: error instanceof Error ? error.message : String(error) });
      }
    }

    if (input.stampLastCheckedAt !== false) {
      try {
        await store.save({ ...metadata, lastCheckedAt: checkedAt });
      } catch (error) {
        errors.push({ id: metadata.id, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return {
    checkedAt,
    considered,
    available,
    updated: [],
    errors
  };
}
