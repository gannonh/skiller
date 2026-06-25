import { describe, expect, it, vi } from "vitest";

// app-update.js imports the electron and electron-updater packages, whose real
// binaries are not available in CI. Mirror the mocks used by app-update.test.ts
// so this smoke test only verifies our own wiring loads.
vi.mock("electron", () => ({ app: { isPackaged: false } }));
vi.mock("electron-updater", () => ({ default: { autoUpdater: {} } }));

import { createAppUpdateService } from "../src/main/app-update.js";
import { checkDesktopUpdates } from "../src/main/update-check.js";

describe("desktop smoke", () => {
  it("loads desktop update wiring", () => {
    expect(checkDesktopUpdates).toEqual(expect.any(Function));
    expect(createAppUpdateService).toEqual(expect.any(Function));
  });
});
