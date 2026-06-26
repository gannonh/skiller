import { contextBridge, ipcRenderer } from "electron";

type ScanError = { message: string };

contextBridge.exposeInMainWorld("skiller", {
  listLibrary: () => ipcRenderer.invoke("library:list"),
  setSkillEnabled: (skillId: string, enabled: boolean) => ipcRenderer.invoke("library:set-enabled", skillId, enabled),
  deleteSkill: (skillId: string) => ipcRenderer.invoke("library:delete", skillId),
  saveSkillSet: (input: { id?: string; name: string; skillIds: string[]; targets: Array<{ path: string; enabled: boolean }> }) =>
    ipcRenderer.invoke("library:save-skill-set", input),
  setSkillMembership: (skillId: string, skillSetIds: string[]) =>
    ipcRenderer.invoke("library:set-skill-membership", skillId, skillSetIds),
  deleteSkillSet: (skillSetId: string) => ipcRenderer.invoke("library:delete-skill-set", skillSetId),
  replaceSkillTags: (skillId: string, tags: string[]) => ipcRenderer.invoke("library:replace-skill-tags", skillId, tags),
  setSkillSetEnabled: (skillSetId: string, enabled: boolean) => ipcRenderer.invoke("library:set-skill-set-enabled", skillSetId, enabled),
  scanTargets: () => ipcRenderer.invoke("targets:scan"),
  repairLibrary: () => ipcRenderer.invoke("library:repair"),
  discoverImportableSkills: () => ipcRenderer.invoke("import:discover"),
  importSkills: (sourcePaths: string[]) => ipcRenderer.invoke("import:apply", sourcePaths),
  saveTargets: (targets: Array<{ path: string; enabled: boolean }>) => ipcRenderer.invoke("targets:save", targets),
  chooseTargetDirectory: () => ipcRenderer.invoke("targets:choose-directory"),
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config: {
    libraryPath?: string;
    keepAllSkillsUpdated?: boolean;
    targets?: Array<{ path: string; enabled: boolean }>;
    globalTargetInstallMode?: "symlink" | "copy";
    projectTargetInstallMode?: "symlink" | "copy";
  }) => ipcRenderer.invoke("config:save", config),
  checkUpdates: () => ipcRenderer.invoke("updates:check"),
  updateSkill: (skillId: string) => ipcRenderer.invoke("updates:apply", skillId),
  getAppUpdateState: () => ipcRenderer.invoke("app-update:get-state"),
  checkAppUpdate: () => ipcRenderer.invoke("app-update:check"),
  installAppUpdate: () => ipcRenderer.invoke("app-update:install"),
  openExternal: (url: string) => ipcRenderer.invoke("system:open-external", url),
  installLocal: () => ipcRenderer.invoke("library:install-local"),
  installGithub: (input: { githubUrl: string; githubPath?: string; ref?: string }) => ipcRenderer.invoke("library:install-github", input),
  discoverGithub: (githubUrl: string) => ipcRenderer.invoke("library:discover-github", githubUrl),
  installRegistry: (input: string | { skillsShId: string; registrySkill?: Record<string, unknown> }) =>
    ipcRenderer.invoke("library:install-registry", input),
  leaderboard: (type: "all-time" | "trending" | "hot") => ipcRenderer.invoke("discover:leaderboard", type),
  search: (query: string) => ipcRenderer.invoke("discover:search", query),
  registrySkill: (id: string) => ipcRenderer.invoke("discover:skill", id),
  registryAudit: (id: string) => ipcRenderer.invoke("discover:audit", id),
  onCheckUpdates: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("action:check-updates", listener);
    return () => ipcRenderer.removeListener("action:check-updates", listener);
  },
  onAppUpdateState: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on("app-update:state", listener);
    return () => ipcRenderer.removeListener("app-update:state", listener);
  },
  onScanError: (callback: (error: ScanError) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: ScanError) => callback(error);
    ipcRenderer.on("background:scan-error", listener);
    return () => ipcRenderer.removeListener("background:scan-error", listener);
  }
});
