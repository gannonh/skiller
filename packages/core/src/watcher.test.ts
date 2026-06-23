import { afterEach, describe, expect, it, vi } from "vitest";
import { createUpdateInterval, watchTargetDirectories } from "./watcher.js";

const mocks = vi.hoisted(() => {
  const watcher = {
    on: vi.fn()
  };
  watcher.on.mockReturnValue(watcher);
  const watch = vi.fn((_dirs: string[], _opts?: unknown) => watcher);

  return { watch, watcher };
});

vi.mock("chokidar", () => ({
  default: {
    watch: mocks.watch
  }
}));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("watchTargetDirectories", () => {
  it("watches target directories with scan-triggering file and directory events", () => {
    const onChange = vi.fn();
    const onError = vi.fn();

    watchTargetDirectories(["/skills"], onChange, onError);

    expect(mocks.watch).toHaveBeenCalledWith(["/skills"], {
      ignoreInitial: true,
      depth: 1,
      followSymlinks: false,
      awaitWriteFinish: true,
      ignored: expect.any(Function)
    });
    expect(mocks.watcher.on).toHaveBeenCalledTimes(6);
    expect(mocks.watcher.on).toHaveBeenNthCalledWith(1, "addDir", onChange);
    expect(mocks.watcher.on).toHaveBeenNthCalledWith(2, "unlinkDir", onChange);
    expect(mocks.watcher.on).toHaveBeenNthCalledWith(3, "change", onChange);
    expect(mocks.watcher.on).toHaveBeenNthCalledWith(4, "add", onChange);
    expect(mocks.watcher.on).toHaveBeenNthCalledWith(5, "unlink", onChange);
    expect(mocks.watcher.on).toHaveBeenNthCalledWith(6, "error", expect.any(Function));

    const errorHandler = mocks.watcher.on.mock.calls[5]?.[1] as (error: unknown) => void;
    const error = new Error("watch failed");
    errorHandler(error);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("ignores scanner backup files in the ignored function", () => {
    const onChange = vi.fn();
    const onError = vi.fn();

    watchTargetDirectories(["/skills"], onChange, onError);

    const call = mocks.watch.mock.calls[0];
    expect(call).toBeDefined();
    const options = call![1] as { ignored: (p: string) => boolean };
    expect(options.ignored("/skills/my-skill.skiller-backup-1234567890")).toBe(true);
    expect(options.ignored("/skills/my-skill")).toBe(false);
    expect(options.ignored("/skills/my-skill/SKILL.md")).toBe(false);
  });
});

describe("createUpdateInterval", () => {
  it("runs check function on the configured interval", () => {
    vi.useFakeTimers();
    const check = vi.fn();
    const interval = createUpdateInterval({ intervalHours: 24 }, check);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);

    expect(check).toHaveBeenCalledTimes(1);
    clearInterval(interval);
  });
});
