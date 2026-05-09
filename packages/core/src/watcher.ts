import chokidar from "chokidar";
import type { FSWatcher } from "chokidar";
import type { SkillerConfig } from "./types.js";

export function watchTargetDirectories(
  config: Pick<SkillerConfig, "targetDirectories">,
  onChange: () => void
): FSWatcher {
  return chokidar
    .watch(config.targetDirectories, {
      ignoreInitial: true,
      depth: 2,
      awaitWriteFinish: true
    })
    .on("addDir", onChange)
    .on("unlinkDir", onChange)
    .on("change", onChange)
    .on("add", onChange)
    .on("unlink", onChange);
}

export function createUpdateInterval(
  schedule: SkillerConfig["updateSchedule"],
  checkForUpdates: () => void
): NodeJS.Timeout {
  return setInterval(checkForUpdates, schedule.intervalHours * 60 * 60 * 1000);
}
