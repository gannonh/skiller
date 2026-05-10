import { describe, expect, it, vi } from "vitest";
import type { SkillerConfig } from "@skiller/core";

const loadConfig = vi.fn();
const expandHome = vi.fn((value: string) => value.replace("~", "/home/test"));
const checkForSkillUpdates = vi.fn();

vi.mock("@skiller/core", () => ({
  loadConfig,
  expandHome,
  checkForSkillUpdates
}));

describe("desktop update checks", () => {
  it("delegates update checks to the shared core updater", async () => {
    const config: SkillerConfig = {
      libraryPath: "~/persisted-skiller",
      targets: [],
      updateSchedule: { intervalHours: 24 },
      keepAllSkillsUpdated: true,
      launchAtLogin: false,
      trayEnabled: true
    };
    const result = {
      checkedAt: "2026-05-10T12:00:00.000Z",
      considered: [],
      available: [],
      updated: [],
      errors: []
    };
    loadConfig.mockResolvedValue(config);
    checkForSkillUpdates.mockResolvedValue(result);

    const { checkDesktopUpdates } = await import("../src/main/update-check.js");

    await expect(checkDesktopUpdates()).resolves.toBe(result);
    expect(checkForSkillUpdates).toHaveBeenCalledWith({
      libraryPath: "/home/test/persisted-skiller",
      config
    });
  });
});
