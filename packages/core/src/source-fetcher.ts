import fs from "fs-extra";
import os from "node:os";
import path from "node:path";

export interface GithubRepository {
  owner: string;
  repo: string;
}

interface GithubSourceLocation extends GithubRepository {
  githubUrl: string;
  githubPath?: string;
  ref?: string;
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

interface GithubBlob {
  entryPath: string;
  relativePath: string;
  mode?: string;
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

function decodePathSegments(pathname: string): string[] {
  return pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
}

function normalizeRepoName(repo: string): string {
  return repo.replace(/\.git$/, "");
}

function pathFromSkillFile(githubPath: string): string {
  const normalizedPath = normalizeGithubPath(githubPath);
  if (path.posix.basename(normalizedPath) !== "SKILL.md") return normalizedPath;

  const skillDir = path.posix.dirname(normalizedPath);
  return skillDir === "." ? "" : skillDir;
}

function parseGithubSourceUrl(githubUrl: string): GithubSourceLocation | null {
  let url: URL;

  try {
    url = new URL(githubUrl);
  } catch {
    return null;
  }

  const segments = decodePathSegments(url.pathname);

  if (url.hostname === "github.com") {
    if (segments.length < 2) return null;

    const owner = segments[0]!;
    const repo = normalizeRepoName(segments[1]!);
    const baseUrl = `https://github.com/${owner}/${repo}`;
    const kind = segments[2];

    if ((kind === "tree" || kind === "blob") && segments.length >= 4) {
      const ref = segments[3]!;
      const githubPath = kind === "blob" ? pathFromSkillFile(segments.slice(4).join("/")) : normalizeGithubPath(segments.slice(4).join("/"));

      return {
        owner,
        repo,
        githubUrl: baseUrl,
        ref,
        ...(githubPath ? { githubPath } : {})
      };
    }

    return { owner, repo, githubUrl: baseUrl };
  }

  if (url.hostname === "raw.githubusercontent.com") {
    if (segments.length < 4) return null;

    const owner = segments[0]!;
    const repo = normalizeRepoName(segments[1]!);
    const ref = segments[2]!;
    const githubPath = pathFromSkillFile(segments.slice(3).join("/"));

    return {
      owner,
      repo,
      githubUrl: `https://github.com/${owner}/${repo}`,
      ref,
      ...(githubPath ? { githubPath } : {})
    };
  }

  return null;
}

function entryRelativePath(entryPath: string, githubPath: string): string | null {
  if (!githubPath) return entryPath;
  if (entryPath === githubPath) return "";
  if (!entryPath.startsWith(`${githubPath}/`)) return null;
  return entryPath.slice(githubPath.length + 1);
}

function encodeEntryPath(entryPath: string): string {
  return entryPath.split("/").map(encodeURIComponent).join("/");
}

function skillMarkdownPath(githubPath: string): string {
  return githubPath ? `${githubPath}/SKILL.md` : "SKILL.md";
}

function hasSkillMarkdown(entries: GithubTreeEntry[], githubPath: string): boolean {
  const expectedPath = skillMarkdownPath(githubPath);
  return entries.some((entry) => entry.type === "blob" && entry.path === expectedPath);
}

function basenameForGithubPath(githubPath: string): string {
  const segments = githubPath.split("/").filter(Boolean);
  return segments.at(-1) ?? githubPath;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function resolveGithubPath(entries: GithubTreeEntry[], githubPath: string): string {
  if (!githubPath || hasSkillMarkdown(entries, githubPath)) return githubPath;

  const basename = basenameForGithubPath(githubPath);
  const candidates = dedupe([
    `skills/${githubPath}`,
    `skills/.curated/${basename}`,
    `skills/.system/${basename}`,
    `skill-data/${basename}`
  ]);
  const matchedCandidate = candidates.find((candidate) => hasSkillMarkdown(entries, candidate));
  if (matchedCandidate) return matchedCandidate;

  const matchingSkillPaths = entries.flatMap((entry) => {
    if (entry.type !== "blob" || typeof entry.path !== "string" || !entry.path.endsWith("/SKILL.md")) return [];
    const parentPath = entry.path.slice(0, -"/SKILL.md".length);
    return basenameForGithubPath(parentPath) === basename ? [parentPath] : [];
  });

  return matchingSkillPaths.length === 1 ? matchingSkillPaths[0] : githubPath;
}

async function readJson(fetchImpl: FetchImpl, url: string, context: string): Promise<unknown> {
  const response = await fetchImpl(url, { headers: githubHeaders });
  if (!response.ok) {
    throw new Error(`${context} failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export function parseGithubRepository(githubUrl: string): GithubRepository | null {
  const source = parseGithubSourceUrl(githubUrl);
  if (!source) return null;

  return { owner: source.owner, repo: source.repo };
}

export function extractRegistrySkillSource(payload: Record<string, unknown>): RegistrySkillSource {
  const skillsShId = firstStringField(payload, ["id", "skillId", "slug", "name"]);
  if (!skillsShId) {
    throw new Error("skills.sh payload is missing an id");
  }

  const source = firstStringField(payload, ["source"]);
  const githubUrl =
    firstStringField(payload, ["githubUrl", "github_url", "repositoryUrl", "repoUrl", "sourceUrl"]) ??
    (source ? githubUrlFromRegistrySource(source) : undefined);
  if (!githubUrl) {
    throw new Error("skills.sh payload is missing a GitHub URL");
  }

  const githubPath =
    firstStringField(payload, ["githubPath", "github_path", "path", "skillPath", "directory"]) ??
    (source ? githubPathFromRegistrySource(payload, source) : undefined);
  const ref = firstStringField(payload, ["ref", "branch", "tag"]);

  return {
    skillsShId,
    githubUrl,
    ...(githubPath ? { githubPath } : {}),
    ...(ref ? { ref } : {})
  };
}

function githubUrlFromRegistrySource(source: string): string | undefined {
  if (/^https?:\/\/github\.com\/[^/]+\/[^/]+/.test(source)) return source;
  if (/^[^/\s]+\/[^/\s]+$/.test(source)) return `https://github.com/${source}`;
  return undefined;
}

function githubPathFromRegistrySource(payload: Record<string, unknown>, source: string): string | undefined {
  const id = stringField(payload, "id");
  if (id?.startsWith(`${source}/`)) {
    const path = id.slice(source.length + 1);
    return path.length > 0 ? path : undefined;
  }

  return stringField(payload, "skillId") ?? stringField(payload, "name");
}

export async function fetchGithubSkillSource(input: FetchGithubSkillSourceInput): Promise<FetchedGithubSkillSource> {
  const source = parseGithubSourceUrl(input.githubUrl);
  if (!source) {
    throw new Error("Invalid GitHub repository URL");
  }

  const repository = { owner: source.owner, repo: source.repo };
  const fetchImpl = input.fetchImpl ?? fetch;
  const ref = input.ref ?? source.ref ?? "HEAD";
  const githubPath = normalizeGithubPath(input.githubPath ?? source.githubPath);
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
  const resolvedGithubPath = resolveGithubPath(entries, githubPath);
  const blobs: GithubBlob[] = [];

  for (const entry of entries) {
    if (entry.type !== "blob" || typeof entry.path !== "string") continue;

    const relativePath = entryRelativePath(entry.path, resolvedGithubPath);
    if (relativePath === null) continue;

    blobs.push({
      entryPath: entry.path,
      relativePath,
      ...(typeof entry.mode === "string" ? { mode: entry.mode } : {})
    });
  }

  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-source-"));
  const sourcePath = path.join(rootPath, "source");

  try {
    if (!blobs.some((blob) => blob.relativePath === "SKILL.md")) {
      throw new Error("GitHub source does not contain SKILL.md");
    }

    for (const blob of blobs) {
      if (!blob.relativePath) continue;

      const rawUrl = `https://raw.githubusercontent.com/${repository.owner}/${repository.repo}/${commit}/${encodeEntryPath(
        blob.entryPath
      )}`;
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
        githubUrl: source.githubUrl,
        ...(resolvedGithubPath ? { githubPath: resolvedGithubPath } : {}),
        ref,
        commit
      }
    };
  } catch (error) {
    await fs.remove(rootPath);
    throw error;
  }
}
