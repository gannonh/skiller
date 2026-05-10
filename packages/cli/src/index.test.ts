import { describe, expect, it, vi } from "vitest";
import { createProgram, runCli } from "./index.js";
import { printResult } from "./output.js";

describe("cli", () => {
  it("prints null for undefined JSON results", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    printResult(undefined, true);

    expect(write).toHaveBeenCalledWith("null\n");
    write.mockRestore();
  });

  it("prints invalid and sets exit code for invalid skills", async () => {
    const printResult = vi.fn();
    const setExitCode = vi.fn();
    const program = createProgram({
      printResult,
      setExitCode,
      validateSkill: vi.fn(async () => ({ valid: false, issues: [] }))
    });

    await program.parseAsync(["node", "skiller", "validate", "/missing"]);

    expect(printResult).toHaveBeenCalledWith("invalid", false);
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it("uses the default exit-code setter for invalid skills", async () => {
    const originalExitCode = process.exitCode;
    const printResult = vi.fn();
    const program = createProgram({
      printResult,
      validateSkill: vi.fn(async () => ({ valid: false, issues: [] }))
    });

    await program.parseAsync(["node", "skiller", "validate", "/missing"]);

    expect(process.exitCode).toBe(1);
    process.exitCode = originalExitCode;
  });

  it("prints validation JSON without stringifying twice", async () => {
    const printResult = vi.fn();
    const program = createProgram({
      printResult,
      validateSkill: vi.fn(async () => ({ valid: true, issues: [] }))
    });

    await program.parseAsync(["node", "skiller", "validate", "/skill", "--json"]);

    expect(printResult).toHaveBeenCalledWith({ valid: true, issues: [] }, true);
  });

  it("prints valid for valid skills", async () => {
    const printResult = vi.fn();
    const program = createProgram({
      printResult,
      validateSkill: vi.fn(async () => ({ valid: true, issues: [] }))
    });

    await program.parseAsync(["node", "skiller", "validate", "/skill"]);

    expect(printResult).toHaveBeenCalledWith("valid", false);
  });

  it("runs scan with expanded default paths", async () => {
    const printResult = vi.fn();
    const scanTargets = vi.fn(async () => ({ imported: [], enabled: [], disabled: [], errors: [] }));
    const program = createProgram({
      printResult,
      scanTargets,
      loadConfig: async () => ({
        libraryPath: "~/persisted-skiller",
        targets: [{ path: "~/.agents/skills", enabled: true }],
        updateSchedule: { intervalHours: 24 },
        keepAllSkillsUpdated: false,
        launchAtLogin: false,
        trayEnabled: true
      }),
      expandHome: (value) => value.replace("~", "/home/test")
    });

    await program.parseAsync(["node", "skiller", "scan"]);

    expect(scanTargets).toHaveBeenCalledWith({
      libraryPath: "/home/test/persisted-skiller",
      targets: [{ path: "/home/test/.agents/skills", enabled: true }]
    });
    expect(printResult).toHaveBeenCalledWith("imported 0 skills", false);
  });

  it("lists skills from the persisted library path", async () => {
    const printResult = vi.fn();
    const list = vi.fn(async () => [{ id: "persisted", name: "Persisted Skill" }]);
    const metadataStore = vi.fn(function (this: { list: typeof list; libraryPath: string }, libraryPath: string) {
      this.libraryPath = libraryPath;
      this.list = list;
    });
    const program = createProgram({
      printResult,
      metadataStore: metadataStore as never,
      loadConfig: async () => ({
        libraryPath: "~/persisted-skiller",
        targets: [],
        updateSchedule: { intervalHours: 24 },
        keepAllSkillsUpdated: false,
        launchAtLogin: false,
        trayEnabled: true
      }),
      expandHome: (value) => value.replace("~", "/home/test")
    });

    await program.parseAsync(["node", "skiller", "list"]);

    expect(metadataStore).toHaveBeenCalledWith("/home/test/persisted-skiller");
    expect(printResult).toHaveBeenCalledWith("Persisted Skill", false);
  });

  it("prints listed skills as JSON", async () => {
    const printResult = vi.fn();
    const skills = [{ id: "persisted", name: "Persisted Skill" }];
    const metadataStore = vi.fn(function (this: { list: () => Promise<typeof skills> }) {
      this.list = async () => skills;
    });
    const program = createProgram({
      printResult,
      metadataStore: metadataStore as never,
      loadConfig: async () => ({
        libraryPath: "~/persisted-skiller",
        targets: [],
        updateSchedule: { intervalHours: 24 },
        keepAllSkillsUpdated: false,
        launchAtLogin: false,
        trayEnabled: true
      }),
      expandHome: (value) => value.replace("~", "/home/test")
    });

    await program.parseAsync(["node", "skiller", "list", "--json"]);

    expect(printResult).toHaveBeenCalledWith(skills, true);
  });

  it("installs skills into the persisted library path", async () => {
    const printResult = vi.fn();
    const installLocalSkill = vi.fn(async () => ({ id: "installed", name: "Installed Skill" }));
    const program = createProgram({
      printResult,
      installLocalSkill: installLocalSkill as never,
      loadConfig: async () => ({
        libraryPath: "~/persisted-skiller",
        targets: [],
        updateSchedule: { intervalHours: 24 },
        keepAllSkillsUpdated: false,
        launchAtLogin: false,
        trayEnabled: true
      }),
      expandHome: (value) => value.replace("~", "/home/test")
    });

    await program.parseAsync(["node", "skiller", "install", "/source"]);

    expect(installLocalSkill).toHaveBeenCalledWith({
      sourcePath: "/source",
      libraryPath: "/home/test/persisted-skiller"
    });
    expect(printResult).toHaveBeenCalledWith("installed Installed Skill", false);
  });

  it("prints install results as JSON", async () => {
    const printResult = vi.fn();
    const metadata = { id: "installed", name: "Installed Skill" };
    const program = createProgram({
      printResult,
      installLocalSkill: vi.fn(async () => metadata) as never,
      loadConfig: async () => ({
        libraryPath: "~/persisted-skiller",
        targets: [],
        updateSchedule: { intervalHours: 24 },
        keepAllSkillsUpdated: false,
        launchAtLogin: false,
        trayEnabled: true
      }),
      expandHome: (value) => value.replace("~", "/home/test")
    });

    await program.parseAsync(["node", "skiller", "install", "/source", "--json"]);

    expect(printResult).toHaveBeenCalledWith(metadata, true);
  });

  it("checks updates through core using persisted config", async () => {
    const printResult = vi.fn();
    const checkForSkillUpdates = vi.fn(async () => ({
      checkedAt: "2026-05-10T12:00:00.000Z",
      considered: [{ id: "one", name: "One" }],
      available: [{ id: "one", name: "One", currentCommit: "abc", remoteCommit: "def" }],
      updated: [],
      errors: []
    }));
    const config = {
      libraryPath: "~/persisted-skiller",
      targets: [],
      updateSchedule: { intervalHours: 24 },
      keepAllSkillsUpdated: false,
      launchAtLogin: false,
      trayEnabled: true
    };
    const program = createProgram({
      printResult,
      checkForSkillUpdates,
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test")
    });

    await program.parseAsync(["node", "skiller", "update", "one"]);

    expect(checkForSkillUpdates).toHaveBeenCalledWith({
      libraryPath: "/home/test/persisted-skiller",
      config,
      skillId: "one"
    });
    expect(printResult).toHaveBeenCalledWith("checked 1 skill, 1 update available, 0 updated", false);
  });

  it("prints update summaries and JSON for plural counts", async () => {
    const printResult = vi.fn();
    const result = {
      checkedAt: "2026-05-10T12:00:00.000Z",
      considered: [
        { id: "one", name: "One" },
        { id: "two", name: "Two" }
      ],
      available: [],
      updated: [],
      errors: []
    };
    const config = {
      libraryPath: "~/persisted-skiller",
      targets: [],
      updateSchedule: { intervalHours: 24 },
      keepAllSkillsUpdated: false,
      launchAtLogin: false,
      trayEnabled: true
    };
    const program = createProgram({
      printResult,
      checkForSkillUpdates: vi.fn(async () => result),
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test")
    });

    await program.parseAsync(["node", "skiller", "update"]);
    await program.parseAsync(["node", "skiller", "update", "--json"]);

    expect(printResult).toHaveBeenNthCalledWith(1, "checked 2 skills, 0 updates available, 0 updated", false);
    expect(printResult).toHaveBeenNthCalledWith(2, result, true);
  });

  it("prints scan results as JSON", async () => {
    const printResult = vi.fn();
    const result = { imported: [], enabled: [], disabled: [], errors: [] };
    const program = createProgram({
      printResult,
      scanTargets: vi.fn(async () => result),
      loadConfig: async () => ({
        libraryPath: "~/persisted-skiller",
        targets: [{ path: "~/.agents/skills", enabled: true }],
        updateSchedule: { intervalHours: 24 },
        keepAllSkillsUpdated: false,
        launchAtLogin: false,
        trayEnabled: true
      }),
      expandHome: (value) => value.replace("~", "/home/test")
    });

    await program.parseAsync(["node", "skiller", "scan", "--json"]);

    expect(printResult).toHaveBeenCalledWith(result, true);
  });

  it("searches discover results with a mocked skills.sh client", async () => {
    const printResult = vi.fn();
    const search = vi.fn(async () => ({
      skills: [{ id: "agent-browser", name: "Agent Browser" }, { id: "skill-writer" }, { slug: "ignored" }]
    }));
    const program = createProgram({
      printResult,
      skillsShClient: () => ({ search, leaderboard: vi.fn() })
    });

    await program.parseAsync(["node", "skiller", "discover", "search", "browser"]);

    expect(search).toHaveBeenCalledWith("browser");
    expect(printResult).toHaveBeenCalledWith("Agent Browser\nskill-writer", false);
  });

  it("prints discover search JSON without stringifying twice", async () => {
    const printResult = vi.fn();
    const result = { skills: [{ id: "agent-browser", name: "Agent Browser" }] };
    const program = createProgram({
      printResult,
      skillsShClient: () => ({ search: vi.fn(async () => result), leaderboard: vi.fn() })
    });

    await program.parseAsync(["node", "skiller", "discover", "search", "browser", "--json"]);

    expect(printResult).toHaveBeenCalledWith(result, true);
  });

  it("loads the trending discover leaderboard by default", async () => {
    const printResult = vi.fn();
    const leaderboard = vi.fn(async () => ({
      skills: [{ id: "hot-skill", name: "Hot Skill" }]
    }));
    const program = createProgram({
      printResult,
      skillsShClient: () => ({ search: vi.fn(), leaderboard })
    });

    await program.parseAsync(["node", "skiller", "discover", "leaderboard"]);

    expect(leaderboard).toHaveBeenCalledWith("trending");
    expect(printResult).toHaveBeenCalledWith("Hot Skill", false);
  });

  it("loads a selected discover leaderboard as JSON", async () => {
    const printResult = vi.fn();
    const result = { skills: [{ id: "classic-skill", name: "Classic Skill" }] };
    const leaderboard = vi.fn(async () => result);
    const program = createProgram({
      printResult,
      skillsShClient: () => ({ search: vi.fn(), leaderboard })
    });

    await program.parseAsync(["node", "skiller", "discover", "leaderboard", "all-time", "--json"]);

    expect(leaderboard).toHaveBeenCalledWith("all-time");
    expect(printResult).toHaveBeenCalledWith(result, true);
  });

  it("prints plain and JSON output", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    printResult("ok", false);
    printResult({ ok: true }, true);

    expect(write).toHaveBeenNthCalledWith(1, "ok\n");
    expect(write).toHaveBeenNthCalledWith(2, "{\n  \"ok\": true\n}\n");
    write.mockRestore();
  });

  it("runs the default CLI wrapper for validation", async () => {
    const originalExitCode = process.exitCode;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runCli(["node", "skiller", "validate", "/missing"]);

    expect(process.exitCode).toBe(1);
    expect(write).toHaveBeenCalledWith("invalid\n");
    write.mockRestore();
    process.exitCode = originalExitCode;
  });

  it("uses the default skills.sh client factory", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "agent-browser" }] }))));
    const program = createProgram();

    await program.parseAsync(["node", "skiller", "discover", "search", "browser"]);

    expect(write).toHaveBeenCalledWith("agent-browser\n");
    write.mockRestore();
    vi.unstubAllGlobals();
  });
});
