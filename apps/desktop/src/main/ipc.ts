import { dialog, ipcMain, shell } from "electron";
import {
  DuplicateSkillNameError,
  MetadataStore,
  SkillsShClient,
  discoverGithubSkills,
  expandHome,
  installGithubSkill,
  installLocalSkill,
  installSkillsShSkill,
  loadConfig,
  saveConfig,
  scanTargets,
  updateInstalledSkill
} from "@skiller/core";
import type { DuplicateSkillNameHandler, ScanTargetsResult, SkillerConfig, TargetConfig } from "@skiller/core";
import type { AppUpdateService } from "./app-update.js";
import { checkDesktopUpdates } from "./update-check.js";

type ConfigUpdate = Partial<Pick<SkillerConfig, "libraryPath" | "keepAllSkillsUpdated" | "targets">>;
type InstallGithubInput = { githubUrl: string; githubPath?: string; ref?: string; replaceExisting?: boolean };
type InstallRegistryInput =
  | string
  | { skillsShId: string; registrySkill?: Record<string, unknown>; replaceExisting?: boolean };
export type SetSkillSetEnabledResult = {
  state: Awaited<ReturnType<MetadataStore["libraryState"]>>;
  scanErrors: ScanTargetsResult["errors"];
};
export interface IpcHandlerDependencies {
  appUpdateService?: Pick<AppUpdateService, "getState" | "checkNow" | "installReadyUpdate">;
}

const skillsShClient = new SkillsShClient();

function expandTargets(targets: TargetConfig[]): TargetConfig[] {
  return targets.map((target) => ({ ...target, path: expandHome(target.path) }));
}

function changedTargets(currentTargets: TargetConfig[], nextTargets: TargetConfig[]): TargetConfig[] {
  const currentByPath = new Map(currentTargets.map((target) => [target.path, target]));
  const nextByPath = new Map(nextTargets.map((target) => [target.path, target]));
  const changed: TargetConfig[] = [];

  for (const target of nextTargets) {
    const current = currentByPath.get(target.path);
    if (!current || current.enabled !== target.enabled) {
      changed.push(target);
    }
  }

  for (const target of currentTargets) {
    if (!nextByPath.has(target.path)) {
      changed.push({ ...target, enabled: false });
    }
  }

  return changed;
}

async function scanConfig(config: SkillerConfig, extraTargets: TargetConfig[] = []) {
  const libraryPath = expandHome(config.libraryPath);
  const store = new MetadataStore(libraryPath);
  const { skillSets } = await store.libraryState();

  return scanTargets({
    libraryPath,
    targets: [...expandTargets(config.targets), ...extraTargets],
    skillSets
  });
}

async function scanTargetsForConfig(config: SkillerConfig, targets: TargetConfig[]) {
  if (targets.length === 0) return;

  const libraryPath = expandHome(config.libraryPath);
  const store = new MetadataStore(libraryPath);
  const { skillSets } = await store.libraryState();

  await scanTargets({
    libraryPath,
    targets: expandTargets(targets),
    skillSets
  });
}

async function confirmReplaceDuplicate(error: DuplicateSkillNameError): Promise<boolean> {
  const result = await dialog.showMessageBox({
    type: "warning",
    message: `A skill by that name already exists: ${error.skillName}`,
    buttons: ["Replace", "Cancel"],
    defaultId: 0,
    cancelId: 1
  });

  return result.response === 0;
}

async function installWithDuplicatePrompt<T>(install: (onDuplicateSkillName: DuplicateSkillNameHandler) => Promise<T>): Promise<T | null> {
  let duplicatePromptCancelled = false;
  const onDuplicateSkillName: DuplicateSkillNameHandler = async (error) => {
    const shouldReplace = await confirmReplaceDuplicate(error);
    duplicatePromptCancelled = !shouldReplace;
    return shouldReplace;
  };

  try {
    return await install(onDuplicateSkillName);
  } catch (error) {
    if (duplicatePromptCancelled && error instanceof DuplicateSkillNameError) return null;
    throw error;
  }
}

function validateExternalUrl(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("External URL must be a string");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("External URL is invalid");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("External URL protocol must be http or https");
  }

  return url.toString();
}

