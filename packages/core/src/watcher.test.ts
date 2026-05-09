import { afterEach, describe, expect, it, vi } from "vitest";
import { createUpdateInterval, watchTargetDirectories } from "./watcher.js";

const mocks = vi.hoisted(() => {
  const watcher = {
    on: vi.fn()
  };
  watcher.on.mockReturnValue(watcher);
  const watch = vi.fn(() => watcher);

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

    watchTargetDirectories({ targetDirectories: ["/skills"] }, onChange);

    expect(mocks.watch).toHaveBeenCalledWith(["/skills"], {
      ignoreInitial: true,
      depth: 2,
      awaitWriteFinish: true
    });
    expect(mocks.watcher.on).toHaveBeenCalledTimes(5);
    expect(mocks.watcher.on).toHaveBeenNthCalledWith(1, "addDir", onChange);
    expect(mocks.watcher.on).toHaveBeenNthCalledWith(2, "unlinkDir", onChange);
    expect(mocks.watcher.on).toHaveBeenNthCalledWith(3, "change", onChange);
    expect(mocks.watcher.on).toHaveBeenNthCalledWith(4, "add", onChange);
    expect(mocks.watcher.on).toHaveBeenNthCalledWith(5, "unlink", onChange);
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
