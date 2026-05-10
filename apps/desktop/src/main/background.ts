import { createUpdateInterval, defaultConfig, expandHome, scanTargets, watchTargetDirectories } from "@skiller/core";

export function startBackgroundJobs(): Array<{ stop: () => void }> {
  const config = defaultConfig();
  const expandedTargets = config.targetDirectories.map((target) => expandHome(target));

  const runScan = () => {
    void scanTargets({ libraryPath: expandHome(config.libraryPath), targetDirectories: expandedTargets });
  };

  runScan();

  const watcher = watchTargetDirectories({ targetDirectories: expandedTargets }, runScan);
  const runUpdateCheck = () => {
    windowQueue.push({ type: "updates:check-requested", createdAt: new Date().toISOString() });
  };
  const updateInterval = createUpdateInterval(config.updateSchedule, runUpdateCheck);

  return [
    { stop: () => void watcher.close() },
    { stop: () => clearInterval(updateInterval) }
  ];
}

const windowQueue: Array<{ type: string; createdAt: string }> = [];
