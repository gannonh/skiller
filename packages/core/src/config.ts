import type { SkillerConfig } from "./types.js";
import { defaultTargetDirectories } from "./paths.js";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";

const CONFIG_FILE = "config.json";

export interface ConfigPersistenceOptions {
  configPath?: string;
}

export function defaultConfigPath(): string {
  if (process.env.SKILLER_CONFIG_PATH) return process.env.SKILLER_CONFIG_PATH;

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "skiller", CONFIG_FILE);
  }

  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "skiller", CONFIG_FILE);
  }

  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "skiller", CONFIG_FILE);
}

export function defaultConfig(): SkillerConfig {
  return {
    libraryPath: "~/skiller",
    targetDirectories: defaultTargetDirectories(),
    updateSchedule: { intervalHours: 24 },
    keepAllSkillsUpdated: false,
    launchAtLogin: false,
    trayEnabled: true
  };
}

export function normalizeConfig(input: Partial<SkillerConfig>): SkillerConfig {
  const defaults = defaultConfig();
  return {
    ...defaults,
    ...input,
    updateSchedule: {
      ...defaults.updateSchedule,
      ...input.updateSchedule
    },
    targetDirectories:
      input.targetDirectories && input.targetDirectories.length > 0
        ? input.targetDirectories
        : defaults.targetDirectories
  };
}

export async function loadConfig(options: ConfigPersistenceOptions = {}): Promise<SkillerConfig> {
  const configPath = options.configPath ?? defaultConfigPath();

  if (!(await fs.pathExists(configPath))) {
    return defaultConfig();
  }

  return normalizeConfig(await fs.readJson(configPath));
}

export async function saveConfig(
  input: Partial<SkillerConfig>,
  options: ConfigPersistenceOptions = {}
): Promise<SkillerConfig> {
  const configPath = options.configPath ?? defaultConfigPath();
  const current = (await fs.pathExists(configPath)) ? await fs.readJson(configPath) : {};
  const update = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  const config = normalizeConfig({ ...current, ...update });

  await fs.ensureDir(path.dirname(configPath));
  await fs.writeJson(configPath, config, { spaces: 2 });

  return config;
}
