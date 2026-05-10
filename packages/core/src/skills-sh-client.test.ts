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

  it("accepts skill arrays from the skills payload property", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ skills: [{ id: "one" }] })));
    const client = new SkillsShClient({ fetchImpl });

    const result = await client.leaderboard("hot");

    expect(result.skills).toEqual([{ id: "one" }]);
  });

  it("returns an empty list when the skill list payload has no array", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    const client = new SkillsShClient({ fetchImpl });

    const result = await client.search("git");

    expect(result.skills).toEqual([]);
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

  it("uses the skills.sh homepage for all-time leaderboard fallback", async () => {
    const html = '<script>self.__next_f.push([1,"47:[{\\"initialSkills\\":[{\\"id\\":\\"one\\"}]}]"])</script>';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 404, statusText: "Not Found" }))
      .mockResolvedValueOnce(new Response(html));
    const client = new SkillsShClient({ fetchImpl });

    await expect(client.leaderboard("all-time")).resolves.toEqual({ skills: [{ id: "one" }] });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "https://skills.sh/");
  });

  it("returns no fallback page skills when embedded data is absent or incomplete", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 401, statusText: "Unauthorized" }))
      .mockResolvedValueOnce(new Response("<html></html>"))
      .mockResolvedValueOnce(new Response("nope", { status: 401, statusText: "Unauthorized" }))
      .mockResolvedValueOnce(new Response('<script>self.__next_f.push([1,"\\"initialSkills\\":{}"])</script>'))
      .mockResolvedValueOnce(new Response("nope", { status: 401, statusText: "Unauthorized" }))
      .mockResolvedValueOnce(new Response('<script>self.__next_f.push([1,"\\"initialSkills\\":[{\\"id\\":\\"one\\"}"))</script>'));
    const client = new SkillsShClient({ fetchImpl });

    await expect(client.leaderboard("trending")).resolves.toEqual({ skills: [] });
    await expect(client.leaderboard("trending")).resolves.toEqual({ skills: [] });
    await expect(client.leaderboard("trending")).resolves.toEqual({ skills: [] });
  });

  it("returns an empty legacy search list when the public endpoint has no skills array", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 404, statusText: "Not Found" }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    const client = new SkillsShClient({ fetchImpl });

    const result = await client.search("git");

    expect(result.skills).toEqual([]);
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

  it("uses global fetch when no fetch implementation is provided", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "one" })));
    vi.stubGlobal("fetch", fetchImpl);
    const client = new SkillsShClient();

    await expect(client.skill("one")).resolves.toEqual({ id: "one" });
    expect(fetchImpl).toHaveBeenCalledWith("https://skills.sh/api/v1/skills/one");
  });

  it("throws status context for non-ok responses", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503, statusText: "Service Unavailable" }));
    const client = new SkillsShClient({ fetchImpl });

    await expect(client.search("git")).rejects.toThrow("skills.sh request failed: 503 Service Unavailable");
  });

  it("throws non-fallback leaderboard errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503, statusText: "Service Unavailable" }));
    const client = new SkillsShClient({ fetchImpl });

    await expect(client.leaderboard("trending")).rejects.toThrow("skills.sh request failed: 503 Service Unavailable");
  });

  it("throws status context for non-ok fallback page responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 401, statusText: "Unauthorized" }))
      .mockResolvedValueOnce(new Response("nope", { status: 503, statusText: "Service Unavailable" }));
    const client = new SkillsShClient({ fetchImpl });

    await expect(client.leaderboard("hot")).rejects.toThrow("skills.sh request failed: 503 Service Unavailable");
  });
});
