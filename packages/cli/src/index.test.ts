import { describe, expect, it, vi } from "vitest";
import { createProgram } from "./index.js";

describe("cli", () => {
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

  it("prints validation JSON without stringifying twice", async () => {
    const printResult = vi.fn();
    const program = createProgram({
      printResult,
      validateSkill: vi.fn(async () => ({ valid: true, issues: [] }))
    });

    await program.parseAsync(["node", "skiller", "validate", "/skill", "--json"]);

    expect(printResult).toHaveBeenCalledWith({ valid: true, issues: [] }, true);
  });

  it("runs scan with expanded default paths", async () => {
    const printResult = vi.fn();
    const scanTargets = vi.fn(async () => ({ imported: [], enabled: [], errors: [] }));
    const program = createProgram({
      printResult,
      scanTargets,
      loadConfig: async () => ({
        libraryPath: "~/persisted-skiller",
        targetDirectories: ["~/.codex/skills"],
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
      targetDirectories: ["/home/test/.codex/skills"]
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
        targetDirectories: [],
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

  it("installs skills into the persisted library path", async () => {
    const printResult = vi.fn();
    const installLocalSkill = vi.fn(async () => ({ id: "installed", name: "Installed Skill" }));
    const program = createProgram({
      printResult,
      installLocalSkill: installLocalSkill as never,
      loadConfig: async () => ({
        libraryPath: "~/persisted-skiller",
        targetDirectories: [],
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
      targetDirectories: [],
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

  it("searches discover results with a mocked skills.sh client", async () => {
    const printResult = vi.fn();
    const search = vi.fn(async () => ({
      skills: [
        { id: "agent-browser", name: "Agent Browser" },
        { id: "skill-writer" }
      ]
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
});
