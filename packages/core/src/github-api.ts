import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const githubHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "skiller"
};
const GH_TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const GH_TOKEN_FAILURE_CACHE_TTL_MS = 60 * 1000;
const GH_TOKEN_TIMEOUT_MS = 3000;
let cachedGhToken: { value: string | null; expiresAt: number } | undefined;
let lastGithubAuthIssue: string | undefined;

function ghExecutableCandidates(): string[] {
  const configuredPath = process.env.SKILLER_GH_PATH?.trim();
  if (configuredPath) return [configuredPath];

  return ["gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh"];
}

async function githubAuthToken(): Promise<string | undefined> {
  const envToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (envToken?.trim()) {
    lastGithubAuthIssue = undefined;
    return envToken.trim();
  }
  const now = Date.now();
  if (cachedGhToken !== undefined && cachedGhToken.expiresAt > now) return cachedGhToken.value ?? undefined;

  const missingExecutables: string[] = [];
  for (const executable of ghExecutableCandidates()) {
    try {
      const { stdout } = await execFileAsync(executable, ["auth", "token"], { timeout: GH_TOKEN_TIMEOUT_MS });
      const token = stdout.trim();
      cachedGhToken = { value: token || null, expiresAt: now + GH_TOKEN_CACHE_TTL_MS };
      lastGithubAuthIssue = token ? undefined : `GitHub CLI at ${executable} returned an empty auth token.`;
      return token || undefined;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        missingExecutables.push(executable);
        continue;
      }
      const message = String(error);
      lastGithubAuthIssue = `GitHub CLI auth failed at ${executable}: ${message}`;
      break;
    }
  }

  if (!lastGithubAuthIssue && missingExecutables.length > 0) {
    lastGithubAuthIssue = `GitHub CLI was not found at ${missingExecutables.join(", ")}.`;
  }
  cachedGhToken = { value: null, expiresAt: now + GH_TOKEN_FAILURE_CACHE_TTL_MS };
  return undefined;
}

export async function githubRequestHeaders(): Promise<Record<string, string>> {
  const token = await githubAuthToken();
  return {
    ...githubHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

export async function githubFailureDetail(response: Response): Promise<string> {
  const statusText = response.statusText || "HTTP error";
  const message = `${response.status} ${statusText}`;
  if (response.status !== 403) return message;

  let body = "";
  try {
    body = await response.clone().text();
  } catch {
    body = "";
  }

  const rateLimited =
    response.headers.get("x-ratelimit-remaining") === "0" ||
    /rate limit/i.test(statusText) ||
    /rate limit/i.test(body);
  if (!rateLimited) return message;

  const authDetail = lastGithubAuthIssue ? ` ${lastGithubAuthIssue}` : "";
  return `${message}. GitHub API rate limit exceeded.${authDetail} Authenticate with GitHub by running "gh auth status", set GITHUB_TOKEN, or set SKILLER_GH_PATH to the gh executable, then try again.`;
}
