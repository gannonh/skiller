import { describe, expect, it } from "vitest";
import { createUpdateCheckResult } from "../src/main/update-check.js";

describe("update checks", () => {
  it("returns a metadata-based placeholder result", () => {
    const result = createUpdateCheckResult([
      { id: "always", name: "Always", keepUpdated: false },
      { id: "manual", name: "Manual", keepUpdated: true }
    ]);

    expect(result).toMatchObject({
      available: [],
      updated: [],
      considered: [{ id: "manual", name: "Manual" }]
    });
    expect(Date.parse(result.checkedAt)).not.toBeNaN();
  });
});