export function registerIpcHandlers(dependencies: IpcHandlerDependencies = {}): void {
  ipcMain.handle("library:list", async () => {
    const config = await loadConfig();
    const store = new MetadataStore(expandHome(config.libraryPath));

    await store.pruneMissing();
    return store.libraryState();
  });

  ipcMain.handle("library:set-enabled", async (_event, skillId: string, enabled: boolean) => {
    const config = await loadConfig();
    const libraryPath = expandHome(config.libraryPath);
    const store = new MetadataStore(libraryPath);

    await store.setEnabled(skillId, enabled);
    await scanConfig(config);
    return store.libraryState();
  });

  ipcMain.handle("library:save-skill-set", async (_event, input: import("@skiller/core").SaveSkillSetInput) => {
    const config = await loadConfig();
    const store = new MetadataStore(expandHome(config.libraryPath));

    await store.saveSkillSet(input);
    await scanConfig(config);
    return store.libraryState();
  });

  ipcMain.handle("library:set-skill-membership", async (_event, skillId: string, skillSetIds: string[]) => {
    const config = await loadConfig();
    const store = new MetadataStore(expandHome(config.libraryPath));

    const state = await store.setSkillMembership(skillId, skillSetIds);
    await scanConfig(config);
    return state;
  });

  ipcMain.handle("library:delete-skill-set", async (_event, skillSetId: string) => {
    const config = await loadConfig();
    const store = new MetadataStore(expandHome(config.libraryPath));

    await store.deleteSkillSet(skillSetId);
    return store.libraryState();
  });

  ipcMain.handle("library:replace-skill-tags", async (_event, skillId: string, tags: string[]) => {
    const config = await loadConfig();
    const store = new MetadataStore(expandHome(config.libraryPath));

    await store.replaceSkillTags(skillId, tags);
    return store.libraryState();
  });

  ipcMain.handle("library:set-skill-set-enabled", async (_event, skillSetId: string, enabled: boolean) => {
    const config = await loadConfig();
    const libraryPath = expandHome(config.libraryPath);
    const store = new MetadataStore(libraryPath);

    await store.setSkillSetEnabled(skillSetId, enabled);
    const scanResult = await scanConfig(config);
    return {
      state: await store.libraryState(),
      scanErrors: scanResult.errors
    } satisfies SetSkillSetEnabledResult;
  });

  ipcMain.handle("library:delete", async (_event, skillId: string) => {
    const config = await loadConfig();
    const libraryPath = expandHome(config.libraryPath);
    const store = new MetadataStore(libraryPath);

    await store.setEnabled(skillId, false);
    await scanConfig(config);
    await store.delete(skillId);
    await scanConfig(config);
    return store.libraryState();
  });

  ipcMain.handle("library:install-local", async () => {
    const result = await dialog.showOpenDialog({
      title: "Add Skill Folder",
      properties: ["openDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const config = await loadConfig();
    const metadata = await installWithDuplicatePrompt((onDuplicateSkillName) =>
      installLocalSkill({
        sourcePath: result.filePaths[0],
        libraryPath: expandHome(config.libraryPath),
        onDuplicateSkillName
      })
    );
    if (!metadata) return null;
    await scanConfig(config);
    return metadata;
  });

  ipcMain.handle("library:install-github", async (_event, input: InstallGithubInput) => {
    const config = await loadConfig();
    const metadata = await installWithDuplicatePrompt((onDuplicateSkillName) =>
      installGithubSkill({
        githubUrl: input.githubUrl,
        ...(input.githubPath ? { githubPath: input.githubPath } : {}),
        ...(input.ref ? { ref: input.ref } : {}),
        libraryPath: expandHome(config.libraryPath),
        ...(input.replaceExisting ? { replaceExisting: true } : {}),
        onDuplicateSkillName
      })
    );
    if (!metadata) return null;
    await scanConfig(config);
    return metadata;
  });

  ipcMain.handle("library:discover-github", async (_event, githubUrl: string) => {
    return discoverGithubSkills({ githubUrl });
  });

  ipcMain.handle("library:install-registry", async (_event, input: InstallRegistryInput) => {
    const skillsShId = typeof input === "string" ? input : input.skillsShId;
    const config = await loadConfig();
    const metadata = await installWithDuplicatePrompt((onDuplicateSkillName) =>
      installSkillsShSkill({
        skillsShId,
        ...(typeof input === "string" || !input.registrySkill ? {} : { registrySkill: input.registrySkill }),
        libraryPath: expandHome(config.libraryPath),
        client: skillsShClient,
        ...(typeof input !== "string" && input.replaceExisting ? { replaceExisting: true } : {}),
        onDuplicateSkillName
      })
    );
    if (!metadata) return null;
    await scanConfig(config);
    return metadata;
  });

  ipcMain.handle("targets:scan", async () => {
    const config = await loadConfig();
    return scanConfig(config);
  });

  ipcMain.handle("targets:save", async (_event, targets: TargetConfig[]) => {
    const current = await loadConfig();
    const changed = changedTargets(current.targets, targets);
    const config = await saveConfig({ targets });

    await scanTargetsForConfig(config, changed);
    return config;
  });

  ipcMain.handle("config:get", async () => {
    return loadConfig();
  });

  ipcMain.handle("config:save", async (_event, config: ConfigUpdate) => {
    return saveConfig({
      libraryPath: config.libraryPath,
      keepAllSkillsUpdated: config.keepAllSkillsUpdated,
      targets: config.targets
    });
  });

  ipcMain.handle("updates:check", async () => {
    return checkDesktopUpdates();
  });

  ipcMain.handle("app-update:get-state", async () => {
    return dependencies.appUpdateService?.getState() ?? { status: "unsupported" };
  });

  ipcMain.handle("app-update:check", async () => {
    return dependencies.appUpdateService?.checkNow() ?? { status: "unsupported" };
  });

  ipcMain.handle("app-update:install", async () => {
    if (!dependencies.appUpdateService) {
      throw new Error("App updates are not available");
    }
    await dependencies.appUpdateService.installReadyUpdate();
  });

  ipcMain.handle("system:open-external", async (_event, url: unknown) => {
    await shell.openExternal(validateExternalUrl(url));
  });

  ipcMain.handle("updates:apply", async (_event, skillId: string) => {
    const config = await loadConfig();
    const metadata = await updateInstalledSkill({
      skillId,
      libraryPath: expandHome(config.libraryPath)
    });
    await scanConfig(config);
    return metadata;
  });

  ipcMain.handle("discover:leaderboard", async (_event, type: "all-time" | "trending" | "hot") => {
    return skillsShClient.leaderboard(type);
  });

  ipcMain.handle("discover:search", async (_event, query: string) => {
    return skillsShClient.search(query);
  });

  ipcMain.handle("discover:skill", async (_event, id: string) => {
    return skillsShClient.skill(id);
  });

  ipcMain.handle("discover:audit", async (_event, id: string) => {
    return skillsShClient.audit(id);
  });
}
