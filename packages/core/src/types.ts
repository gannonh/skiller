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

export type SkillSource =
  | {
      type: "skills.sh";
      skillsShId: string;
      githubUrl: string;
      githubPath?: string;
      ref?: string;
      commit?: string;
    }
  | {
      type: "github";
      githubUrl: string;
      githubPath?: string;
      ref?: string;
      commit?: string;
    }
  | {
      type: "local";
      path: string;
    }
  | {
      type: "unknown";
      discoveredFrom?: string;
    };

export interface SkillMetadata {
  id: string;
  name: string;
  description?: string;
  libraryPath: string;
  source: SkillSource;
  installedAt: string;
  updatedAt?: string;
  lastCheckedAt?: string;
  contentHash?: string;
  keepUpdated: boolean;
  enabled: boolean;
  tags: string[];
  validation: ValidationResult;
}

export interface SkillSetMetadata {
  id: string;
  name: string;
  skillIds: string[];
  targets: TargetConfig[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryState {
  skills: SkillMetadata[];
  skillSets: SkillSetMetadata[];
  tags: string[];
}

export interface TargetConfig {
  path: string;
  enabled: boolean;
}

export type TargetInstallMode = "symlink" | "copy";

export interface SkillerConfig {
  libraryPath: string;
  targets: TargetConfig[];
  globalTargetInstallMode: TargetInstallMode;
  projectTargetInstallMode: TargetInstallMode;
  updateSchedule: {
    intervalHours: number;
  };
  keepAllSkillsUpdated: boolean;
  launchAtLogin: boolean;
  trayEnabled: boolean;
}
