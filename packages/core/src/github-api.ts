import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const githubHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "skiller"
};
const GH_TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const GH_TOKEN_FAILURE_CACHE_TTL_MS = 60 * 1000;
let cachedGhToken: { value: string | null; expiresAt: number } | undefined;

async function githubAuthToken(): Promise<string | undefined> {
  const envToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (envToken?.trim()) return envToken.trim();
  const now = Date.now();
  if (cachedGhToken !== undefined && cachedGhToken.expiresAt > now) return cachedGhToken.value ?? undefined;

  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"], { timeout: 1000 });
    const token = stdout.trim();
    cachedGhToken = { value: token || null, expiresAt: now + GH_TOKEN_CACHE_TTL_MS };
    return token || undefined;
  } catch {
    cachedGhToken = { value: null, expiresAt: now + GH_TOKEN_FAILURE_CACHE_TTL_MS };
    return undefined;
  }
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

  return `${message}. GitHub API rate limit exceeded. Make sure you are authenticated with GitHub by running "gh auth status" or set GITHUB_TOKEN, then try again.`;
}
