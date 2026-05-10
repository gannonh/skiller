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
    targets: defaultTargetDirectories().map((targetPath) => ({ path: targetPath, enabled: true })),
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
    targets: input.targets && input.targets.length > 0 ? input.targets : defaults.targets
  };
}

function assertValidLibraryPath(libraryPath: string): void {
  if (libraryPath.trim().length === 0) {
    throw new Error("Library path cannot be blank");
  }

  if (!libraryPath.startsWith("~/") && !path.isAbsolute(libraryPath)) {
    throw new Error("Library path must be absolute or start with ~/");
  }
}

export async function loadConfig(options: ConfigPersistenceOptions = {}): Promise<SkillerConfig> {
  const configPath = options.configPath ?? defaultConfigPath();

  if (!(await fs.pathExists(configPath))) {
    return defaultConfig();
  }

  const config = normalizeConfig(await fs.readJson(configPath));
  assertValidLibraryPath(config.libraryPath);
  return config;
}

export async function saveConfig(
  input: Partial<SkillerConfig>,
  options: ConfigPersistenceOptions = {}
): Promise<SkillerConfig> {
  if (input.libraryPath !== undefined) {
    assertValidLibraryPath(input.libraryPath);
  }

  const configPath = options.configPath ?? defaultConfigPath();
  const current = (await fs.pathExists(configPath)) ? await fs.readJson(configPath) : {};
  const update = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  const config = normalizeConfig({ ...current, ...update });
  assertValidLibraryPath(config.libraryPath);

  await fs.ensureDir(path.dirname(configPath));
  await fs.writeJson(configPath, config, { spaces: 2 });

  return config;
}
