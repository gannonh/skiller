import { describe, expect, it, vi } from "vitest";
import { SkillsShClient } from "./skills-sh-client.js";

describe("SkillsShClient", () => {
  it("searches skills", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ skills: [{ id: "one", name: "One" }] })));
    const client = new SkillsShClient({ fetchImpl });

    const result = await client.search("git");

    expect(fetchImpl).toHaveBeenCalledWith("https://skills.sh/api/search?q=git");
    expect(result.skills[0]?.id).toBe("one");
  });

  it("loads leaderboard", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ skills: [] })));
    const client = new SkillsShClient({ fetchImpl });

    await client.leaderboard("trending");

    expect(fetchImpl).toHaveBeenCalledWith("https://skills.sh/api/leaderboard?type=trending");
  });

  it("uses custom base URLs with trailing slashes", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ skills: [] })));
    const client = new SkillsShClient({ baseUrl: "https://example.test/api/", fetchImpl });

    await client.search("git");

    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/api/search?q=git");
  });

  it("encodes search query values", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ skills: [] })));
    const client = new SkillsShClient({ fetchImpl });

    await client.search("git tools");

    expect(fetchImpl).toHaveBeenCalledWith("https://skills.sh/api/search?q=git%20tools");
  });

  it("loads skill endpoints with encoded ids", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "one" })));
    const client = new SkillsShClient({ fetchImpl });

    await client.skill("team/skill #1");
    await client.files("team/skill #1");
    await client.audit("team/skill #1");

    expect(fetchImpl).toHaveBeenNthCalledWith(1, "https://skills.sh/api/skills/team%2Fskill%20%231");
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "https://skills.sh/api/skills/team%2Fskill%20%231/files");
    expect(fetchImpl).toHaveBeenNthCalledWith(3, "https://skills.sh/api/skills/team%2Fskill%20%231/audit");
  });

  it("throws status context for non-ok responses", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503, statusText: "Service Unavailable" }));
    const client = new SkillsShClient({ fetchImpl });

    await expect(client.search("git")).rejects.toThrow("skills.sh request failed: 503 Service Unavailable");
  });
});
