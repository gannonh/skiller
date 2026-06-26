import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkLibraryHealth, repairLibrary } from "./library-health.js";
import * as fileOps from "./file-ops.js";
import * as installer from "./installer.js";
import { MetadataStore } from "./metadata-store.js";
import type { SkillMetadata, SkillSource } from "./types.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-health-"));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await fs.remove(tmp);
});

function mockFetch(handler: (url: string) => Promise<Response> | Response): typeof fetch {
  return vi.fn(async (input: Parameters<typeof fetch>[0]) => handler(String(input))) as unknown as typeof fetch;
}

async function seedSkill(
  library: string,
  id: string,
  options: {
    source?: SkillSource;
    writeSkillMd?: boolean | string;
    contentHash?: string;
  } = {}
): Promise<SkillMetadata> {
  const libraryPath = path.join(library, id);
  await fs.ensureDir(libraryPath);
  if (options.writeSkillMd !== false) {
    const body =
      typeof options.writeSkillMd === "string"
        ? options.writeSkillMd
        : `---\nname: ${id}\ndescription: ${id} skill.\n---\n`;
    await fs.writeFile(path.join(libraryPath, "SKILL.md"), body);
  }
  const metadata: SkillMetadata = {
    id,
    name: id,
    libraryPath,
    source: options.source ?? { type: "github", githubUrl: "https://github.com/example/skills", githubPath: id, ref: "HEAD", commit: "old" },
    installedAt: "2026-05-12T00:00:00.000Z",
    keepUpdated: false,
    enabled: true,
    tags: [],
    validation: { valid: true, issues: [] },
    ...(options.contentHash ? { contentHash: options.contentHash } : {})
  };
  await new MetadataStore(library).save(metadata);
  return metadata;
}

describe("checkLibraryHealth", () => {
  it("rejects relative library paths", async () => {
    await expect(checkLibraryHealth({ libraryPath: "relative" })).rejects.toThrow(
      "Library path must be absolute before checking library health"
    );
  });

  it("reports healthy skills and flags missing, empty, invalid, and mismatched copies", async () => {
    const library = path.join(tmp, "library");

    // Healthy.
    await seedSkill(library, "healthy");
    // Empty folder (no SKILL.md) - the reported real-world case.
    await seedSkill(library, "empty", { writeSkillMd: false });
    // Invalid SKILL.md (no frontmatter name).
    await seedSkill(library, "broken", { writeSkillMd: "no frontmatter at all" });
    // Missing folder entirely.
    const missing = await seedSkill(library, "gone");
    await fs.remove(missing.libraryPath);
    // Hash mismatch: record a contentHash that will not match.
    await seedSkill(library, "drifted", { contentHash: "deadbeef" });

    const report = await checkLibraryHealth({ libraryPath: library });

    expect(report.healthy).toBe(1);
    const byId = Object.fromEntries(report.issues.map((issue) => [issue.id, issue.reason]));
    expect(byId).toEqual({
      empty: "empty-folder",
      broken: "invalid",
      gone: "missing-folder",
      drifted: "hash-mismatch"
    });
    // All seeded with github sources, so all are refetchable.
    expect(report.issues.every((issue) => issue.refetchable)).toBe(true);
  });

  it("does not flag hash mismatch when checkContentHash is disabled", async () => {
    const library = path.join(tmp, "library");
    await seedSkill(library, "drifted", { contentHash: "deadbeef" });

    const report = await checkLibraryHealth({ libraryPath: library, checkContentHash: false });

    expect(report.healthy).toBe(1);
    expect(report.issues).toEqual([]);
  });

  it("treats an unhashable directory as a content mismatch", async () => {
    const library = path.join(tmp, "library");
    await seedSkill(library, "drifted", { contentHash: "abc" });
    // Force hashDirectory to fail even though the folder/SKILL.md are valid.
    const spy = vi.spyOn(fileOps, "hashDirectory").mockRejectedValueOnce(new Error("hash boom"));

    const report = await checkLibraryHealth({ libraryPath: library });

    expect(report.issues).toEqual([
      { id: "drifted", name: "drifted", reason: "hash-mismatch", refetchable: true }
    ]);
    spy.mockRestore();
  });

  it("never flags hash mismatch for skills without a recorded hash", async () => {
    const library = path.join(tmp, "library");
    await seedSkill(library, "no-hash");

    const report = await checkLibraryHealth({ libraryPath: library });

    expect(report.healthy).toBe(1);
    expect(report.issues).toEqual([]);
  });

  it("marks local and unknown sources as not refetchable", async () => {
    const library = path.join(tmp, "library");
    await seedSkill(library, "local-empty", {
      writeSkillMd: false,
      source: { type: "local", path: "/somewhere/local-empty" }
    });
    await seedSkill(library, "unknown-empty", {
      writeSkillMd: false,
      source: { type: "unknown" }
    });

    const report = await checkLibraryHealth({ libraryPath: library });

    expect(report.issues.map((issue) => [issue.id, issue.refetchable])).toEqual([
      ["local-empty", false],
      ["unknown-empty", false]
    ]);
  });
});

