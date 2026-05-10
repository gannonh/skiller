export type ValidationSeverity = "warning" | "error";

export interface ValidationIssue {
  code: string;
  message: string;
  severity: ValidationSeverity;
  path?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface SkillSource {
  type: "skills.sh" | "github" | "local" | "unknown";
  skillsShId?: string;
  githubUrl?: string;
  ref?: string;
  commit?: string;
}

export interface SkillMetadata {
  id: string;
  name: string;
  description?: string;
  libraryPath: string;
  source: SkillSource;
  installedAt: string;
  lastCheckedAt?: string;
  contentHash?: string;
  keepUpdated: boolean;
  enabled: boolean;
  validation: ValidationResult;
}

export interface TargetConfig {
  path: string;
  enabled: boolean;
}

export interface SkillerConfig {
  libraryPath: string;
  targets: TargetConfig[];
  updateSchedule: {
    intervalHours: number;
  };
  keepAllSkillsUpdated: boolean;
  launchAtLogin: boolean;
  trayEnabled: boolean;
}
