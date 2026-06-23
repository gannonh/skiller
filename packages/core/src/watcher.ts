import chokidar from "chokidar";
import type { FSWatcher } from "chokidar";
import path from "node:path";
import type { SkillerConfig } from "./types.js";

export function watchTargetDirectories(
  targetDirectories: string[],
  onChange: (filePath: string) => void,
  onError?: (error: unknown) => void
): FSWatcher {
  return chokidar
    .watch(targetDirectories, {
      ignoreInitial: true,
      depth: 1,
      followSymlinks: false,
      awaitWriteFinish: true,
      ignored: (testPath: string) => path.basename(testPath).includes("skiller-backup-")
    })
    .on("addDir", onChange)
    .on("unlinkDir", onChange)
    .on("change", onChange)
    .on("add", onChange)
    .on("unlink", onChange)
    .on("error", (error) => onError?.(error));
}

export function createUpdateInterval(
  schedule: SkillerConfig["updateSchedule"],
  checkForUpdates: () => void
): NodeJS.Timeout {
  return setInterval(checkForUpdates, schedule.intervalHours * 60 * 60 * 1000);
}
