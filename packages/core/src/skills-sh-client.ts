export interface SkillsShClientOptions {
  baseUrl?: string;
  siteUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export class SkillsShClient {
  private readonly baseUrl: string;
  private readonly siteUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SkillsShClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://skills.sh/api/v1").replace(/\/+$/, "");
    this.siteUrl = (options.siteUrl ?? "https://skills.sh").replace(/\/+$/, "");
    this.apiKey = options.apiKey ?? process.env.SKILLS_SH_API_KEY;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async search(query: string): Promise<{ skills: Array<Record<string, unknown>> }> {
    try {
      return await this.getSkillList(`/skills/search?q=${encodeURIComponent(query)}`);
    } catch (error) {
      if (!isFallbackStatus(error)) throw error;
      return this.getLegacySkillList(`/api/search?q=${encodeURIComponent(query)}`);
    }
  }

  async leaderboard(type: "all-time" | "trending" | "hot"): Promise<{ skills: Array<Record<string, unknown>> }> {
    try {
      return await this.getSkillList(`/skills?view=${encodeURIComponent(type)}`);
    } catch (error) {
      if (!isFallbackStatus(error)) throw error;
      return this.getLeaderboardPage(type);
    }
  }

  async skill(id: string): Promise<Record<string, unknown>> {
    try {
      return await this.get(`/skills/${encodeSkillId(id)}`);
    } catch (error) {
      if (!isFallbackStatus(error)) throw error;
      return this.findPublicSkill(id);
    }
  }

  async files(id: string): Promise<Record<string, unknown>> {
    return this.skill(id);
  }

  async audit(id: string): Promise<Record<string, unknown>> {
    return this.get(`/skills/audit/${encodeSkillId(id)}`);
  }

  private async get(path: string): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}${path}`;
    const response = this.apiKey
      ? await this.fetchImpl(url, { headers: { Authorization: `Bearer ${this.apiKey}` } })
      : await this.fetchImpl(url);
    if (!response.ok) {
      throw new SkillsShRequestError(response.status, response.statusText);
    }
    return response.json();
  }

  private async getText(url: string): Promise<string> {
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new SkillsShRequestError(response.status, response.statusText);
    }
    return response.text();
  }

  private async getSkillList(path: string): Promise<{ skills: Array<Record<string, unknown>> }> {
    const payload = await this.get(path);
    if (Array.isArray(payload.data)) return { skills: payload.data };
    if (Array.isArray(payload.skills)) return { skills: payload.skills };
    return { skills: [] };
  }

  private async getLegacySkillList(path: string): Promise<{ skills: Array<Record<string, unknown>> }> {
    const payload = await this.getText(`${this.siteUrl}${path}`);
    const parsed = JSON.parse(payload) as { skills?: unknown };
    return { skills: Array.isArray(parsed.skills) ? parsed.skills as Array<Record<string, unknown>> : [] };
  }

  private async getLeaderboardPage(type: "all-time" | "trending" | "hot"): Promise<{ skills: Array<Record<string, unknown>> }> {
    const pagePath = type === "all-time" ? "/" : `/${type}`;
    const html = await this.getText(`${this.siteUrl}${pagePath}`);
    const skills = extractInitialSkills(html);
    return { skills };
  }

  private async findPublicSkill(id: string): Promise<Record<string, unknown>> {
    const exact = await this.findPublicSkillFromQuery(id, id);
    if (exact) return exact;

    const lastSegment = id.split("/").filter(Boolean).at(-1);
    if (lastSegment && lastSegment !== id) {
      const fallback = await this.findPublicSkillFromQuery(lastSegment, id);
      if (fallback) return fallback;
    }

    throw new SkillsShRequestError(404, "Not Found");
  }

  private async findPublicSkillFromQuery(query: string, id: string): Promise<Record<string, unknown> | null> {
    const { skills } = await this.getLegacySkillList(`/api/search?q=${encodeURIComponent(query)}`);
    const normalizedId = id.toLowerCase();
    const normalizedLastSegment = id.split("/").filter(Boolean).at(-1)?.toLowerCase();

    const match =
      skills.find((skill) => stringValue(skill, "id")?.toLowerCase() === normalizedId) ??
      skills.find((skill) => stringValue(skill, "skillId")?.toLowerCase() === normalizedId) ??
      skills.find((skill) => stringValue(skill, "name")?.toLowerCase() === normalizedId) ??
      skills.find((skill) => normalizedLastSegment && stringValue(skill, "skillId")?.toLowerCase() === normalizedLastSegment) ??
      null;

    return match ? enrichPublicSkillSource(match) : null;
  }
}

function encodeSkillId(id: string): string {
  return id.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

class SkillsShRequestError extends Error {
  constructor(readonly status: number, statusText: string) {
    super(`skills.sh request failed: ${status} ${statusText}`);
  }
}

function isFallbackStatus(error: unknown): boolean {
  return error instanceof SkillsShRequestError && (error.status === 401 || error.status === 404);
}

function extractInitialSkills(html: string): Array<Record<string, unknown>> {
  const marker = '\\"initialSkills\\":';
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return [];

  const start = html.indexOf("[", markerIndex + marker.length);
  if (start === -1) return [];

  let depth = 0;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (char === "[") depth += 1;
    if (char === "]") depth -= 1;
    if (depth === 0) {
      const escapedJson = html.slice(start, index + 1);
      return JSON.parse(escapedJson.replace(/\\"/g, '"')) as Array<Record<string, unknown>>;
    }
  }

  return [];
}

function stringValue(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function githubUrlFromPublicSource(source: string): string | undefined {
  if (/^https?:\/\/github\.com\/[^/]+\/[^/]+/.test(source)) return source;
  if (/^[^/\s]+\/[^/\s]+$/.test(source)) return `https://github.com/${source}`;
  return undefined;
}

function githubPathFromPublicSkill(skill: Record<string, unknown>, source: string): string | undefined {
  const id = stringValue(skill, "id");
  if (id?.startsWith(`${source}/`)) {
    const path = id.slice(source.length + 1);
    return path.length > 0 ? path : undefined;
  }

  return stringValue(skill, "skillId") ?? stringValue(skill, "name");
}

function enrichPublicSkillSource(skill: Record<string, unknown>): Record<string, unknown> {
  const source = stringValue(skill, "source");
  if (!source) return skill;

  const githubUrl = githubUrlFromPublicSource(source);
  if (!githubUrl) return skill;

  const githubPath = githubPathFromPublicSkill(skill, source);
  return {
    ...skill,
    githubUrl,
    ...(githubPath ? { githubPath } : {})
  };
}
