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

  it("rejects blank and relative library paths when saving config", async () => {
    const configPath = path.join(tmp, "skiller", "config.json");

    await expect(saveConfig({ libraryPath: "" }, { configPath })).rejects.toThrow("Library path cannot be blank");
    await expect(saveConfig({ libraryPath: "skiller" }, { configPath })).rejects.toThrow(
      "Library path must be absolute or start with ~/"
    );
  });

  it("rejects saved config files with blank or relative library paths", async () => {
    const blankConfigPath = path.join(tmp, "blank", "config.json");
    const relativeConfigPath = path.join(tmp, "relative", "config.json");
    await fs.ensureDir(path.dirname(blankConfigPath));
    await fs.ensureDir(path.dirname(relativeConfigPath));
    await fs.writeJson(blankConfigPath, { libraryPath: "" });
    await fs.writeJson(relativeConfigPath, { libraryPath: "skiller" });

    await expect(loadConfig({ configPath: blankConfigPath })).rejects.toThrow("Library path cannot be blank");
    await expect(loadConfig({ configPath: relativeConfigPath })).rejects.toThrow(
      "Library path must be absolute or start with ~/"
    );
  });

  it("rejects partial saves when existing config has a relative library path", async () => {
    const configPath = path.join(tmp, "relative-existing", "config.json");
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, { libraryPath: "skiller" });

    await expect(saveConfig({ keepAllSkillsUpdated: true }, { configPath })).rejects.toThrow(
      "Library path must be absolute or start with ~/"
    );
  });
});
