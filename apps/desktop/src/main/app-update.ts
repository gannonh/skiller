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
  | { status: "downloading"; progress: number; version?: string; releaseName?: string; releaseDate?: string }
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

type UpdaterEventName =
  | "checking-for-update"
  | "update-not-available"
  | "update-available"
  | "download-progress"
  | "update-downloaded"
  | "error";

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
  let lastOperationErrorKey: string | undefined;
  const updaterListeners: Array<{ event: UpdaterEventName; listener: (...args: unknown[]) => void }> = [];

  const setState = (nextState: AppUpdateState) => {
    state = nextState;
    for (const listener of listeners) {
      listener(state);
    }
  };

  const createErrorKey = (error: unknown) => {
    return error instanceof Error ? `${error.name}:${error.message}` : String(error);
  };

  const setErrorState = (error: unknown) => {
    const errorKey = createErrorKey(error);
    if (lastOperationErrorKey === errorKey) {
      return;
    }

    lastOperationErrorKey = errorKey;
    console.error("App update failed", error);
    setState({ status: "error", error: error instanceof Error ? error.message : String(error) });
  };

  const onUpdater = <T extends unknown[]>(event: UpdaterEventName, listener: (...args: T) => void) => {
    const updaterListener = listener as (...args: unknown[]) => void;
    deps.updater.on(event, updaterListener);
    updaterListeners.push({ event, listener: updaterListener });
  };

  deps.updater.autoDownload = false;
  deps.updater.autoInstallOnAppQuit = false;
  if (!isSupported) {
    return createService({
      checkNow: async () => state,
      clearInterval: deps.clearInterval,
      getBackgroundInterval: () => backgroundInterval,
      listeners,
      state: () => state,
      stopUpdaterListeners: () => undefined,
      updater: deps.updater
    });
  }

  onUpdater("checking-for-update", () => {
    lastOperationErrorKey = undefined;
    setState({ status: "checking" });
  });
  onUpdater("update-not-available", () => {
    lastOperationErrorKey = undefined;
    setState({ status: "not-available" });
  });
  onUpdater("update-available", (info: UpdateInfo) => {
    lastOperationErrorKey = undefined;
    setState({
      status: "downloading",
      progress: 0,
      version: info.version,
      releaseName: info.releaseName ?? undefined,
      releaseDate: info.releaseDate
    });
    void deps.updater.downloadUpdate().catch(setErrorState);
  });
  onUpdater("download-progress", (progress: ProgressInfo) => {
    lastOperationErrorKey = undefined;
    setState({ status: "downloading", progress: progress.percent });
  });
  onUpdater("update-downloaded", (info: UpdateInfo) => {
    lastOperationErrorKey = undefined;
    setState({
      status: "ready",
      version: info.version,
      releaseName: info.releaseName ?? undefined,
      releaseDate: info.releaseDate
    });
  });
  onUpdater("error", setErrorState);

  const checkNow = async () => {
    lastOperationErrorKey = undefined;
    try {
      await deps.updater.checkForUpdates();
    } catch (error) {
      setErrorState(error);
    }

    return state;
  };

  return createService({
    startBackgroundChecks: async () => {
      const result = await checkNow();
      if (!backgroundInterval) {
        backgroundInterval = deps.setInterval(() => {
          void checkNow();
        }, BACKGROUND_CHECK_INTERVAL_MS);
      }
      return result;
    },
    checkNow,
    clearInterval: deps.clearInterval,
    getBackgroundInterval: () => backgroundInterval,
    listeners,
    setBackgroundInterval: (interval) => {
      backgroundInterval = interval;
    },
    state: () => state,
    stopUpdaterListeners: () => {
      for (const { event, listener } of updaterListeners) {
        deps.updater.off(event, listener);
      }
      updaterListeners.length = 0;
    },
    updater: deps.updater
  });
}

function createService(options: {
  checkNow: () => Promise<AppUpdateState>;
  clearInterval: typeof clearInterval;
  getBackgroundInterval: () => NodeJS.Timeout | undefined;
  listeners: Set<(state: AppUpdateState) => void>;
  setBackgroundInterval?: (interval: NodeJS.Timeout | undefined) => void;
  startBackgroundChecks?: () => Promise<AppUpdateState>;
  state: () => AppUpdateState;
  stopUpdaterListeners: () => void;
  updater: AppUpdater;
}): AppUpdateService {
  return {
    getState: options.state,
    subscribe: (listener) => {
      options.listeners.add(listener);
      return () => {
        options.listeners.delete(listener);
      };
    },
    startBackgroundChecks: options.startBackgroundChecks ?? options.checkNow,
    checkNow: options.checkNow,
    installReadyUpdate: async () => {
      if (options.state().status !== "ready") {
        throw new Error("No downloaded app update is ready to install");
      }

      options.updater.quitAndInstall(false, true);
    },
    stop: () => {
      const backgroundInterval = options.getBackgroundInterval();
      if (backgroundInterval) {
        options.clearInterval(backgroundInterval);
        options.setBackgroundInterval?.(undefined);
      }
      options.stopUpdaterListeners();
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
