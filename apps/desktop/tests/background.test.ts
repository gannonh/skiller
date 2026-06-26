import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import type { SkillerConfig } from "@skiller/core";
import { isTransientWatcherError } from "../src/main/background.js";

const config: SkillerConfig = {
  libraryPath: "~/persisted-skiller",
  targets: [{ path: "~/skills", enabled: true }],
  globalTargetInstallMode: "symlink",
  projectTargetInstallMode: "symlink",
  updateSchedule: { intervalHours: 1 },
  keepAllSkillsUpdated: false,
  launchAtLogin: false,
  trayEnabled: true
};

function metadataStoreMock() {
  return vi.fn(() => ({ pruneMissing: vi.fn(async () => []), libraryState: vi.fn(async () => ({ skills: [], skillSets: [], tags: [] })) })) as never;
}

describe("isTransientWatcherError", () => {
  it.each([
    [Object.assign(new Error("EINVAL: invalid argument, watch"), { code: "EINVAL" }), true],
    [new Error("EINVAL: invalid argument, watch '/home/test/skills'"), true],
    [Object.assign(new Error("path missing"), { code: "ENOENT" }), true],
    [new Error("permission denied"), false]
  ])("classifies watcher errors", (error, expected) => {
    expect(isTransientWatcherError(error)).toBe(expected);
  });
});

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
      metadataStore: metadataStoreMock(),
      repairLibrary: vi.fn(async () => ({ checkedAt: "t", repaired: [], skipped: [], errors: [] })),
      scanTargets: vi.fn(async () => ({ imported: [], enabled: [], disabled: [], errors: [] })),
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
    vi.useFakeTimers();
    const updatedConfig: SkillerConfig = {
      ...config,
      libraryPath: "~/updated-skiller",
      targets: [{ path: "~/updated-skills", enabled: true }]
    };
    const loadConfig = vi
      .fn()
      // 1) startBackgroundJobs top-level, 2) startup repair, 3) initial scan,
      // 4) watcher-triggered scan reloads the updated config.
      .mockResolvedValueOnce(config)
      .mockResolvedValueOnce(config)
      .mockResolvedValueOnce(config)
      .mockResolvedValueOnce(updatedConfig);
    const scanTargets = vi.fn(async () => ({ imported: [], enabled: [], disabled: [], errors: [] }));
    const close = vi.fn();
    let onChange: ((filePath: string) => void) | undefined;
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig,
      expandHome: (value) => value.replace("~", "/home/test"),
      metadataStore: metadataStoreMock(),
      repairLibrary: vi.fn(async () => ({ checkedAt: "t", repaired: [], skipped: [], errors: [] })),
      scanTargets,
      watchTargetDirectories: vi.fn((_config, callback) => {
        onChange = callback;
        return { close } as never;
      }),
      createUpdateInterval: (schedule, callback) => setInterval(callback, schedule.intervalHours * 60 * 60 * 1000),
      checkDesktopUpdates: vi.fn()
    });

    // Let the initial full scan complete and the watcher grace period expire.
    await vi.advanceTimersByTimeAsync(800);
    onChange?.("/home/test/skills/some-skill");
    await vi.advanceTimersByTimeAsync(250);
    for (let index = 0; index < 5; index += 1) {
      await Promise.resolve();
    }

    expect(scanTargets).toHaveBeenNthCalledWith(1, {
      libraryPath: "/home/test/persisted-skiller",
      targets: [{ path: "~/skills", enabled: true }],
      skillSets: [],
      globalTargetInstallMode: "symlink",
      projectTargetInstallMode: "symlink"
    });
    // Watcher-triggered scans are import-only to avoid the feedback loop.
    expect(scanTargets).toHaveBeenNthCalledWith(2, {
      libraryPath: "/home/test/updated-skiller",
      targets: [{ path: "~/updated-skills", enabled: true }],
      skillSets: [],
      globalTargetInstallMode: "symlink",
      projectTargetInstallMode: "symlink",
      importOnly: true
    });

    jobs.forEach((job) => job.stop());
    vi.useRealTimers();
  });

  it("prunes missing library records before startup scans", async () => {
    const pruneMissing = vi.fn(async () => []);
    const scanTargets = vi.fn(async () => ({ imported: [], enabled: [], disabled: [], errors: [] }));
    const close = vi.fn();
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      metadataStore: vi.fn(() => ({ pruneMissing, libraryState: vi.fn(async () => ({ skills: [], skillSets: [], tags: [] })) })) as never,
      repairLibrary: vi.fn(async () => ({ checkedAt: "t", repaired: [], skipped: [], errors: [] })),
      scanTargets,
      watchTargetDirectories: vi.fn(() => ({ close }) as never),
      createUpdateInterval: (schedule, callback) => setInterval(callback, schedule.intervalHours * 60 * 60 * 1000),
      checkDesktopUpdates: vi.fn()
    });

    await vi.waitFor(() => expect(scanTargets).toHaveBeenCalledTimes(1));
    expect(pruneMissing).toHaveBeenCalledTimes(1);
    expect(pruneMissing.mock.invocationCallOrder[0]).toBeLessThan(scanTargets.mock.invocationCallOrder[0]);

    jobs.forEach((job) => job.stop());
  });

  it("repairs the library on startup and notifies the renderer", async () => {
    const scanTargets = vi.fn(async () => ({ imported: [], enabled: [], disabled: [], errors: [] }));
    const repairLibrary = vi.fn(async () => ({
      checkedAt: "t",
      repaired: [{ id: "okf", reason: "empty-folder", status: "repaired" }],
      skipped: [],
      errors: []
    }));
    const close = vi.fn();
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      metadataStore: metadataStoreMock(),
      repairLibrary: repairLibrary as never,
      scanTargets,
      watchTargetDirectories: vi.fn(() => ({ close }) as never),
      createUpdateInterval: (schedule, callback) => setInterval(callback, schedule.intervalHours * 60 * 60 * 1000),
      checkDesktopUpdates: vi.fn()
    });

    await vi.waitFor(() => expect(scanTargets).toHaveBeenCalledTimes(1));
    expect(repairLibrary).toHaveBeenCalledTimes(1);
    // Repair runs before the initial scan distributes restored skills.
    expect(repairLibrary.mock.invocationCallOrder[0]).toBeLessThan(scanTargets.mock.invocationCallOrder[0]);
    expect(window.webContents.send).toHaveBeenCalledWith("background:library-repaired", {
      repaired: 1,
      skipped: 0,
      errors: 0
    });

    jobs.forEach((job) => job.stop());
  });

  it("does not notify when startup repair finds nothing to fix", async () => {
    const scanTargets = vi.fn(async () => ({ imported: [], enabled: [], disabled: [], errors: [] }));
    const repairLibrary = vi.fn(async () => ({ checkedAt: "t", repaired: [], skipped: [], errors: [] }));
    const close = vi.fn();
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      metadataStore: metadataStoreMock(),
      repairLibrary: repairLibrary as never,
      scanTargets,
      watchTargetDirectories: vi.fn(() => ({ close }) as never),
      createUpdateInterval: (schedule, callback) => setInterval(callback, schedule.intervalHours * 60 * 60 * 1000),
      checkDesktopUpdates: vi.fn()
    });

    // Wait for startup to finish (repair then scan).
    await vi.waitFor(() => expect(scanTargets).toHaveBeenCalledTimes(1));
    expect(repairLibrary).toHaveBeenCalledTimes(1);
    expect(window.webContents.send).not.toHaveBeenCalledWith("background:library-repaired", expect.anything());

    jobs.forEach((job) => job.stop());
  });

  it("notifies the renderer when startup repair reports only errors", async () => {
    const scanTargets = vi.fn(async () => ({ imported: [], enabled: [], disabled: [], errors: [] }));
    const repairLibrary = vi.fn(async () => ({
      checkedAt: "t",
      repaired: [],
      skipped: [],
      errors: [{ id: "okf", reason: "empty-folder", status: "error", message: "boom" }]
    }));
    const close = vi.fn();
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      metadataStore: metadataStoreMock(),
      repairLibrary: repairLibrary as never,
      scanTargets,
      watchTargetDirectories: vi.fn(() => ({ close }) as never),
      createUpdateInterval: (schedule, callback) => setInterval(callback, schedule.intervalHours * 60 * 60 * 1000),
      checkDesktopUpdates: vi.fn()
    });

    await vi.waitFor(() => {
      expect(window.webContents.send).toHaveBeenCalledWith("background:library-repaired", {
        repaired: 0,
        skipped: 0,
        errors: 1
      });
    });

    jobs.forEach((job) => job.stop());
  });

  it("reports startup library repair failures without blocking the scan", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const scanTargets = vi.fn(async () => ({ imported: [], enabled: [], disabled: [], errors: [] }));
    const close = vi.fn();
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      metadataStore: metadataStoreMock(),
      repairLibrary: vi.fn(async () => {
        throw new Error("repair failed");
      }) as never,
      scanTargets,
      watchTargetDirectories: vi.fn(() => ({ close }) as never),
      createUpdateInterval: (schedule, callback) => setInterval(callback, schedule.intervalHours * 60 * 60 * 1000),
      checkDesktopUpdates: vi.fn()
    });

    await vi.waitFor(() => {
      expect(window.webContents.send).toHaveBeenCalledWith("background:scan-error", { message: "repair failed" });
    });
    // The scan still runs even though repair failed.
    await vi.waitFor(() => expect(scanTargets).toHaveBeenCalledTimes(1));

    jobs.forEach((job) => job.stop());
  });

  it("stringifies non-Error startup repair failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const scanTargets = vi.fn(async () => ({ imported: [], enabled: [], disabled: [], errors: [] }));
    const close = vi.fn();
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      metadataStore: metadataStoreMock(),
      repairLibrary: vi.fn(async () => {
        throw "repair failed";
      }) as never,
      scanTargets,
      watchTargetDirectories: vi.fn(() => ({ close }) as never),
      createUpdateInterval: (schedule, callback) => setInterval(callback, schedule.intervalHours * 60 * 60 * 1000),
      checkDesktopUpdates: vi.fn()
    });

    await vi.waitFor(() => {
      expect(window.webContents.send).toHaveBeenCalledWith("background:scan-error", { message: "repair failed" });
    });

    jobs.forEach((job) => job.stop());
  });

  it("sends scan and update errors to the renderer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const close = vi.fn();
    let onWatcherError: ((error: unknown) => void) | undefined;
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      metadataStore: metadataStoreMock(),
      repairLibrary: vi.fn(async () => ({ checkedAt: "t", repaired: [], skipped: [], errors: [] })),
      scanTargets: vi.fn(async () => {
        throw new Error("scan failed");
      }),
      watchTargetDirectories: vi.fn((_config, _onChange, onError) => {
        onWatcherError = onError;
        return { close } as never;
      }),
      createUpdateInterval: (_schedule, callback) => {
        callback();
        return setInterval(() => undefined, 60_000);
      },
      checkDesktopUpdates: vi.fn(async () => {
        throw "update failed";
      })
    });

    onWatcherError?.(new Error("watch failed"));
    onWatcherError?.("watch failed again");
    await vi.waitFor(() => {
      expect(window.webContents.send).toHaveBeenCalledWith("background:scan-error", { message: "scan failed" });
      expect(window.webContents.send).toHaveBeenCalledWith("background:scan-error", { message: "watch failed" });
      expect(window.webContents.send).toHaveBeenCalledWith("background:scan-error", { message: "watch failed again" });
      expect(window.webContents.send).toHaveBeenCalledWith("background:update-error", { message: "update failed" });
    });

    jobs.forEach((job) => job.stop());
  });

  it("ignores transient watcher EINVAL errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const close = vi.fn();
    let onWatcherError: ((error: unknown) => void) | undefined;
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      metadataStore: metadataStoreMock(),
      repairLibrary: vi.fn(async () => ({ checkedAt: "t", repaired: [], skipped: [], errors: [] })),
      scanTargets: vi.fn(async () => ({ imported: [], enabled: [], disabled: [], errors: [] })),
      watchTargetDirectories: vi.fn((_config, _onChange, onError) => {
        onWatcherError = onError;
        return { close } as never;
      }),
      createUpdateInterval: (schedule, callback) => setInterval(callback, schedule.intervalHours * 60 * 60 * 1000),
      checkDesktopUpdates: vi.fn()
    });

    onWatcherError?.(Object.assign(new Error("EINVAL: invalid argument, watch"), { code: "EINVAL" }));

    expect(window.webContents.send).not.toHaveBeenCalledWith("background:scan-error", expect.anything());

    jobs.forEach((job) => job.stop());
  });

  it("ignores watcher EINVAL errors reported only in the message", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const close = vi.fn();
    let onWatcherError: ((error: unknown) => void) | undefined;
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      metadataStore: metadataStoreMock(),
      repairLibrary: vi.fn(async () => ({ checkedAt: "t", repaired: [], skipped: [], errors: [] })),
      scanTargets: vi.fn(async () => ({ imported: [], enabled: [], disabled: [], errors: [] })),
      watchTargetDirectories: vi.fn((_config, _onChange, onError) => {
        onWatcherError = onError;
        return { close } as never;
      }),
      createUpdateInterval: (schedule, callback) => setInterval(callback, schedule.intervalHours * 60 * 60 * 1000),
      checkDesktopUpdates: vi.fn()
    });

    onWatcherError?.(new Error("EINVAL: invalid argument, watch '/home/test/skills/example/references'"));

    expect(window.webContents.send).not.toHaveBeenCalledWith("background:scan-error", expect.anything());

    jobs.forEach((job) => job.stop());
  });

  it("ignores transient watcher errors identified only by errno code", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const close = vi.fn();
    let onWatcherError: ((error: unknown) => void) | undefined;
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      metadataStore: metadataStoreMock(),
      repairLibrary: vi.fn(async () => ({ checkedAt: "t", repaired: [], skipped: [], errors: [] })),
      scanTargets: vi.fn(async () => ({ imported: [], enabled: [], disabled: [], errors: [] })),
      watchTargetDirectories: vi.fn((_config, _onChange, onError) => {
        onWatcherError = onError;
        return { close } as never;
      }),
      createUpdateInterval: (schedule, callback) => setInterval(callback, schedule.intervalHours * 60 * 60 * 1000),
      checkDesktopUpdates: vi.fn()
    });

    onWatcherError?.(Object.assign(new Error("invalid argument, watch"), { code: "EINVAL" }));

    expect(window.webContents.send).not.toHaveBeenCalledWith("background:scan-error", expect.anything());

    jobs.forEach((job) => job.stop());
  });

  it("ignores transient watcher ENOENT errors identified only by errno code", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const close = vi.fn();
    let onWatcherError: ((error: unknown) => void) | undefined;
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      metadataStore: metadataStoreMock(),
      repairLibrary: vi.fn(async () => ({ checkedAt: "t", repaired: [], skipped: [], errors: [] })),
      scanTargets: vi.fn(async () => ({ imported: [], enabled: [], disabled: [], errors: [] })),
      watchTargetDirectories: vi.fn((_config, _onChange, onError) => {
        onWatcherError = onError;
        return { close } as never;
      }),
      createUpdateInterval: (schedule, callback) => setInterval(callback, schedule.intervalHours * 60 * 60 * 1000),
      checkDesktopUpdates: vi.fn()
    });

    onWatcherError?.(Object.assign(new Error("path missing"), { code: "ENOENT" }));

    expect(window.webContents.send).not.toHaveBeenCalledWith("background:scan-error", expect.anything());

    jobs.forEach((job) => job.stop());
  });

  it("coalesces rapid watcher events into one debounced scan", async () => {
    vi.useFakeTimers();
    const scanTargets = vi.fn(async () => ({ imported: [], enabled: [], disabled: [], errors: [] }));
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const close = vi.fn();
    let onChange: ((filePath: string) => void) | undefined;
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      metadataStore: metadataStoreMock(),
      repairLibrary: vi.fn(async () => ({ checkedAt: "t", repaired: [], skipped: [], errors: [] })),
      scanTargets,
      watchTargetDirectories: vi.fn((_config, callback) => {
        onChange = callback;
        return { close } as never;
      }),
      createUpdateInterval: (schedule, callback) => setInterval(callback, schedule.intervalHours * 60 * 60 * 1000),
      checkDesktopUpdates: vi.fn()
    });

    // Let the initial scan complete and the watcher grace period expire.
    await vi.advanceTimersByTimeAsync(800);
    onChange?.("/home/test/skills/some-skill");
    onChange?.("/home/test/skills/another-skill");
    await vi.advanceTimersByTimeAsync(250);
    for (let index = 0; index < 5; index += 1) {
      await Promise.resolve();
    }

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(scanTargets).toHaveBeenCalledTimes(2);

    jobs.forEach((job) => job.stop());
    clearTimeoutSpy.mockRestore();
    vi.useRealTimers();
  });

  it("suppresses watcher-triggered scans while a scan is already running", async () => {
    vi.useFakeTimers();
    let releaseScan: (() => void) | undefined;
    const scanTargets = vi.fn(
      () =>
        new Promise<{ imported: never[]; enabled: never[]; disabled: never[]; errors: never[] }>((resolve) => {
          releaseScan = () => resolve({ imported: [], enabled: [], disabled: [], errors: [] });
        })
    );
    const close = vi.fn();
    let onChange: ((filePath: string) => void) | undefined;
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      metadataStore: metadataStoreMock(),
      repairLibrary: vi.fn(async () => ({ checkedAt: "t", repaired: [], skipped: [], errors: [] })),
      scanTargets,
      watchTargetDirectories: vi.fn((_config, callback) => {
        onChange = callback;
        return { close } as never;
      }),
      createUpdateInterval: (schedule, callback) => setInterval(callback, schedule.intervalHours * 60 * 60 * 1000),
      checkDesktopUpdates: vi.fn()
    });

    await vi.advanceTimersByTimeAsync(250);
    expect(scanTargets).toHaveBeenCalledTimes(1);

    // Watcher event during the scan is suppressed (not queued) to break the
    // feedback loop where scanner filesystem operations re-trigger the watcher.
    onChange?.("/home/test/skills/some-skill");
    await vi.advanceTimersByTimeAsync(250);
    expect(scanTargets).toHaveBeenCalledTimes(1);

    releaseScan?.();
    for (let index = 0; index < 5; index += 1) {
      await Promise.resolve();
    }

    // The scan completed but the watcher event was suppressed, so no queued
    // scan runs. Only the grace period timer fires.
    expect(scanTargets).toHaveBeenCalledTimes(1);

    jobs.forEach((job) => job.stop());
    vi.useRealTimers();
  });

  it("cleans up grace timer on stop", async () => {
    const scanTargets = vi.fn(async () => ({ imported: [], enabled: [], disabled: [], errors: [] }));
    const close = vi.fn();
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      metadataStore: metadataStoreMock(),
      repairLibrary: vi.fn(async () => ({ checkedAt: "t", repaired: [], skipped: [], errors: [] })),
      scanTargets,
      watchTargetDirectories: vi.fn(() => ({ close }) as never),
      createUpdateInterval: (schedule, callback) => setInterval(callback, schedule.intervalHours * 60 * 60 * 1000),
      checkDesktopUpdates: vi.fn()
    });

    // Wait for the scan to complete and the finally block to set the grace timer.
    await vi.waitFor(() => expect(scanTargets).toHaveBeenCalledTimes(1));
    // Give microtasks time to flush so the finally block runs (sets grace timer).
    // 100ms is well within the 500ms grace period, so the timer is still active.
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Stop while the 500ms grace timer is still active.
    jobs.forEach((job) => job.stop());
  });

  it("cleans up debounce timer on stop", async () => {
    const scanTargets = vi.fn(async () => ({ imported: [], enabled: [], disabled: [], errors: [] }));
    const close = vi.fn();
    let onChange: ((filePath: string) => void) | undefined;
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const { startBackgroundJobs } = await import("../src/main/background.js");

    const jobs = await startBackgroundJobs(window, {
      loadConfig: async () => config,
      expandHome: (value) => value.replace("~", "/home/test"),
      metadataStore: metadataStoreMock(),
      repairLibrary: vi.fn(async () => ({ checkedAt: "t", repaired: [], skipped: [], errors: [] })),
      scanTargets,
      watchTargetDirectories: vi.fn((_config, callback) => {
        onChange = callback;
        return { close } as never;
      }),
      createUpdateInterval: (schedule, callback) => setInterval(callback, schedule.intervalHours * 60 * 60 * 1000),
      checkDesktopUpdates: vi.fn()
    });

    // Wait for the scan to complete and the 500ms grace period to expire.
    await vi.waitFor(() => expect(scanTargets).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Trigger a watcher event (sets the 250ms debounce timer).
    onChange?.("/home/test/skills/some-skill");

    // Stop immediately while the debounce timer is still active.
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
      metadataStore: metadataStoreMock(),
      repairLibrary: vi.fn(async () => ({ checkedAt: "t", repaired: [], skipped: [], errors: [] })),
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
