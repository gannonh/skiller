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
      globalTargetInstallMode: "symlink",
      projectTargetInstallMode: "symlink",
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
    setSkillSetEnabled: vi.fn(async () => []),
    saveSkillSet: vi.fn(async () => undefined),
    deleteSkillSet: vi.fn(async () => ({
      id: "automation",
      name: "Automation",
      skillIds: ["example-skill"],
      targets: [{ path: "~/project-skills", enabled: true, scope: "project" as const }],
      createdAt: "2026-05-12T00:00:00.000Z",
      updatedAt: "2026-05-12T00:00:00.000Z"
    })),
    setSkillMembership: vi.fn(async () => mocks.libraryState),
    setTargetScope: vi.fn(async () => ({
      id: "example-skill",
      name: "example-skill",
      libraryPath: "/home/test/skiller/example-skill",
      source: { type: "local", path: "/home/test/skiller/example-skill" },
      installedAt: "2026-05-12T00:00:00.000Z",
      keepUpdated: false,
      enabled: true,
      targetScope: "projects",
      tags: [],
      validation: { valid: true, issues: [] }
    }))
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
  },
  shell: {
    openExternal: vi.fn()
  }
}));

vi.mock("@skiller/core", () => ({
  DuplicateSkillNameError: mocks.DuplicateSkillNameError,
  MetadataStore: vi.fn(() => ({
    setSkillSetEnabled: mocks.setSkillSetEnabled,
    saveSkillSet: mocks.saveSkillSet,
    deleteSkillSet: mocks.deleteSkillSet,
    setSkillMembership: mocks.setSkillMembership,
    setTargetScope: mocks.setTargetScope,
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

  it("updates target scope and returns library state before background scan completes", async () => {
    const { registerIpcHandlers } = await import("../src/main/ipc.js");
    registerIpcHandlers();

    const handler = mocks.handlers.get("library:set-target-scope");
    expect(handler).toEqual(expect.any(Function));

    const result = await handler?.({}, "example-skill", "projects");

    expect(mocks.setTargetScope).toHaveBeenCalledWith("example-skill", "projects");
    expect(result).toEqual(mocks.libraryState);

    await vi.waitFor(() => {
      expect(mocks.scanTargets).toHaveBeenCalledWith({
        libraryPath: "/home/test/skiller",
        targets: [{ path: "~/skills", enabled: true }],
        skillSets: [],
        globalTargetInstallMode: "symlink",
        projectTargetInstallMode: "symlink"
      });
    });
  });

  it("saves skill sets and rescans targets", async () => {
    const { registerIpcHandlers } = await import("../src/main/ipc.js");
    registerIpcHandlers();

    const handler = mocks.handlers.get("library:save-skill-set");
    const input = {
      name: "Automation",
      skillIds: ["example-skill"],
      targets: [{ path: "~/project-skills", enabled: true, scope: "project" as const }]
    };

    const result = await handler?.({}, input);

    expect(mocks.saveSkillSet).toHaveBeenCalledWith(input);
    expect(mocks.scanTargets).toHaveBeenCalledWith({
      libraryPath: "/home/test/skiller",
      targets: [{ path: "~/skills", enabled: true }],
      skillSets: [],
      globalTargetInstallMode: "symlink",
      projectTargetInstallMode: "symlink"
    });
    expect(result).toEqual(mocks.libraryState);
  });

  it("updates skill membership and rescans targets", async () => {
    const { registerIpcHandlers } = await import("../src/main/ipc.js");
    registerIpcHandlers();

    const handler = mocks.handlers.get("library:set-skill-membership");
    const result = await handler?.({}, "example-skill", ["automation"]);

    expect(mocks.setSkillMembership).toHaveBeenCalledWith("example-skill", ["automation"]);
    expect(mocks.scanTargets).toHaveBeenCalledWith({
      libraryPath: "/home/test/skiller",
      targets: [{ path: "~/skills", enabled: true }],
      skillSets: [],
      globalTargetInstallMode: "symlink",
      projectTargetInstallMode: "symlink"
    });
    expect(result).toEqual(mocks.libraryState);
  });

  it("deletes skill sets and rescans deleted project targets", async () => {
    const { registerIpcHandlers } = await import("../src/main/ipc.js");
    registerIpcHandlers();

    const handler = mocks.handlers.get("library:delete-skill-set");
    const result = await handler?.({}, "automation");

    expect(mocks.deleteSkillSet).toHaveBeenCalledWith("automation");
    expect(mocks.scanTargets).toHaveBeenCalledWith({
      libraryPath: "/home/test/skiller",
      targets: [
        { path: "~/skills", enabled: true },
        { path: "~/project-skills", enabled: true, scope: "project" }
      ],
      skillSets: [],
      globalTargetInstallMode: "symlink",
      projectTargetInstallMode: "symlink"
    });
    expect(result).toEqual(mocks.libraryState);
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
      targets: [{ path: "~/skills", enabled: true }],
      skillSets: [],
      globalTargetInstallMode: "symlink",
      projectTargetInstallMode: "symlink"
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

  it("opens validated http and https URLs externally", async () => {
    const { shell } = await import("electron");
    const { registerIpcHandlers } = await import("../src/main/ipc.js");
    vi.mocked(shell.openExternal).mockResolvedValue(undefined);

    registerIpcHandlers();
    const handler = mocks.handlers.get("system:open-external");
    expect(handler).toEqual(expect.any(Function));

    await expect(handler?.({}, "https://github.com/example/skills")).resolves.toBeUndefined();
    await expect(handler?.({}, "http://github.com/example/skills")).resolves.toBeUndefined();

    expect(shell.openExternal).toHaveBeenNthCalledWith(1, "https://github.com/example/skills");
    expect(shell.openExternal).toHaveBeenNthCalledWith(2, "http://github.com/example/skills");
  });

  it("rejects invalid external URL inputs", async () => {
    const { shell } = await import("electron");
    const { registerIpcHandlers } = await import("../src/main/ipc.js");

    registerIpcHandlers();
    const handler = mocks.handlers.get("system:open-external");
    expect(handler).toEqual(expect.any(Function));

    await expect(handler?.({}, 42)).rejects.toThrow("External URL must be a string");
    await expect(handler?.({}, "not a url")).rejects.toThrow("External URL is invalid");
    await expect(handler?.({}, "file:///tmp/secret")).rejects.toThrow("External URL protocol must be http or https");
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it("propagates external URL open failures", async () => {
    const { shell } = await import("electron");
    const { registerIpcHandlers } = await import("../src/main/ipc.js");
    vi.mocked(shell.openExternal).mockRejectedValue(new Error("open failed"));

    registerIpcHandlers();
    const handler = mocks.handlers.get("system:open-external");
    expect(handler).toEqual(expect.any(Function));

    await expect(handler?.({}, "https://github.com/example/skills")).rejects.toThrow("open failed");
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
