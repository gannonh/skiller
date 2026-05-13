import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppUpdater, ProgressInfo, UpdateInfo } from "electron-updater";

const mockAutoUpdater = vi.hoisted(() => ({
  autoDownload: false,
  autoInstallOnAppQuit: true,
  on: vi.fn(),
  off: vi.fn(),
  checkForUpdates: vi.fn(async () => undefined),
  downloadUpdate: vi.fn(async () => []),
  quitAndInstall: vi.fn()
}));

vi.mock("electron", () => ({
  app: { isPackaged: true }
}));

vi.mock("electron-updater", () => ({
  default: {
    autoUpdater: mockAutoUpdater
  }
}));

class FakeUpdater extends EventEmitter {
  autoDownload = false;
  autoInstallOnAppQuit = true;
  checkForUpdates = vi.fn(async () => undefined);
  downloadUpdate = vi.fn(async () => []);
  quitAndInstall = vi.fn();
}

function createSupportedDeps(updater = new FakeUpdater()) {
  return {
    updater: updater as unknown as AppUpdater,
    isPackaged: true,
    platform: "darwin" as NodeJS.Platform,
    env: {},
    setInterval: vi.fn(() => 12 as unknown as NodeJS.Timeout),
    clearInterval: vi.fn()
  };
}

