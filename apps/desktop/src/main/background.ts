import { createUpdateInterval, expandHome, loadConfig, scanTargets, watchTargetDirectories } from "@skiller/core";
import type { BrowserWindow } from "electron";
import { checkDesktopUpdates } from "./update-check.js";

interface BackgroundJobDependencies {
  loadConfig: typeof loadConfig;
  expandHome: typeof expandHome;
  scanTargets: typeof scanTargets;
  watchTargetDirectories: typeof watchTargetDirectories;
  createUpdateInterval: typeof createUpdateInterval;
  checkDesktopUpdates: typeof checkDesktopUpdates;
}

const defaultDependencies: BackgroundJobDependencies = {
  loadConfig,
  expandHome,
  scanTargets,
  watchTargetDirectories,
  createUpdateInterval,
  checkDesktopUpdates
};

type BackgroundWindow = Pick<BrowserWindow, "webContents">;

export async function startBackgroundJobs(
  window: BackgroundWindow,
  dependencies: Partial<BackgroundJobDependencies> = {}
): Promise<Array<{ stop: () => void }>> {
  const deps = { ...defaultDependencies, ...dependencies };
  const config = await deps.loadConfig();
  const expandedTargets = config.targetDirectories.map((target) => deps.expandHome(target));

  const runScan = () => {
    void deps
      .loadConfig()
      .then((scanConfig) =>
        deps.scanTargets({
          libraryPath: deps.expandHome(scanConfig.libraryPath),
          targetDirectories: scanConfig.targetDirectories.map((target) => deps.expandHome(target))
        })
      )
      .catch((error: unknown) => {
        console.error("Background scan failed", error);
        window.webContents.send("background:scan-error", {
          message: error instanceof Error ? error.message : String(error)
        });
      });
  };

  runScan();

  const watcher = deps.watchTargetDirectories({ targetDirectories: expandedTargets }, runScan);
  const runUpdateCheck = () => {
    void deps
      .checkDesktopUpdates()
      .then((result) => {
        window.webContents.send("background:updates-checked", result);
      })
      .catch((error: unknown) => {
        console.error("Background update check failed", error);
        window.webContents.send("background:update-error", {
          message: error instanceof Error ? error.message : String(error)
        });
      });
  };
  const updateInterval = deps.createUpdateInterval(config.updateSchedule, runUpdateCheck);

  return [
    { stop: () => void watcher.close() },
    { stop: () => clearInterval(updateInterval) }
  ];
}
