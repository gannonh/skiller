import { createUpdateInterval, defaultConfig, expandHome, scanTargets, watchTargetDirectories } from "@skiller/core";
import type { BrowserWindow } from "electron";

export function startBackgroundJobs(window: BrowserWindow): Array<{ stop: () => void }> {
  const config = defaultConfig();
  const expandedTargets = config.targetDirectories.map((target) => expandHome(target));

  const runScan = () => {
    void scanTargets({ libraryPath: expandHome(config.libraryPath), targetDirectories: expandedTargets }).catch((error: unknown) => {
      console.error("Background scan failed", error);
      window.webContents.send("background:scan-error", {
        message: error instanceof Error ? error.message : String(error)
      });
    });
  };

  runScan();

  const watcher = watchTargetDirectories({ targetDirectories: expandedTargets }, runScan);
  const runUpdateCheck = () => {
    window.webContents.send("action:check-updates");
  };
  const updateInterval = createUpdateInterval(config.updateSchedule, runUpdateCheck);

  return [
    { stop: () => void watcher.close() },
    { stop: () => clearInterval(updateInterval) }
  ];
}
