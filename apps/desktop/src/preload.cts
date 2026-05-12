import { contextBridge, ipcRenderer } from "electron";

type ScanError = { message: string };

contextBridge.exposeInMainWorld("skiller", {
  listLibrary: () => ipcRenderer.invoke("library:list"),
  setSkillEnabled: (skillId: string, enabled: boolean) => ipcRenderer.invoke("library:set-enabled", skillId, enabled),
  deleteSkill: (skillId: string) => ipcRenderer.invoke("library:delete", skillId),
  createSkillSet: (name: string) => ipcRenderer.invoke("library:create-skill-set", name),
  renameSkillSet: (skillSetId: string, name: string) => ipcRenderer.invoke("library:rename-skill-set", skillSetId, name),
  deleteSkillSet: (skillSetId: string) => ipcRenderer.invoke("library:delete-skill-set", skillSetId),
  assignSkillSet: (skillId: string, skillSetId?: string) => ipcRenderer.invoke("library:assign-skill-set", skillId, skillSetId),
  replaceSkillTags: (skillId: string, tags: string[]) => ipcRenderer.invoke("library:replace-skill-tags", skillId, tags),
  setSkillSetEnabled: (skillSetId: string, enabled: boolean) => ipcRenderer.invoke("library:set-skill-set-enabled", skillSetId, enabled),
  scanTargets: () => ipcRenderer.invoke("targets:scan"),
  saveTargets: (targets: Array<{ path: string; enabled: boolean }>) => ipcRenderer.invoke("targets:save", targets),
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config: { libraryPath?: string; keepAllSkillsUpdated?: boolean; targets?: Array<{ path: string; enabled: boolean }> }) =>
    ipcRenderer.invoke("config:save", config),
  checkUpdates: () => ipcRenderer.invoke("updates:check"),
  updateSkill: (skillId: string) => ipcRenderer.invoke("updates:apply", skillId),
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
  onScanError: (callback: (error: ScanError) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: ScanError) => callback(error);
    ipcRenderer.on("background:scan-error", listener);
    return () => ipcRenderer.removeListener("background:scan-error", listener);
  }
});
