import fs from "fs-extra";
import os from "node:os";
import path from "node:path";

export interface GithubRepository {
  owner: string;
  repo: string;
}

export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchGithubSkillSourceInput {
  githubUrl: string;
  githubPath?: string;
  ref?: string;
  fetchImpl?: typeof fetch;
}

export interface FetchedGithubSkillSource {
  rootPath: string;
  sourcePath: string;
  resolved: {
    githubUrl: string;
    githubPath?: string;
    ref: string;
    commit: string;
  };
}

export interface RegistrySkillSource {
  skillsShId: string;
  githubUrl: string;
  githubPath?: string;
  ref?: string;
}

interface GithubCommitPayload {
  sha?: unknown;
}

interface GithubTreeEntry {
  mode?: unknown;
  path?: unknown;
  type?: unknown;
}

interface GithubTreePayload {
  tree?: unknown;
}

const githubHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "skiller"
};

function stringField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function firstStringField(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringField(payload, key);
    if (value) return value;
  }

  return undefined;
}

function normalizeGithubPath(githubPath?: string): string {
  return githubPath?.replace(/^\/+|\/+$/g, "") ?? "";
}

function entryRelativePath(entryPath: string, githubPath: string): string | null {
  if (!githubPath) return entryPath;
  if (entryPath === githubPath) return "";
  if (!entryPath.startsWith(`${githubPath}/`)) return null;
  return entryPath.slice(githubPath.length + 1);
}

async function readJson(fetchImpl: FetchImpl, url: string, context: string): Promise<unknown> {
  const response = await fetchImpl(url, { headers: githubHeaders });
  if (!response.ok) {
    throw new Error(`${context} failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export function parseGithubRepository(githubUrl: string): GithubRepository | null {
  const match = githubUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?].*)?$/);
  if (!match) return null;

  return { owner: match[1], repo: match[2] };
}

export function extractRegistrySkillSource(payload: Record<string, unknown>): RegistrySkillSource {
  const skillsShId = firstStringField(payload, ["id", "slug", "name"]);
  if (!skillsShId) {
    throw new Error("skills.sh payload is missing an id");
  }

  const githubUrl = firstStringField(payload, ["githubUrl", "github_url", "repositoryUrl", "repoUrl", "sourceUrl"]);
  if (!githubUrl) {
    throw new Error("skills.sh payload is missing a GitHub URL");
  }

  const githubPath = firstStringField(payload, ["githubPath", "github_path", "path", "skillPath", "directory"]);
  const ref = firstStringField(payload, ["ref", "branch", "tag"]);

  return {
    skillsShId,
    githubUrl,
    ...(githubPath ? { githubPath } : {}),
    ...(ref ? { ref } : {})
  };
}

export async function fetchGithubSkillSource(input: FetchGithubSkillSourceInput): Promise<FetchedGithubSkillSource> {
  const repository = parseGithubRepository(input.githubUrl);
  if (!repository) {
    throw new Error("Invalid GitHub repository URL");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const ref = input.ref ?? "HEAD";
  const githubPath = normalizeGithubPath(input.githubPath);
  const commitUrl = `https://api.github.com/repos/${repository.owner}/${repository.repo}/commits/${encodeURIComponent(ref)}`;
  const commitPayload = (await readJson(fetchImpl, commitUrl, "GitHub commit lookup")) as GithubCommitPayload;
  if (typeof commitPayload.sha !== "string" || commitPayload.sha.length === 0) {
    throw new Error("GitHub commit lookup did not return a commit sha");
  }

  const commit = commitPayload.sha;
  const treeUrl = `https://api.github.com/repos/${repository.owner}/${repository.repo}/git/trees/${encodeURIComponent(
    commit
  )}?recursive=1`;
  const treePayload = (await readJson(fetchImpl, treeUrl, "GitHub tree lookup")) as GithubTreePayload;
  const entries = Array.isArray(treePayload.tree) ? (treePayload.tree as GithubTreeEntry[]) : [];
  const blobs = entries
    .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
    .map((entry) => ({
      entryPath: entry.path as string,
      mode: typeof entry.mode === "string" ? entry.mode : undefined
    }))
    .map((entry) => ({ ...entry, relativePath: entryRelativePath(entry.entryPath, githubPath) }))
    .filter(
      (entry): entry is { entryPath: string; mode?: string; relativePath: string } => entry.relativePath !== null
    );

  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-source-"));
  const sourcePath = path.join(rootPath, "source");

  try {
    if (!blobs.some((blob) => blob.relativePath === "SKILL.md")) {
      throw new Error("GitHub source does not contain SKILL.md");
    }

    for (const blob of blobs) {
      if (!blob.relativePath) continue;

      const rawUrl = `https://raw.githubusercontent.com/${repository.owner}/${repository.repo}/${commit}/${blob.entryPath}`;
      const response = await fetchImpl(rawUrl, { headers: githubHeaders });
      if (!response.ok) {
        throw new Error(`GitHub blob fetch failed: ${response.status} ${response.statusText}`);
      }

      const destination = path.join(sourcePath, blob.relativePath);
      if (!destination.startsWith(`${sourcePath}${path.sep}`) && destination !== sourcePath) {
        throw new Error("GitHub source contains an invalid path");
      }

      await fs.ensureDir(path.dirname(destination));
      await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
      if (blob.mode === "100755") {
        await fs.chmod(destination, 0o755);
      }
    }

    return {
      rootPath,
      sourcePath,
      resolved: {
        githubUrl: input.githubUrl,
        ...(githubPath ? { githubPath } : {}),
        ref,
        commit
      }
    };
  } catch (error) {
    await fs.remove(rootPath);
    throw error;
  }
}
