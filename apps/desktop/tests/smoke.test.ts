import { describe, expect, it } from "vitest";
import { createAppUpdateService } from "../src/main/app-update.js";
import { checkDesktopUpdates } from "../src/main/update-check.js";

describe("desktop smoke", () => {
  it("loads desktop update wiring", () => {
    expect(checkDesktopUpdates).toEqual(expect.any(Function));
    expect(createAppUpdateService).toEqual(expect.any(Function));
  });
});
