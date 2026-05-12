import { app } from "electron";
import { autoUpdater } from "electron-updater";
import type { AppUpdater, ProgressInfo, UpdateInfo } from "electron-updater";

const BACKGROUND_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "not-available"
  | "unsupported"
  | "error";

export type AppUpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "downloading"; progress: number }
  | { status: "ready"; version: string; releaseName?: string; releaseDate?: string }
  | { status: "not-available" }
  | { status: "unsupported" }
  | { status: "error"; error: string };

export interface AppUpdateService {
  getState: () => AppUpdateState;
  subscribe: (listener: (state: AppUpdateState) => void) => () => void;
  startBackgroundChecks: () => Promise<AppUpdateState>;
  checkNow: () => Promise<AppUpdateState>;
  installReadyUpdate: () => Promise<void>;
  stop: () => void;
}

interface AppUpdateServiceDependencies {
  updater: AppUpdater;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
}

export function getAutoUpdater(): AppUpdater {
  return autoUpdater;
}

export function createAppUpdateService(
  dependencies: Partial<AppUpdateServiceDependencies> = {}
): AppUpdateService {
  const deps: AppUpdateServiceDependencies = {
    updater: dependencies.updater ?? getAutoUpdater(),
    isPackaged: dependencies.isPackaged ?? app.isPackaged,
    platform: dependencies.platform ?? process.platform,
    env: dependencies.env ?? process.env,
    setInterval: dependencies.setInterval ?? setInterval,
    clearInterval: dependencies.clearInterval ?? clearInterval
  };
  const listeners = new Set<(state: AppUpdateState) => void>();
  const isSupported = supportsAppUpdates(deps);
  let state: AppUpdateState = isSupported ? { status: "idle" } : { status: "unsupported" };
  let backgroundInterval: NodeJS.Timeout | undefined;

  const setState = (nextState: AppUpdateState) => {
    state = nextState;
    for (const listener of listeners) {
      listener(state);
    }
  };

  const setErrorState = (error: unknown) => {
    console.error("App update failed", error);
    setState({ status: "error", error: error instanceof Error ? error.message : String(error) });
  };

  deps.updater.autoDownload = false;
  deps.updater.on("checking-for-update", () => {
    setState({ status: "checking" });
  });
  deps.updater.on("update-not-available", () => {
    setState({ status: "not-available" });
  });
  deps.updater.on("update-available", () => {
    void deps.updater.downloadUpdate().catch(setErrorState);
  });
  deps.updater.on("download-progress", (progress: ProgressInfo) => {
    setState({ status: "downloading", progress: progress.percent });
  });
  deps.updater.on("update-downloaded", (info: UpdateInfo) => {
    setState({
      status: "ready",
      version: info.version,
      releaseName: info.releaseName ?? undefined,
      releaseDate: info.releaseDate
    });
  });
  deps.updater.on("error", setErrorState);

  const checkNow = async () => {
    if (!isSupported) {
      return state;
    }

    try {
      await deps.updater.checkForUpdates();
    } catch (error) {
      setErrorState(error);
    }

    return state;
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    startBackgroundChecks: async () => {
      if (!isSupported) {
        return state;
      }

      const result = await checkNow();
      if (!backgroundInterval) {
        backgroundInterval = deps.setInterval(() => {
          void checkNow();
        }, BACKGROUND_CHECK_INTERVAL_MS);
      }
      return result;
    },
    checkNow,
    installReadyUpdate: async () => {
      if (state.status !== "ready") {
        throw new Error("No downloaded app update is ready to install");
      }

      deps.updater.quitAndInstall(false, true);
    },
    stop: () => {
      if (backgroundInterval) {
        deps.clearInterval(backgroundInterval);
        backgroundInterval = undefined;
      }
    }
  };
}

function supportsAppUpdates(deps: Pick<AppUpdateServiceDependencies, "env" | "isPackaged" | "platform">): boolean {
  if (!deps.isPackaged) {
    return false;
  }

  if (deps.platform === "darwin") {
    return true;
  }

  return deps.platform === "linux" && Boolean(deps.env.APPIMAGE);
}
