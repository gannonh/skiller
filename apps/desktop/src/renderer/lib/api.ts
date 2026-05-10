import type { ScanTargetsResult, SkillerConfig } from "@skiller/core";

export type LeaderboardType = "all-time" | "trending" | "hot";

export interface ValidationIssue {
  code: string;
  message: string;
  severity: "warning" | "error";
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
  keepUpdated: boolean;
  validation: ValidationResult;
  enabledTargets: string[];
}

export type DiscoverSkill = Record<string, unknown>;

export interface ScanError {
  message: string;
}

export type ConfigUpdate = Partial<Pick<SkillerConfig, "libraryPath" | "keepAllSkillsUpdated">>;

export interface UpdateCheckSkill {
  id: string;
  name: string;
  currentCommit?: string;
  remoteCommit?: string;
}

export interface UpdateCheckError {
  id?: string;
  message: string;
}

export interface UpdateCheckResult {
  checkedAt: string;
  considered: UpdateCheckSkill[];
  available: UpdateCheckSkill[];
  updated: UpdateCheckSkill[];
  errors: UpdateCheckError[];
}

export type RemoveListener = () => void;

export interface SkillerApi {
  listLibrary: () => Promise<SkillMetadata[]>;
  scanTargets: () => Promise<ScanTargetsResult>;
  getConfig: () => Promise<SkillerConfig>;
  saveConfig: (config: ConfigUpdate) => Promise<SkillerConfig>;
  checkUpdates: () => Promise<UpdateCheckResult>;
  leaderboard: (type: LeaderboardType) => Promise<{ skills: DiscoverSkill[] }>;
  search: (query: string) => Promise<{ skills: DiscoverSkill[] }>;
  onCheckUpdates: (callback: () => void) => RemoveListener;
  onScanError: (callback: (error: ScanError) => void) => RemoveListener;
}

declare global {
  interface Window {
    skiller?: SkillerApi;
  }
}

const fallbackSkills: SkillMetadata[] = [
  {
    id: "example-skill",
    name: "example-skill",
    description: "Renderer preview skill",
    libraryPath: "~/skiller/example-skill",
    source: { type: "local" },
    installedAt: new Date().toISOString(),
    keepUpdated: false,
    validation: { valid: true, issues: [] },
    enabledTargets: ["~/.codex/skills"]
  }
];

const fallbackDiscoverSkills: DiscoverSkill[] = [
  { id: "agent-browser", name: "agent-browser", description: "Browser automation CLI for agent workflows" },
  { id: "find-skills", name: "find-skills", description: "Discover and install agent skills" },
  { id: "frontend-design", name: "frontend-design", description: "Frontend design guidance for agents" },
  { id: "browser-use", name: "browser-use", description: "Automate browser-based QA flows" }
];

function createBrowserPreviewApi(): SkillerApi {
  let config: SkillerConfig = {
    libraryPath: "~/skiller",
    targetDirectories: [
      "~/.agents/skills",
      "~/.claude/skills",
      "~/.codex/skills",
      "~/.cursor/skills",
      "~/.pi/agent/skills",
      "~/.gemini/skills",
      "~/.copilot/skills"
    ],
    updateSchedule: { intervalHours: 24 },
    keepAllSkillsUpdated: false,
    launchAtLogin: false,
    trayEnabled: true
  };

  return {
    listLibrary: async () => fallbackSkills,
    scanTargets: async () => ({ imported: [], enabled: fallbackSkills, errors: [] }),
    getConfig: async () => config,
    saveConfig: async (update) => {
      if (update.libraryPath !== undefined && update.libraryPath.trim() !== "" && !update.libraryPath.startsWith("/") && !update.libraryPath.startsWith("~/")) {
        throw new Error("Library path must be absolute or start with ~/");
      }
      config = { ...config, ...update };
      return config;
    },
    checkUpdates: async () => ({
      checkedAt: new Date().toISOString(),
      considered: fallbackSkills.map((skill) => ({ id: skill.id, name: skill.name })),
      available: [],
      updated: [],
      errors: []
    }),
    leaderboard: async () => ({ skills: fallbackDiscoverSkills }),
    search: async (query) => {
      const normalizedQuery = query.toLowerCase();
      return {
        skills: fallbackDiscoverSkills.filter((skill) =>
          Object.values(skill).some((value) => String(value).toLowerCase().includes(normalizedQuery))
        )
      };
    },
    onCheckUpdates: () => () => undefined,
    onScanError: () => () => undefined
  };
}

export const skillerApi = window.skiller ?? createBrowserPreviewApi();
