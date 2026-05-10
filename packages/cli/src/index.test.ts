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
      defaultConfig: () => ({
        libraryPath: "~/skiller",
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
      libraryPath: "/home/test/skiller",
      targetDirectories: ["/home/test/.codex/skills"]
    });
    expect(printResult).toHaveBeenCalledWith("imported 0 skills", false);
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
