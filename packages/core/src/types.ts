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
  validation: ValidationResult;
  enabledTargets: string[];
}

export interface SkillerConfig {
  libraryPath: string;
  targetDirectories: string[];
  updateSchedule: {
    intervalHours: number;
  };
  keepAllSkillsUpdated: boolean;
  launchAtLogin: boolean;
  trayEnabled: boolean;
}
