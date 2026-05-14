import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const libraryState = { skills: [], skillSets: [], tags: [] };
  class DuplicateSkillNameError extends Error {
    skillId: string;
    skillName: string;

    constructor(skillId: string, skillName: string) {
      super(`Skill already exists: ${skillName}`);
      this.name = "DuplicateSkillNameError";
      this.skillId = skillId;
      this.skillName = skillName;
    }
  }

  return {
    handlers,
    libraryState,
    DuplicateSkillNameError,
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
    installGithubSkill: vi.fn(),
    installLocalSkill: vi.fn(),
    setSkillSetEnabled: vi.fn(async () => [])
  };
});

vi.mock("electron", () => ({
  dialog: {
    showOpenDialog: vi.fn(),
    showMessageBox: vi.fn()
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      mocks.handlers.set(channel, handler);
    })
  }
}));

vi.mock("@skiller/core", () => ({
  DuplicateSkillNameError: mocks.DuplicateSkillNameError,
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
  installGithubSkill: mocks.installGithubSkill,
  installLocalSkill: mocks.installLocalSkill,
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

  it("asks before replacing a duplicate local skill and continues the same install when confirmed", async () => {
    const { dialog } = await import("electron");
    const { registerIpcHandlers } = await import("../src/main/ipc.js");
    const duplicate = new mocks.DuplicateSkillNameError("agent-browser", "agent-browser");

    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: ["/tmp/agent-browser"] });
    vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 0, checkboxChecked: false });
    mocks.installLocalSkill.mockImplementationOnce(async (input: { onDuplicateSkillName: (error: Error) => Promise<boolean> }) => {
      if (!(await input.onDuplicateSkillName(duplicate))) throw duplicate;
      return { id: "agent-browser", name: "agent-browser" };
    });

    registerIpcHandlers();
    const result = await mocks.handlers.get("library:install-local")?.({});

    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "A skill by that name already exists: agent-browser",
        buttons: ["Replace", "Cancel"],
        defaultId: 0,
        cancelId: 1
      })
    );
    expect(mocks.installLocalSkill).toHaveBeenNthCalledWith(1, {
      sourcePath: "/tmp/agent-browser",
      libraryPath: "/home/test/skiller",
      onDuplicateSkillName: expect.any(Function)
    });
    expect(mocks.installLocalSkill).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: "agent-browser", name: "agent-browser" });
  });

  it("asks before replacing a duplicate GitHub skill and continues the same install when confirmed", async () => {
    const { dialog } = await import("electron");
    const { registerIpcHandlers } = await import("../src/main/ipc.js");
    const duplicate = new mocks.DuplicateSkillNameError("agent-browser", "agent-browser");

    vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 0, checkboxChecked: false });
    mocks.installGithubSkill.mockImplementationOnce(async (input: { onDuplicateSkillName: (error: Error) => Promise<boolean> }) => {
      if (!(await input.onDuplicateSkillName(duplicate))) throw duplicate;
      return { id: "agent-browser", name: "agent-browser" };
    });

    registerIpcHandlers();
    const result = await mocks.handlers.get("library:install-github")?.({}, {
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/agent-browser",
      ref: "main"
    });

    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "A skill by that name already exists: agent-browser",
        buttons: ["Replace", "Cancel"]
      })
    );
    expect(mocks.installGithubSkill).toHaveBeenCalledWith({
      githubUrl: "https://github.com/example/skills",
      githubPath: "skills/agent-browser",
      ref: "main",
      libraryPath: "/home/test/skiller",
      onDuplicateSkillName: expect.any(Function)
    });
    expect(mocks.installGithubSkill).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: "agent-browser", name: "agent-browser" });
  });
});
