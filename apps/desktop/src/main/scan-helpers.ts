import { MetadataStore, expandHome, scanTargets } from "@skiller/core";
import type { ScanTargetsResult, SkillSetMetadata, SkillerConfig, TargetConfig } from "@skiller/core";

export async function loadLibrarySkillSets(libraryPath: string): Promise<SkillSetMetadata[]> {
  const store = new MetadataStore(libraryPath);
  return (await store.libraryState()).skillSets;
}

export function buildScanTargetsInput(
  config: SkillerConfig,
  skillSets: SkillSetMetadata[],
  targets: TargetConfig[],
  expandPath: (value: string) => string = expandHome,
  options?: { importOnly?: boolean }
) {
  return {
    libraryPath: expandPath(config.libraryPath),
    targets,
    skillSets,
    globalTargetInstallMode: config.globalTargetInstallMode,
    projectTargetInstallMode: config.projectTargetInstallMode,
    ...(options?.importOnly ? { importOnly: true } : {})
  };
}

export async function runLibraryScan(
  config: SkillerConfig,
  options: { targets?: TargetConfig[]; extraTargets?: TargetConfig[]; importOnly?: boolean } = {}
): Promise<ScanTargetsResult> {
  const libraryPath = expandHome(config.libraryPath);
  const skillSets = await loadLibrarySkillSets(libraryPath);
  const targets = options.targets ?? [...config.targets, ...(options.extraTargets ?? [])];

  return scanTargets(buildScanTargetsInput(config, skillSets, targets, expandHome, options));
}
