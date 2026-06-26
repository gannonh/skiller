import {
  MetadataStore,
  createUpdateInterval,
  expandHome,
  loadConfig,
  repairLibrary,
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
  repairLibrary: typeof repairLibrary;
  scanTargets: typeof scanTargets;
  watchTargetDirectories: typeof watchTargetDirectories;
  createUpdateInterval: typeof createUpdateInterval;
  checkDesktopUpdates: typeof checkDesktopUpdates;
}

const defaultDependencies: BackgroundJobDependencies = {
  loadConfig,
  expandHome,
  metadataStore: MetadataStore,
  repairLibrary,
  scanTargets,
  watchTargetDirectories,
  createUpdateInterval,
  checkDesktopUpdates
};

type BackgroundWindow = Pick<BrowserWindow, "webContents">;

const SCAN_DEBOUNCE_MS = 250;
const WATCHER_GRACE_PERIOD_MS = 500;

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
  // Suppress watcher-triggered scans during a scan and for a grace period
  // afterward so the scanner's own filesystem operations don't re-trigger
  // the watcher in a feedback loop.
  let suppressWatcher = false;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;

  const executeScan = async (options?: { importOnly?: boolean; fullScan?: boolean }) => {
    /* v8 ignore next -- safety guard: suppressWatcher prevents concurrent executeScan calls */
    if (scanInFlight) return;

    scanInFlight = true;
    suppressWatcher = true;
    try {
      const scanConfig = await deps.loadConfig();
      const libraryPath = deps.expandHome(scanConfig.libraryPath);
      const store = new deps.metadataStore(libraryPath);
      // PruneMissing only on full scans (startup, IPC-triggered), not on
      // watcher-triggered import-only scans, to avoid metadata churn.
      if (!options?.importOnly) {
        await store.pruneMissing();
      }
      const { skillSets } = await store.libraryState();
      await deps.scanTargets(
        buildScanTargetsInput(scanConfig, skillSets, scanConfig.targets, deps.expandHome, options)
      );
    } catch (error: unknown) {
      console.error("Background scan failed", error);
      window.webContents.send("background:scan-error", {
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      scanInFlight = false;
      // Keep suppressing for a grace period to let filesystem events from the
      // scan's own operations settle before re-enabling the watcher.
      /* v8 ignore next -- safety guard: clears a stale grace timer from a prior scan */
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = setTimeout(() => {
        suppressWatcher = false;
        graceTimer = undefined;
      }, WATCHER_GRACE_PERIOD_MS);
    }
  };

  const runScan = () => {
    if (suppressWatcher) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      // Watcher-triggered scans are import-only to avoid the feedback loop
      // where the scanner's symlink/copy operations re-trigger the watcher.
      void executeScan({ importOnly: true });
    }, SCAN_DEBOUNCE_MS);
  };

  // On startup, self-heal the library (re-fetch empty/invalid/missing skills
  // from their recorded sources) before the initial full scan distributes
  // skills to targets. Repair is best-effort and never blocks startup.
  const startup = async () => {
    try {
      const repairConfig = await deps.loadConfig();
      const libraryPath = deps.expandHome(repairConfig.libraryPath);
      const report = await deps.repairLibrary({ libraryPath });
      if (report.repaired.length > 0 || report.errors.length > 0) {
        window.webContents.send("background:library-repaired", {
          repaired: report.repaired.length,
          skipped: report.skipped.length,
          errors: report.errors.length
        });
      }
    } catch (error: unknown) {
      console.error("Background library repair failed", error);
      window.webContents.send("background:scan-error", {
        message: error instanceof Error ? error.message : String(error)
      });
    }
    // Initial scan on startup is a full scan (sync all targets + prune).
    await executeScan({ fullScan: true });
  };
  void startup();

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
        if (graceTimer) {
          clearTimeout(graceTimer);
          graceTimer = undefined;
        }
        void watcher.close();
      }
    },
    { stop: () => clearInterval(updateInterval) }
  ];
}
