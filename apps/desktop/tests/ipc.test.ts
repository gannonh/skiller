import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const libraryState = { skills: [], skillSets: [], tags: [] };
  return {
    handlers,
    libraryState,
    loadConfig: vi.fn(async () => ({
      libraryPath: "~/skiller",
      targets: [{ path: "~/skills", enabled: true }],
      updateSchedule: { intervalHours: 1 },
      keepAllSkillsUpdated: false,
      launchAtLogin: false,
      trayEnabled: true
    })),
    scanTargets: vi.fn(async () => ({
      imported: [],
      enabled: [],
      disabled: [],
      errors: [{ path: "/home/test/skills", message: "permission denied" }]
    })),
    setSkillSetEnabled: vi.fn(async () => [])
  };
});

vi.mock("electron", () => ({
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      mocks.handlers.set(channel, handler);
    })
  }
}));

vi.mock("@skiller/core", () => ({
  MetadataStore: vi.fn(() => ({
    setSkillSetEnabled: mocks.setSkillSetEnabled,
    libraryState: vi.fn(async () => mocks.libraryState)
  })),
  SkillsShClient: vi.fn(() => ({
    leaderboard: vi.fn(),
    search: vi.fn(),
    skill: vi.fn(),
    audit: vi.fn()
  })),
  discoverGithubSkills: vi.fn(),
  expandHome: (value: string) => value.replace("~", "/home/test"),
  installGithubSkill: vi.fn(),
  installLocalSkill: vi.fn(),
  installSkillsShSkill: vi.fn(),
  loadConfig: mocks.loadConfig,
  saveConfig: vi.fn(),
  scanTargets: mocks.scanTargets,
  updateInstalledSkill: vi.fn()
}));

describe("ipc handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
  });

  it("returns saved library state and scan errors for skill set toggles", async () => {
    const { registerIpcHandlers } = await import("../src/main/ipc.js");
    registerIpcHandlers();

    const handler = mocks.handlers.get("library:set-skill-set-enabled");
    expect(handler).toEqual(expect.any(Function));

    const result = await handler?.({}, "automation", false);

    expect(mocks.setSkillSetEnabled).toHaveBeenCalledWith("automation", false);
    expect(mocks.scanTargets).toHaveBeenCalledWith({
      libraryPath: "/home/test/skiller",
      targets: [{ path: "/home/test/skills", enabled: true }]
    });
    expect(result).toEqual({
      state: mocks.libraryState,
      scanErrors: [{ path: "/home/test/skills", message: "permission denied" }]
    });
  });

  it("registers app update handlers", async () => {
    const appUpdateService = {
      getState: vi.fn(() => ({ status: "ready", version: "0.2.2" })),
      checkNow: vi.fn(async () => ({ status: "checking" })),
      installReadyUpdate: vi.fn(async () => undefined)
    };
    const { registerIpcHandlers } = await import("../src/main/ipc.js");
    registerIpcHandlers({ appUpdateService });

    await expect(mocks.handlers.get("app-update:get-state")?.({})).resolves.toEqual({ status: "ready", version: "0.2.2" });
    await expect(mocks.handlers.get("app-update:check")?.({})).resolves.toEqual({ status: "checking" });
    await expect(mocks.handlers.get("app-update:install")?.({})).resolves.toBeUndefined();
    expect(appUpdateService.installReadyUpdate).toHaveBeenCalledTimes(1);
  });
});
