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
});
