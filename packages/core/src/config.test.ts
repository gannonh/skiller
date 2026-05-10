import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig, defaultConfigPath, loadConfig, normalizeConfig, saveConfig } from "./config.js";
import { defaultTargetDirectories, expandHome } from "./paths.js";

describe("config", () => {
  let tmp: string;
  const originalPlatform = process.platform;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-config-"));
  });

  afterEach(async () => {
    await fs.remove(tmp);
    vi.unstubAllEnvs();
    Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
  });

  function setPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, "platform", { configurable: true, value: platform });
  }

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

  it("normalizes provided update schedule and target directories", () => {
    expect(
      normalizeConfig({
        updateSchedule: { intervalHours: 6 },
        targetDirectories: ["~/custom-skills"]
      })
    ).toMatchObject({
      updateSchedule: { intervalHours: 6 },
      targetDirectories: ["~/custom-skills"]
    });
  });

  it("expands a leading home segment", () => {
    expect(expandHome("~/skiller", "/Users/example")).toBe("/Users/example/skiller");
  });

  it("expands a bare home segment and leaves other paths untouched", () => {
    expect(expandHome("~", "/Users/example")).toBe("/Users/example");
    expect(expandHome("/tmp/skiller", "/Users/example")).toBe("/tmp/skiller");
  });

  it("uses HOME when expandHome is called without an explicit home", () => {
    vi.stubEnv("HOME", "/Users/from-env");

    expect(expandHome("~/skiller")).toBe("/Users/from-env/skiller");
  });

  it("leaves home-relative paths unchanged when HOME is unavailable", () => {
    vi.unstubAllEnvs();
    delete process.env.HOME;

    expect(expandHome("~/skiller")).toBe("~/skiller");
  });

  it("uses explicit, macOS, Windows, and XDG default config paths", () => {
    vi.stubEnv("SKILLER_CONFIG_PATH", path.join(tmp, "explicit.json"));
    expect(defaultConfigPath()).toBe(path.join(tmp, "explicit.json"));

    vi.unstubAllEnvs();
    setPlatform("darwin");
    expect(defaultConfigPath()).toBe(path.join(os.homedir(), "Library", "Application Support", "skiller", "config.json"));

    setPlatform("win32");
    vi.stubEnv("APPDATA", path.join(tmp, "AppData", "Roaming"));
    expect(defaultConfigPath()).toBe(path.join(tmp, "AppData", "Roaming", "skiller", "config.json"));

    setPlatform("linux");
    vi.stubEnv("XDG_CONFIG_HOME", path.join(tmp, "xdg"));
    expect(defaultConfigPath()).toBe(path.join(tmp, "xdg", "skiller", "config.json"));

    delete process.env.XDG_CONFIG_HOME;
    expect(defaultConfigPath()).toBe(path.join(os.homedir(), ".config", "skiller", "config.json"));
  });

  it("uses the default config path when persistence options omit configPath", async () => {
    vi.stubEnv("SKILLER_CONFIG_PATH", path.join(tmp, "default-path.json"));

    await saveConfig({ libraryPath: "/skills" });

    await expect(loadConfig()).resolves.toMatchObject({ libraryPath: "/skills" });
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
