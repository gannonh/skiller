import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("desktop preload", () => {
  it("loads the CommonJS preload artifact from the Electron main process", async () => {
    const mainSource = await readFile(join(process.cwd(), "src/main/main.ts"), "utf8");
    const preloadSource = await readFile(join(process.cwd(), "src/preload.cts"), "utf8");

    expect(mainSource).toContain("../preload.cjs");
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld");
    expect(preloadSource).toContain("installLocal");
    expect(preloadSource).toContain("installGithub");
    expect(preloadSource).toContain("discoverGithub");
    expect(preloadSource).toContain("installRegistry");
    expect(preloadSource).toContain("updateSkill");
    expect(preloadSource).toContain("deleteSkill");
    expect(preloadSource).toContain("saveSkillSet");
    expect(preloadSource).toContain("setSkillMembership");
    expect(preloadSource).toContain("setSkillTargetScope");
    expect(preloadSource).toContain("deleteSkillSet");
    expect(preloadSource).toContain("replaceSkillTags");
    expect(preloadSource).toContain("setSkillSetEnabled");
    expect(preloadSource).toContain("registrySkill");
    expect(preloadSource).toContain("registryAudit");
    expect(preloadSource).toContain("getAppUpdateState");
    expect(preloadSource).toContain("checkAppUpdate");
    expect(preloadSource).toContain("installAppUpdate");
    expect(preloadSource).toContain("onAppUpdateState");
  });
});
