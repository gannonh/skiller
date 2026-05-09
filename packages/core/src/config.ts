import type { SkillerConfig } from "./types.js";
import { defaultTargetDirectories } from "./paths.js";

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
