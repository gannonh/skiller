import { describe, expect, it, vi } from "vitest";
import { SkillsShClient } from "./skills-sh-client.js";

describe("SkillsShClient", () => {
  it("searches skills", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "one", name: "One" }] })));
    const client = new SkillsShClient({ fetchImpl });

    const result = await client.search("git");

    expect(fetchImpl).toHaveBeenCalledWith("https://skills.sh/api/v1/skills/search?q=git");
    expect(result.skills[0]?.id).toBe("one");
  });

  it("loads leaderboard", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [] })));
    const client = new SkillsShClient({ fetchImpl });

    await client.leaderboard("trending");

    expect(fetchImpl).toHaveBeenCalledWith("https://skills.sh/api/v1/skills?view=trending");
  });

  it("falls back to the public search endpoint when v1 requires authentication", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 401, statusText: "Unauthorized" }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ skills: [{ id: "one" }] })));
    const client = new SkillsShClient({ fetchImpl });

    const result = await client.search("git");

    expect(fetchImpl).toHaveBeenNthCalledWith(1, "https://skills.sh/api/v1/skills/search?q=git");
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "https://skills.sh/api/search?q=git");
    expect(result.skills[0]?.id).toBe("one");
  });

  it("falls back to leaderboard page data when v1 requires authentication", async () => {
    const html = '<script>self.__next_f.push([1,"47:[{\\"initialSkills\\":[{\\"id\\":\\"one\\",\\"name\\":\\"One\\"}],\\"totalSkills\\":1}]"])</script>';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 401, statusText: "Unauthorized" }))
      .mockResolvedValueOnce(new Response(html));
    const client = new SkillsShClient({ fetchImpl });

    const result = await client.leaderboard("trending");

    expect(fetchImpl).toHaveBeenNthCalledWith(1, "https://skills.sh/api/v1/skills?view=trending");
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "https://skills.sh/trending");
    expect(result.skills[0]?.name).toBe("One");
  });

  it("passes an API key when configured", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [] })));
    const client = new SkillsShClient({ apiKey: "sk_live_test", fetchImpl });

    await client.leaderboard("hot");

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://skills.sh/api/v1/skills?view=hot",
      { headers: { Authorization: "Bearer sk_live_test" } }
    );
  });

  it("uses custom base URLs with trailing slashes", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [] })));
    const client = new SkillsShClient({ baseUrl: "https://example.test/api/v1/", fetchImpl });

    await client.search("git");

    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/v1/skills/search?q=git");
  });

  it("encodes search query values", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [] })));
    const client = new SkillsShClient({ fetchImpl });

    await client.search("git tools");

    expect(fetchImpl).toHaveBeenCalledWith("https://skills.sh/api/v1/skills/search?q=git%20tools");
  });

  it("loads skill endpoints with encoded ids", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "one" })));
    const client = new SkillsShClient({ fetchImpl });

    await client.skill("team/skill #1");
    await client.files("team/skill #1");
    await client.audit("team/skill #1");

    expect(fetchImpl).toHaveBeenNthCalledWith(1, "https://skills.sh/api/v1/skills/team/skill%20%231");
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "https://skills.sh/api/v1/skills/team/skill%20%231");
    expect(fetchImpl).toHaveBeenNthCalledWith(3, "https://skills.sh/api/v1/skills/audit/team/skill%20%231");
  });

  it("throws status context for non-ok responses", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503, statusText: "Service Unavailable" }));
    const client = new SkillsShClient({ fetchImpl });

    await expect(client.search("git")).rejects.toThrow("skills.sh request failed: 503 Service Unavailable");
  });
});
