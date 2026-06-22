import {
  MetadataStore,
  createUpdateInterval,
  expandHome,
  loadConfig,
  scanTargets,
  watchTargetDirectories
} from "@skiller/core";
import type { BrowserWindow } from "electron";
import { checkDesktopUpdates } from "./update-check.js";
import { buildScanTargetsInput } from "./scan-helpers.js";

interface BackgroundJobDependencies {
  loadConfig: typeof loadConfig;
  expandHome: typeof expandHome;
  metadataStore: typeof MetadataStore;
  scanTargets: typeof scanTargets;
  watchTargetDirectories: typeof watchTargetDirectories;
  createUpdateInterval: typeof createUpdateInterval;
  checkDesktopUpdates: typeof checkDesktopUpdates;
}

const defaultDependencies: BackgroundJobDependencies = {
  loadConfig,
  expandHome,
  metadataStore: MetadataStore,
  scanTargets,
  watchTargetDirectories,
  createUpdateInterval,
  checkDesktopUpdates
};

type BackgroundWindow = Pick<BrowserWindow, "webContents">;

const SCAN_DEBOUNCE_MS = 250;

export function isTransientWatcherError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b(EINVAL|ENOENT)\b/.test(message)) return true;

  if (!(error && typeof error === "object" && "code" in error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EINVAL" || code === "ENOENT";
}

export async function startBackgroundJobs(
  window: BackgroundWindow,
  dependencies: Partial<BackgroundJobDependencies> = {}
): Promise<Array<{ stop: () => void }>> {
  const deps = { ...defaultDependencies, ...dependencies };
  const config = await deps.loadConfig();
  const expandedTargetPaths = config.targets.map((target) => deps.expandHome(target.path));

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let scanInFlight = false;
  let scanQueued = false;

  const executeScan = async () => {
    if (scanInFlight) {
      scanQueued = true;
      return;
    }

    scanInFlight = true;
    try {
      const scanConfig = await deps.loadConfig();
      const libraryPath = deps.expandHome(scanConfig.libraryPath);
      const store = new deps.metadataStore(libraryPath);
      await store.pruneMissing();
      const { skillSets } = await store.libraryState();
      await deps.scanTargets(buildScanTargetsInput(scanConfig, skillSets, scanConfig.targets, deps.expandHome));
    } catch (error: unknown) {
      console.error("Background scan failed", error);
      window.webContents.send("background:scan-error", {
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      scanInFlight = false;
      // Queue-of-one: a new event while in-flight sets scanQueued; the finally block drains it once.
      if (scanQueued) {
        scanQueued = false;
        void executeScan();
      }
    }
  };

  const runScan = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void executeScan();
    }, SCAN_DEBOUNCE_MS);
  };

  runScan();

  // Target directory watchers are created from startup config; each scan reloads current config.
  const watcher = deps.watchTargetDirectories(expandedTargetPaths, runScan, (error) => {
    if (isTransientWatcherError(error)) {
      console.warn("Target watcher skipped transient error", error);
      return;
    }

    console.error("Target watcher failed", error);
    window.webContents.send("background:scan-error", {
      message: error instanceof Error ? error.message : String(error)
    });
  });
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
    {
      stop: () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = undefined;
        }
        void watcher.close();
      }
    },
    { stop: () => clearInterval(updateInterval) }
  ];
}
