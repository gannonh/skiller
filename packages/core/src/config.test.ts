import { describe, expect, it } from "vitest";
import { defaultConfig, normalizeConfig } from "./config.js";
import { defaultTargetDirectories, expandHome } from "./paths.js";

describe("config", () => {
  it("defaults the library path to ~/skiller", () => {
    expect(defaultConfig().libraryPath).toBe("~/skiller");
  });

  it("keeps the default target directories", () => {
    expect(defaultTargetDirectories()).toEqual([
      "~/.agents/skills",
      "~/.claude/skills",
      "~/.codex/skills",
      "~/.cursor/skills",
      "~/.pi/agent/skills",
      "~/.gemini/skills",
      "~/.copilot/skills"
    ]);
  });

  it("normalizes empty config values", () => {
    expect(normalizeConfig({}).updateSchedule).toEqual({ intervalHours: 24 });
  });

  it("expands a leading home segment", () => {
    expect(expandHome("~/skiller", "/Users/example")).toBe("/Users/example/skiller");
  });
});
