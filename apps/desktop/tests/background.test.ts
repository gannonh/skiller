import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import type { SkillerConfig } from "@skiller/core";

const config: SkillerConfig = {
  libraryPath: "~/persisted-skiller",
  targetDirectories: ["~/skills"],
  updateSchedule: { intervalHours: 1 },
  keepAllSkillsUpdated: false,
  launchAtLogin: false,
  trayEnabled: true
};

describe("background jobs", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs update checks on the background interval", async () => {
    vi.useFakeTimers();
    const checkDesktopUpdates = vi.fn(async () => ({
      checkedAt: "2026-05-10T12:00:00.000Z",
      considered: [],
      available: [],
      updated: [],
      errors: []
    }));
    const close = vi.fn();
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      scanTargets: vi.fn(async () => ({ imported: [], enabled: [], errors: [] })),
      watchTargetDirectories: vi.fn(() => ({ close }) as never),
      createUpdateInterval: (schedule, callback) => setInterval(callback, schedule.intervalHours * 60 * 60 * 1000),
      checkDesktopUpdates
    });

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(checkDesktopUpdates).toHaveBeenCalledTimes(1);
    expect(window.webContents.send).toHaveBeenCalledWith(
      "background:updates-checked",
      expect.objectContaining({ checkedAt: "2026-05-10T12:00:00.000Z" })
    );

    jobs.forEach((job) => job.stop());
  });

  it("reloads persisted config for watcher-triggered scans", async () => {
    const updatedConfig: SkillerConfig = {
      ...config,
      libraryPath: "~/updated-skiller",
      targetDirectories: ["~/updated-skills"]
    };
    const loadConfig = vi.fn().mockResolvedValueOnce(config).mockResolvedValueOnce(config).mockResolvedValueOnce(updatedConfig);
    const scanTargets = vi.fn(async () => ({ imported: [], enabled: [], errors: [] }));
    const close = vi.fn();
    let onChange: (() => void) | undefined;
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig,
      expandHome: (value) => value.replace("~", "/home/test"),
      scanTargets,
      watchTargetDirectories: vi.fn((_config, callback) => {
        onChange = callback;
        return { close } as never;
      }),
      createUpdateInterval: (schedule, callback) => setInterval(callback, schedule.intervalHours * 60 * 60 * 1000),
      checkDesktopUpdates: vi.fn()
    });

    onChange?.();
    for (let index = 0; index < 5; index += 1) {
      await Promise.resolve();
    }

    expect(scanTargets).toHaveBeenNthCalledWith(1, {
      libraryPath: "/home/test/persisted-skiller",
      targetDirectories: ["/home/test/skills"]
    });
    expect(scanTargets).toHaveBeenNthCalledWith(2, {
      libraryPath: "/home/test/updated-skiller",
      targetDirectories: ["/home/test/updated-skills"]
    });

    jobs.forEach((job) => job.stop());
  });

  it("sends scan and update errors to the renderer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const close = vi.fn();
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      scanTargets: vi.fn(async () => {
        throw new Error("scan failed");
      }),
      watchTargetDirectories: vi.fn(() => ({ close }) as never),
      createUpdateInterval: (_schedule, callback) => {
        callback();
        return setInterval(() => undefined, 60_000);
      },
      checkDesktopUpdates: vi.fn(async () => {
        throw "update failed";
      })
    });

    await vi.waitFor(() => {
      expect(window.webContents.send).toHaveBeenCalledWith("background:scan-error", { message: "scan failed" });
      expect(window.webContents.send).toHaveBeenCalledWith("background:update-error", { message: "update failed" });
    });

    jobs.forEach((job) => job.stop());
  });

  it("normalizes alternate scan and update error types", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const close = vi.fn();
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      scanTargets: vi.fn(async () => {
        throw "scan failed";
      }),
      watchTargetDirectories: vi.fn(() => ({ close }) as never),
      createUpdateInterval: (_schedule, callback) => {
        callback();
        return setInterval(() => undefined, 60_000);
      },
      checkDesktopUpdates: vi.fn(async () => {
        throw new Error("update failed");
      })
    });

    await vi.waitFor(() => {
      expect(window.webContents.send).toHaveBeenCalledWith("background:scan-error", { message: "scan failed" });
      expect(window.webContents.send).toHaveBeenCalledWith("background:update-error", { message: "update failed" });
    });

    jobs.forEach((job) => job.stop());
  });
});
