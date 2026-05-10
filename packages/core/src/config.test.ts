import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig, loadConfig, normalizeConfig, saveConfig } from "./config.js";
import { defaultTargetDirectories, expandHome } from "./paths.js";

describe("config", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-config-"));
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

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

  it("loads defaults when the config file is missing", async () => {
    await expect(loadConfig({ configPath: path.join(tmp, "missing.json") })).resolves.toEqual(defaultConfig());
  });

  it("saves partial config updates with normalized defaults", async () => {
    const configPath = path.join(tmp, "skiller", "config.json");

    await saveConfig({ libraryPath: "/skills", keepAllSkillsUpdated: true }, { configPath });

    await expect(loadConfig({ configPath })).resolves.toMatchObject({
      libraryPath: "/skills",
      keepAllSkillsUpdated: true,
      updateSchedule: { intervalHours: 24 }
    });
  });

  it("ignores undefined values when saving partial config updates", async () => {
    const configPath = path.join(tmp, "skiller", "config.json");

    await saveConfig({ libraryPath: "/skills" }, { configPath });
    await saveConfig({ libraryPath: undefined, keepAllSkillsUpdated: true }, { configPath });

    await expect(loadConfig({ configPath })).resolves.toMatchObject({
      libraryPath: "/skills",
      keepAllSkillsUpdated: true
    });
  });
});
