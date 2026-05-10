import { ipcMain } from "electron";
import { MetadataStore, SkillsShClient, defaultConfig, expandHome, scanTargets } from "@skiller/core";

export function registerIpcHandlers(): void {
  ipcMain.handle("library:list", async () => {
    const config = defaultConfig();
    return new MetadataStore(expandHome(config.libraryPath)).list();
  });

  ipcMain.handle("targets:scan", async () => {
    const config = defaultConfig();
    return scanTargets({
      libraryPath: expandHome(config.libraryPath),
      targetDirectories: config.targetDirectories.map((target) => expandHome(target))
    });
  });

  ipcMain.handle("discover:leaderboard", async (_event, type: "all-time" | "trending" | "hot") => {
    return new SkillsShClient().leaderboard(type);
  });

  ipcMain.handle("discover:search", async (_event, query: string) => {
    return new SkillsShClient().search(query);
  });
}