describe("repairLibrary", () => {
  it("rejects relative library paths", async () => {
    await expect(repairLibrary({ libraryPath: "relative" })).rejects.toThrow(
      "Library path must be absolute before repairing the library"
    );
  });

  it("re-fetches empty skills from their github source", async () => {
    const library = path.join(tmp, "library");
    // An empty folder for a github-backed skill.
    await seedSkill(library, "browser", {
      writeSkillMd: false,
      source: { type: "github", githubUrl: "https://github.com/example/skills", githubPath: "browser", ref: "HEAD", commit: "old" }
    });

    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "new123" }));
      }
      if (url === "https://api.github.com/repos/example/skills/git/trees/new123?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "browser/SKILL.md", type: "blob" }] }));
      }
      if (url === "https://raw.githubusercontent.com/example/skills/new123/browser/SKILL.md") {
        return new Response("---\nname: browser\ndescription: Restored.\n---\n");
      }
      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const report = await repairLibrary({ libraryPath: library, fetchImpl });

    expect(report.repaired).toEqual([{ id: "browser", reason: "empty-folder", status: "repaired" }]);
    expect(report.skipped).toEqual([]);
    expect(report.errors).toEqual([]);
    await expect(fs.readFile(path.join(library, "browser", "SKILL.md"), "utf8")).resolves.toContain("Restored.");
    // Metadata commit advanced to the freshly fetched commit.
    const saved = (await new MetadataStore(library).list()).find((skill) => skill.id === "browser");
    expect(saved?.source).toMatchObject({ type: "github", commit: "new123" });
  });

  it("skips non-refetchable sources and leaves them untouched", async () => {
    const library = path.join(tmp, "library");
    await seedSkill(library, "local-empty", {
      writeSkillMd: false,
      source: { type: "local", path: "/gone/local-empty" }
    });

    const report = await repairLibrary({ libraryPath: library, fetchImpl: mockFetch(() => new Response("x")) });

    expect(report.repaired).toEqual([]);
    expect(report.skipped).toEqual([
      { id: "local-empty", reason: "empty-folder", status: "skipped", message: "Skill source cannot be re-fetched automatically" }
    ]);
    expect(report.errors).toEqual([]);
  });

  it("records errors when a re-fetch fails", async () => {
    const library = path.join(tmp, "library");
    await seedSkill(library, "browser", {
      writeSkillMd: false,
      source: { type: "github", githubUrl: "https://github.com/example/skills", githubPath: "browser", ref: "HEAD", commit: "old" }
    });

    // Fetch always 404s, so the re-fetch throws.
    const fetchImpl = mockFetch(() => new Response("missing", { status: 404, statusText: "Not Found" }));

    const report = await repairLibrary({ libraryPath: library, fetchImpl });

    expect(report.repaired).toEqual([]);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatchObject({ id: "browser", reason: "empty-folder", status: "error" });
    expect(report.errors[0]!.message).toBeTruthy();
  });

  it("restricts repair to the requested skill ids", async () => {
    const library = path.join(tmp, "library");
    await seedSkill(library, "one", {
      writeSkillMd: false,
      source: { type: "github", githubUrl: "https://github.com/example/skills", githubPath: "one", ref: "HEAD", commit: "old" }
    });
    await seedSkill(library, "two", {
      writeSkillMd: false,
      source: { type: "github", githubUrl: "https://github.com/example/skills", githubPath: "two", ref: "HEAD", commit: "old" }
    });

    const fetchImpl = mockFetch((url) => {
      if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
        return new Response(JSON.stringify({ sha: "c1" }));
      }
      if (url === "https://api.github.com/repos/example/skills/git/trees/c1?recursive=1") {
        return new Response(JSON.stringify({ tree: [{ path: "one/SKILL.md", type: "blob" }] }));
      }
      if (url === "https://raw.githubusercontent.com/example/skills/c1/one/SKILL.md") {
        return new Response("---\nname: one\ndescription: One.\n---\n");
      }
      return new Response("missing", { status: 404, statusText: "Not Found" });
    });

    const report = await repairLibrary({ libraryPath: library, skillIds: ["one"], fetchImpl });

    expect(report.repaired.map((entry) => entry.id)).toEqual(["one"]);
    // "two" stays empty because it was not requested.
    await expect(fs.pathExists(path.join(library, "two", "SKILL.md"))).resolves.toBe(false);
  });

  it("returns an empty report for a healthy library", async () => {
    const library = path.join(tmp, "library");
    await seedSkill(library, "healthy");

    const report = await repairLibrary({ libraryPath: library, fetchImpl: mockFetch(() => new Response("x")) });

    expect(report).toMatchObject({ repaired: [], skipped: [], errors: [] });
    expect(report.checkedAt).toEqual(expect.any(String));
  });

  it("forwards checkContentHash and uses global fetch when no fetchImpl is given", async () => {
    const library = path.join(tmp, "library");
    // A hash-mismatch only surfaces when checkContentHash is enabled (the default),
    // so passing it explicitly exercises the option forwarding.
    await seedSkill(library, "browser", {
      contentHash: "stale",
      source: { type: "github", githubUrl: "https://github.com/example/skills", githubPath: "browser", ref: "HEAD", commit: "old" }
    });
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url === "https://api.github.com/repos/example/skills/commits/HEAD") {
          return new Response(JSON.stringify({ sha: "new123" }));
        }
        if (url === "https://api.github.com/repos/example/skills/git/trees/new123?recursive=1") {
          return new Response(JSON.stringify({ tree: [{ path: "browser/SKILL.md", type: "blob" }] }));
        }
        if (url === "https://raw.githubusercontent.com/example/skills/new123/browser/SKILL.md") {
          return new Response("---\nname: browser\ndescription: Restored.\n---\n");
        }
        return new Response("missing", { status: 404, statusText: "Not Found" });
      })
    );

    const report = await repairLibrary({ libraryPath: library, checkContentHash: true });

    expect(report.repaired).toEqual([{ id: "browser", reason: "hash-mismatch", status: "repaired" }]);
  });

  it("stringifies non-Error re-fetch failures", async () => {
    const library = path.join(tmp, "library");
    await seedSkill(library, "browser", {
      writeSkillMd: false,
      source: { type: "github", githubUrl: "https://github.com/example/skills", githubPath: "browser", ref: "HEAD", commit: "old" }
    });
    // updateInstalledSkill throws a non-Error value.
    const spy = vi.spyOn(installer, "updateInstalledSkill").mockRejectedValueOnce("string failure" as never);

    const report = await repairLibrary({ libraryPath: library, fetchImpl: mockFetch(() => new Response("x")) });

    expect(report.errors).toEqual([
      { id: "browser", reason: "empty-folder", status: "error", message: "string failure" }
    ]);
    spy.mockRestore();
  });
});
