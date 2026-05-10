import { describe, expect, it } from "vitest";
import { checkDesktopUpdates } from "../src/main/update-check.js";

describe("desktop smoke", () => {
  it("loads desktop update wiring", () => {
    expect(checkDesktopUpdates).toEqual(expect.any(Function));
  });
});