describe("app update service", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("exposes the default auto updater", async () => {
    const { createAppUpdateService, getAutoUpdater } = await import("../src/main/app-update.js");

    expect(getAutoUpdater()).toBe(mockAutoUpdater);
    await createAppUpdateService({ platform: "darwin" }).checkNow();

    expect(mockAutoUpdater.autoDownload).toBe(false);
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(false);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("uses runtime defaults when dependencies are omitted", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");

    expect(createAppUpdateService({ updater: new FakeUpdater(), isPackaged: false }).getState()).toEqual({ status: "unsupported" });
  });

  it("reports unsupported for development builds", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const deps = createSupportedDeps();
    const service = createAppUpdateService({ ...deps, isPackaged: false });

    expect(service.getState()).toEqual({ status: "unsupported" });
    await expect(service.checkNow()).resolves.toEqual({ status: "unsupported" });
    expect(deps.updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("reports unsupported for Linux runs outside AppImage", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const deps = createSupportedDeps();
    const service = createAppUpdateService({ ...deps, platform: "linux", env: {} });

    expect(service.getState()).toEqual({ status: "unsupported" });
    await service.startBackgroundChecks();
    expect(deps.updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("keeps unsupported services unchanged when updater events fire", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    updater.on("error", () => undefined);
    const service = createAppUpdateService({ ...createSupportedDeps(updater), isPackaged: false });
    const states: unknown[] = [];
    service.subscribe((state) => states.push(state));

    updater.emit("checking-for-update");
    updater.emit("update-available", { version: "0.2.2" } satisfies Partial<UpdateInfo>);
    updater.emit("download-progress", { percent: 64, transferred: 64, total: 100, bytesPerSecond: 10 } satisfies ProgressInfo);
    updater.emit("update-downloaded", { version: "0.2.2" } satisfies Partial<UpdateInfo>);
    updater.emit("update-not-available");
    updater.emit("error", new Error("metadata missing"));
    service.stop();

    expect(service.getState()).toEqual({ status: "unsupported" });
    expect(states).toEqual([]);
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
  });

  it("supports Linux AppImage builds only", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const linuxDeps = createSupportedDeps();
    const linuxService = createAppUpdateService({ ...linuxDeps, platform: "linux", env: { APPIMAGE: "/tmp/Skiller.AppImage" } });
    const windowsDeps = createSupportedDeps();
    const windowsService = createAppUpdateService({ ...windowsDeps, platform: "win32" });

    await linuxService.checkNow();
    await windowsService.checkNow();

    expect(linuxDeps.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(windowsService.getState()).toEqual({ status: "unsupported" });
    expect(windowsDeps.updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("starts background checks for supported builds", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const deps = createSupportedDeps();
    const service = createAppUpdateService(deps);

    await service.startBackgroundChecks();

    expect(deps.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(deps.setInterval).toHaveBeenCalledWith(expect.any(Function), 4 * 60 * 60 * 1000);
  });

  it("runs scheduled checks and clears the background interval", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const deps = createSupportedDeps();
    const service = createAppUpdateService(deps);

    await service.startBackgroundChecks();
    await service.startBackgroundChecks();
    const runScheduledCheck = deps.setInterval.mock.calls[0]?.[0] as () => void;
    runScheduledCheck();
    service.stop();
    service.stop();

    expect(deps.updater.checkForUpdates).toHaveBeenCalledTimes(3);
    expect(deps.setInterval).toHaveBeenCalledTimes(1);
    expect(deps.clearInterval).toHaveBeenCalledWith(12);
  });

  it("does not keep an interval when stopped during the first background check", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    let finishCheck!: () => void;
    updater.checkForUpdates.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishCheck = resolve;
    }));
    const deps = createSupportedDeps(updater);
    const service = createAppUpdateService(deps);

    const backgroundStart = service.startBackgroundChecks();
    service.stop();
    finishCheck();
    await backgroundStart;

    expect(deps.setInterval).not.toHaveBeenCalled();
    expect(deps.clearInterval).not.toHaveBeenCalled();
  });

  it("does not emit or log when a stopped initial check rejects", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    let rejectCheck!: (error: Error) => void;
    updater.checkForUpdates.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
      rejectCheck = reject;
    }));
    const service = createAppUpdateService(createSupportedDeps(updater));
    const states: unknown[] = [];
    service.subscribe((state) => states.push(state));

    const backgroundStart = service.startBackgroundChecks();
    service.stop();
    rejectCheck(new Error("metadata missing"));
    await backgroundStart;

    expect(service.getState()).toEqual({ status: "idle" });
    expect(states).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("does not restart after stop", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const deps = createSupportedDeps();
    const service = createAppUpdateService(deps);

    service.stop();
    await service.checkNow();
    await service.startBackgroundChecks();

    expect(service.getState()).toEqual({ status: "idle" });
    expect(deps.updater.checkForUpdates).not.toHaveBeenCalled();
    expect(deps.setInterval).not.toHaveBeenCalled();
  });

  it("reports when no update is available and allows unsubscribe", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    const service = createAppUpdateService(createSupportedDeps(updater));
    const states: unknown[] = [];
    const unsubscribe = service.subscribe((state) => states.push(state));

    updater.emit("update-not-available");
    unsubscribe();
    updater.emit("checking-for-update");

    expect(service.getState()).toEqual({ status: "checking" });
    expect(states).toEqual([{ status: "not-available" }]);
  });

  it("preserves downloaded readiness during later update checks", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    const service = createAppUpdateService(createSupportedDeps(updater));
    const states: unknown[] = [];
    service.subscribe((state) => states.push(state));

    updater.emit("update-downloaded", { version: "0.2.2" } satisfies Partial<UpdateInfo>);
    updater.emit("checking-for-update");
    updater.emit("update-not-available");
    updater.emit("download-progress", { percent: 32, transferred: 32, total: 100, bytesPerSecond: 10 } satisfies ProgressInfo);
    updater.emit("update-available", { version: "0.2.3" } satisfies Partial<UpdateInfo>);
    updater.emit("error", new Error("network down"));

    expect(service.getState()).toEqual({ status: "ready", version: "0.2.2" });
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(states).toEqual([{ status: "ready", version: "0.2.2" }]);
  });

  it("reports progress without metadata when no update metadata is available", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    const service = createAppUpdateService(createSupportedDeps(updater));

    updater.emit("download-progress", { percent: 64, transferred: 64, total: 100, bytesPerSecond: 10 } satisfies ProgressInfo);

    expect(service.getState()).toEqual({ status: "downloading", progress: 64 });
  });

  it("downloads available updates and reports readiness", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    const service = createAppUpdateService(createSupportedDeps(updater));
    const states: unknown[] = [];
    service.subscribe((state) => states.push(state));

    updater.emit("checking-for-update");
    updater.emit("update-available", { version: "0.2.2", releaseName: "Skiller Desktop v0.2.2" } satisfies Partial<UpdateInfo>);
    updater.emit("download-progress", { percent: 64, transferred: 64, total: 100, bytesPerSecond: 10 } satisfies ProgressInfo);
    updater.emit("update-downloaded", {
      version: "0.2.2",
      releaseName: "Skiller Desktop v0.2.2",
      releaseDate: "2026-05-12T22:00:00.000Z"
    } satisfies Partial<UpdateInfo>);

    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(service.getState()).toEqual({
      status: "ready",
      version: "0.2.2",
      releaseName: "Skiller Desktop v0.2.2",
      releaseDate: "2026-05-12T22:00:00.000Z"
    });
    expect(states).toContainEqual(expect.objectContaining({ status: "checking" }));
    expect(states).toContainEqual(expect.objectContaining({
      status: "downloading",
      progress: 0,
      version: "0.2.2",
      releaseName: "Skiller Desktop v0.2.2"
    }));
    expect(states).toContainEqual(expect.objectContaining({
      status: "downloading",
      progress: 64,
      version: "0.2.2",
      releaseName: "Skiller Desktop v0.2.2"
    }));
    expect(states).toContainEqual(expect.objectContaining({ status: "ready", version: "0.2.2" }));
  });

  it("reports downloading immediately when an update is available", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    const service = createAppUpdateService(createSupportedDeps(updater));
    const states: unknown[] = [];
    service.subscribe((state) => states.push(state));

    updater.emit("update-available", {
      version: "0.2.2",
      releaseName: "Skiller Desktop v0.2.2",
      releaseDate: "2026-05-12T22:00:00.000Z"
    } satisfies Partial<UpdateInfo>);
    updater.emit("update-downloaded", {
      version: "0.2.2",
      releaseName: "Skiller Desktop v0.2.2",
      releaseDate: "2026-05-12T22:00:00.000Z"
    } satisfies Partial<UpdateInfo>);

    expect(states).toEqual([
      {
        status: "downloading",
        progress: 0,
        version: "0.2.2",
        releaseName: "Skiller Desktop v0.2.2",
        releaseDate: "2026-05-12T22:00:00.000Z"
      },
      {
        status: "ready",
        version: "0.2.2",
        releaseName: "Skiller Desktop v0.2.2",
        releaseDate: "2026-05-12T22:00:00.000Z"
      }
    ]);
  });

  it("does not auto-install downloaded updates on normal app quit", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();

    createAppUpdateService(createSupportedDeps(updater));

    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
  });

  it("guards install until an update is ready", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    const service = createAppUpdateService(createSupportedDeps(updater));

    await expect(service.installReadyUpdate()).rejects.toThrow("No downloaded app update is ready to install");
    updater.emit("update-downloaded", { version: "0.2.2" } satisfies Partial<UpdateInfo>);

    await service.installReadyUpdate();

    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("does not install after stop", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    const service = createAppUpdateService(createSupportedDeps(updater));

    updater.emit("update-downloaded", { version: "0.2.2" } satisfies Partial<UpdateInfo>);
    service.stop();

    await expect(service.installReadyUpdate()).rejects.toThrow("App update service has been stopped");
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("reports updater errors without throwing from event listeners", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    const service = createAppUpdateService(createSupportedDeps(updater));

    updater.emit("error", new Error("metadata missing"));

    expect(service.getState()).toEqual({ status: "error", error: "metadata missing" });
  });

  it("reports failed checks and failed downloads", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    updater.checkForUpdates.mockRejectedValueOnce("network down");
    updater.downloadUpdate.mockRejectedValueOnce(new Error("asset missing"));
    const service = createAppUpdateService(createSupportedDeps(updater));

    await service.checkNow();
    expect(service.getState()).toEqual({ status: "error", error: "network down" });

    updater.emit("update-available", { version: "0.2.2" } satisfies Partial<UpdateInfo>);
    await Promise.resolve();

    expect(service.getState()).toEqual({ status: "error", error: "asset missing" });
  });

  it("deduplicates updater error events and rejected checks for one failed operation", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    updater.checkForUpdates.mockImplementationOnce(async () => {
      updater.emit("error", new Error("metadata missing"));
      throw new Error("metadata missing");
    });
    const service = createAppUpdateService(createSupportedDeps(updater));
    const states: unknown[] = [];
    service.subscribe((state) => states.push(state));

    await service.checkNow();

    expect(service.getState()).toEqual({ status: "error", error: "metadata missing" });
    expect(states).toEqual([{ status: "error", error: "metadata missing" }]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("deduplicates updater error events and rejected downloads for one failed operation", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    updater.downloadUpdate.mockImplementationOnce(async () => {
      updater.emit("error", new Error("asset missing"));
      throw new Error("asset missing");
    });
    const service = createAppUpdateService(createSupportedDeps(updater));
    const states: unknown[] = [];
    service.subscribe((state) => states.push(state));

    updater.emit("update-available", { version: "0.2.2" } satisfies Partial<UpdateInfo>);
    await Promise.resolve();

    expect(service.getState()).toEqual({ status: "error", error: "asset missing" });
    expect(states).toEqual([
      { status: "downloading", progress: 0, version: "0.2.2" },
      { status: "error", error: "asset missing" }
    ]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("does not emit or log when a stopped download rejects", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    let rejectDownload!: (error: Error) => void;
    updater.downloadUpdate.mockImplementationOnce(() => new Promise<string[]>((_resolve, reject) => {
      rejectDownload = reject;
    }));
    const service = createAppUpdateService(createSupportedDeps(updater));
    const states: unknown[] = [];
    service.subscribe((state) => states.push(state));

    updater.emit("update-available", { version: "0.2.2" } satisfies Partial<UpdateInfo>);
    service.stop();
    rejectDownload(new Error("asset missing"));
    await Promise.resolve();

    expect(service.getState()).toEqual({ status: "downloading", progress: 0, version: "0.2.2" });
    expect(states).toEqual([{ status: "downloading", progress: 0, version: "0.2.2" }]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("unregisters updater listeners on stop", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    const service = createAppUpdateService(createSupportedDeps(updater));
    const states: unknown[] = [];
    service.subscribe((state) => states.push(state));
    const checkingListener = updater.listeners("checking-for-update")[0] as () => void;

    service.stop();
    updater.emit("checking-for-update");
    checkingListener();

    expect(states).toEqual([]);
    expect(service.getState()).toEqual({ status: "idle" });
  });

  it("clears subscriber listeners on stop", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    const service = createAppUpdateService(createSupportedDeps(updater));
    const states: unknown[] = [];
    service.subscribe((state) => states.push(state));

    service.stop();
    service.subscribe((state) => states.push(state));
    updater.emit("checking-for-update");

    expect(states).toEqual([]);
  });
});
