export interface SkillsShClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class SkillsShClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SkillsShClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://skills.sh/api").replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async search(query: string): Promise<{ skills: Array<Record<string, unknown>> }> {
    return this.get(`/search?q=${encodeURIComponent(query)}`);
  }

  async leaderboard(type: "all-time" | "trending" | "hot"): Promise<{ skills: Array<Record<string, unknown>> }> {
    return this.get(`/leaderboard?type=${encodeURIComponent(type)}`);
  }

  async skill(id: string): Promise<Record<string, unknown>> {
    return this.get(`/skills/${encodeURIComponent(id)}`);
  }

  async files(id: string): Promise<Record<string, unknown>> {
    return this.get(`/skills/${encodeURIComponent(id)}/files`);
  }

  async audit(id: string): Promise<Record<string, unknown>> {
    return this.get(`/skills/${encodeURIComponent(id)}/audit`);
  }

  private async get(path: string): Promise<any> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`);
    if (!response.ok) {
      throw new Error(`skills.sh request failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
}
