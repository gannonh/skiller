import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("desktop preload", () => {
  it("loads the CommonJS preload artifact from the Electron main process", async () => {
    const mainSource = await readFile(join(process.cwd(), "src/main/main.ts"), "utf8");
    const preloadSource = await readFile(join(process.cwd(), "src/preload.cts"), "utf8");

    expect(mainSource).toContain("../preload.cjs");
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld");
  });
});
