import { describe, expect, it } from "vitest";
import { SKILLER_VERSION, defaultConfig, validateSkill } from "./index.js";

describe("core index", () => {
  it("exports the public core API surface", () => {
    expect(SKILLER_VERSION).toBe("0.1.0");
    expect(defaultConfig().libraryPath).toBe("~/skiller");
    expect(typeof validateSkill).toBe("function");
  });
});
