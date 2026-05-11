import { ipcMain } from "electron";
import { MetadataStore, SkillsShClient, expandHome, loadConfig, saveConfig, scanTargets } from "@skiller/core";
import type { SkillerConfig, TargetConfig } from "@skiller/core";
import { checkDesktopUpdates } from "./update-check.js";

type ConfigUpdate = Partial<Pick<SkillerConfig, "libraryPath" | "keepAllSkillsUpdated" | "targets">>;

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
  return scanTargets({
    libraryPath: expandHome(config.libraryPath),
    targets: [...expandTargets(config.targets), ...extraTargets]
  });
}

async function scanTargetsForConfig(config: SkillerConfig, targets: TargetConfig[]) {
  if (targets.length === 0) return;

  await scanTargets({
    libraryPath: expandHome(config.libraryPath),
    targets: expandTargets(targets)
  });
}

export function registerIpcHandlers(): void {
  ipcMain.handle("library:list", async () => {
    const config = await loadConfig();
    return new MetadataStore(expandHome(config.libraryPath)).list();
  });

  ipcMain.handle("library:set-enabled", async (_event, skillId: string, enabled: boolean) => {
    const config = await loadConfig();
    const libraryPath = expandHome(config.libraryPath);
    const store = new MetadataStore(libraryPath);

    await store.setEnabled(skillId, enabled);
    await scanConfig(config);
    return store.list();
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

  ipcMain.handle("discover:leaderboard", async (_event, type: "all-time" | "trending" | "hot") => {
    return skillsShClient.leaderboard(type);
  });

  ipcMain.handle("discover:search", async (_event, query: string) => {
    return skillsShClient.search(query);
  });
}
