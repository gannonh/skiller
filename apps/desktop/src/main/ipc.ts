import { ipcMain } from "electron";
import { MetadataStore, SkillsShClient, expandHome, loadConfig, saveConfig, scanTargets } from "@skiller/core";
import type { SkillerConfig } from "@skiller/core";
import { createUpdateCheckResult } from "./update-check.js";

type ConfigUpdate = Partial<Pick<SkillerConfig, "libraryPath" | "keepAllSkillsUpdated">>;

export function registerIpcHandlers(): void {
  ipcMain.handle("library:list", async () => {
    const config = await loadConfig();
    return new MetadataStore(expandHome(config.libraryPath)).list();
  });

  ipcMain.handle("targets:scan", async () => {
    const config = await loadConfig();
    return scanTargets({
      libraryPath: expandHome(config.libraryPath),
      targetDirectories: config.targetDirectories.map((target) => expandHome(target))
    });
  });

  ipcMain.handle("config:get", async () => {
    return loadConfig();
  });

  ipcMain.handle("config:save", async (_event, config: ConfigUpdate) => {
    return saveConfig({
      libraryPath: config.libraryPath,
      keepAllSkillsUpdated: config.keepAllSkillsUpdated
    });
  });

  ipcMain.handle("updates:check", async () => {
    const config = await loadConfig();
    const skills = await new MetadataStore(expandHome(config.libraryPath)).list();

    return createUpdateCheckResult(skills, config.keepAllSkillsUpdated);
  });

  ipcMain.handle("discover:leaderboard", async (_event, type: "all-time" | "trending" | "hot") => {
    return new SkillsShClient().leaderboard(type);
  });

  ipcMain.handle("discover:search", async (_event, query: string) => {
    return new SkillsShClient().search(query);
  });
}
