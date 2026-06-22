import type { SkillerConfig, TargetInstallMode } from "./types.js";
import { defaultTargetDirectories } from "./paths.js";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";

const CONFIG_FILE = "config.json";

export interface ConfigPersistenceOptions {
  configPath?: string;
}

type ConfigInput = Partial<SkillerConfig> & {
  targetDirectories?: string[];
};

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
    globalTargetInstallMode: "symlink",
    projectTargetInstallMode: "symlink",
    updateSchedule: { intervalHours: 24 },
    keepAllSkillsUpdated: false,
    launchAtLogin: false,
    trayEnabled: true
  };
}

function normalizeInstallMode(value: unknown, fallback: TargetInstallMode): TargetInstallMode {
  return value === "copy" ? "copy" : fallback;
}

function normalizeTargetPath(targetPath: string): string {
  const trimmed = targetPath.trim();
  if (trimmed === "/" || trimmed === "~") return trimmed;
  return trimmed.replace(/[\\/]+$/g, "");
}

function normalizeTargets(input: ConfigInput, defaults: SkillerConfig): SkillerConfig["targets"] {
  if (Array.isArray(input.targets)) {
    return input.targets.map((target) => ({
      ...target,
      path: normalizeTargetPath(target.path)
    }));
  }

  if (Array.isArray(input.targetDirectories)) {
    return input.targetDirectories.map((targetPath) => ({
      path: normalizeTargetPath(targetPath),
      enabled: true
    }));
  }

  return defaults.targets;
}

export function normalizeConfig(input: ConfigInput): SkillerConfig {
  const defaults = defaultConfig();
  const { targetDirectories: _targetDirectories, ...currentInput } = input;
  return {
    ...defaults,
    ...currentInput,
    updateSchedule: {
      ...defaults.updateSchedule,
      ...input.updateSchedule
    },
    targets: normalizeTargets(input, defaults),
    globalTargetInstallMode: normalizeInstallMode(input.globalTargetInstallMode, defaults.globalTargetInstallMode),
    projectTargetInstallMode: normalizeInstallMode(input.projectTargetInstallMode, defaults.projectTargetInstallMode)
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
