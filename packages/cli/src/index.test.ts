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
});
