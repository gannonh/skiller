import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const window = {
    loadFile: vi.fn(async () => undefined),
    loadURL: vi.fn(async () => undefined),
    isDestroyed: vi.fn(() => false),
    webContents: {
      isDestroyed: vi.fn(() => false),
      send: vi.fn()
    }
  };
  const tray = { destroy: vi.fn() };
  const backgroundCleanup = { stop: vi.fn() };
  const unsubscribe = vi.fn();
  const appUpdateService = {
    subscribe: vi.fn(() => unsubscribe),
    startBackgroundChecks: vi.fn(async () => ({ status: "idle" })),
    stop: vi.fn()
  };

  return {
    app: {
      dock: undefined,
      isPackaged: true,
      on: vi.fn(),
      setName: vi.fn(),
      whenReady: vi.fn()
    },
    appUpdateService,
    backgroundCleanup,
    beforeQuit: undefined as (() => void) | undefined,
    createAppUpdateService: vi.fn(() => appUpdateService),
    createTray: vi.fn(() => tray),
    ready: undefined as (() => Promise<void>) | undefined,
    registerIpcHandlers: vi.fn(),
    startBackgroundJobs: vi.fn(async () => [backgroundCleanup]),
    tray,
    unsubscribe,
    window
  };
});

vi.mock("electron", () => ({
  BrowserWindow: vi.fn(() => mocks.window),
  Tray: vi.fn(),
  app: mocks.app,
  nativeImage: {
    createFromPath: vi.fn(() => ({ isEmpty: vi.fn(() => true) }))
  }
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false)
}));

vi.mock("../src/main/app-update.js", () => ({
  createAppUpdateService: mocks.createAppUpdateService
}));

vi.mock("../src/main/background.js", () => ({
  startBackgroundJobs: mocks.startBackgroundJobs
}));

vi.mock("../src/main/ipc.js", () => ({
  registerIpcHandlers: mocks.registerIpcHandlers
}));

vi.mock("../src/main/tray.js", () => ({
  createTray: mocks.createTray
}));

describe("desktop main lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.ready = undefined;
    mocks.beforeQuit = undefined;
    mocks.window.isDestroyed.mockReturnValue(false);
    mocks.window.webContents.isDestroyed.mockReturnValue(false);
    mocks.app.whenReady.mockImplementation(() => ({
      then: (callback: () => Promise<void>) => {
        mocks.ready = callback;
        return Promise.resolve();
      }
    }));
    mocks.app.on.mockImplementation((event: string, callback: () => void) => {
      if (event === "before-quit") {
        mocks.beforeQuit = callback;
      }
      return mocks.app;
    });
  });

  it("wires app updates through main lifecycle and cleans up before quit", async () => {
    await import("../src/main/main.js");

    expect(mocks.app.setName).toHaveBeenCalledWith("Skiller");

    await mocks.ready?.();

    expect(mocks.createAppUpdateService).toHaveBeenCalledWith({ isPackaged: true });
    expect(mocks.registerIpcHandlers).toHaveBeenCalledWith({ appUpdateService: mocks.appUpdateService });
    expect(mocks.appUpdateService.subscribe).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.appUpdateService.startBackgroundChecks).toHaveBeenCalledTimes(1);

    const stateListener = mocks.appUpdateService.subscribe.mock.calls[0]?.[0];
    stateListener?.({ status: "ready", version: "0.2.2" });
    expect(mocks.window.webContents.send).toHaveBeenCalledWith("app-update:state", { status: "ready", version: "0.2.2" });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sendError = new Error("channel closed");
    mocks.window.webContents.send.mockImplementationOnce(() => {
      throw sendError;
    });
    expect(() => stateListener?.({ status: "ready", version: "0.2.3" })).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith("app-update:state send failed", sendError);

    mocks.window.isDestroyed.mockReturnValue(true);
    stateListener?.({ status: "ready", version: "0.2.4" });
    expect(mocks.window.webContents.send).toHaveBeenCalledTimes(2);

    mocks.window.isDestroyed.mockReturnValue(false);
    mocks.window.webContents.isDestroyed.mockReturnValue(true);
    stateListener?.({ status: "ready", version: "0.2.5" });
    expect(mocks.window.webContents.send).toHaveBeenCalledTimes(2);

    mocks.beforeQuit?.();

    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.appUpdateService.stop).toHaveBeenCalledTimes(1);
    expect(mocks.backgroundCleanup.stop).toHaveBeenCalledTimes(1);
    expect(mocks.tray.destroy).toHaveBeenCalledTimes(1);
  });
});
