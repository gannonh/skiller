import type {
  DiscoverGithubSkillsResult,
  ScanTargetsResult,
  SkillSource,
  SkillerConfig,
  TargetConfig
} from "@skiller/core";

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

export type DiscoverSkill = Record<string, unknown>;

export interface ScanError {
  message: string;
}

export type ConfigUpdate = Partial<Pick<SkillerConfig, "libraryPath" | "keepAllSkillsUpdated" | "targets">>;

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
  setSkillEnabled: (skillId: string, enabled: boolean) => Promise<SkillMetadata[]>;
  deleteSkill: (skillId: string) => Promise<SkillMetadata[]>;
  scanTargets: () => Promise<ScanTargetsResult>;
  saveTargets: (targets: TargetConfig[]) => Promise<SkillerConfig>;
  getConfig: () => Promise<SkillerConfig>;
  saveConfig: (config: ConfigUpdate) => Promise<SkillerConfig>;
  checkUpdates: () => Promise<UpdateCheckResult>;
  installLocal: () => Promise<SkillMetadata | null>;
  installGithub: (input: { githubUrl: string; githubPath?: string; ref?: string }) => Promise<SkillMetadata>;
  discoverGithub: (githubUrl: string) => Promise<DiscoverGithubSkillsResult>;
  installRegistry: (skillsShId: string) => Promise<SkillMetadata>;
  leaderboard: (type: LeaderboardType) => Promise<{ skills: DiscoverSkill[] }>;
  search: (query: string) => Promise<{ skills: DiscoverSkill[] }>;
  registrySkill: (id: string) => Promise<DiscoverSkill>;
  registryAudit: (id: string) => Promise<DiscoverSkill>;
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
    source: { type: "local", path: "~/skiller/example-skill" },
    installedAt: new Date().toISOString(),
    keepUpdated: false,
    enabled: true,
    validation: { valid: true, issues: [] },
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
    targets: [
      { path: "~/.agents/skills", enabled: true },
      { path: "~/.claude/skills", enabled: true },
      { path: "~/.cursor/skills", enabled: true },
      { path: "~/.pi/agent/skills", enabled: true },
      { path: "~/.gemini/skills", enabled: true },
      { path: "~/.copilot/skills", enabled: true }
    ],
    updateSchedule: { intervalHours: 24 },
    keepAllSkillsUpdated: false,
    launchAtLogin: false,
    trayEnabled: true
  };

  const createPreviewMetadata = (input: {
    id: string;
    name: string;
    description: string;
    libraryPath: string;
    source: SkillSource;
    keepUpdated: boolean;
  }): SkillMetadata => ({
    id: input.id,
    name: input.name,
    description: input.description,
    libraryPath: input.libraryPath,
    source: input.source,
    installedAt: new Date().toISOString(),
    contentHash: "preview",
    keepUpdated: input.keepUpdated,
    enabled: true,
    validation: { valid: true, issues: [] }
  });

  const addPreviewSkill = (metadata: SkillMetadata): SkillMetadata => {
    fallbackSkills.push(metadata);
    return metadata;
  };

  return {
    listLibrary: async () => fallbackSkills,
    setSkillEnabled: async (skillId, enabled) => {
      const skill = fallbackSkills.find((candidate) => candidate.id === skillId);
      if (skill) skill.enabled = enabled;
      return fallbackSkills;
    },
    deleteSkill: async (skillId) => {
      const index = fallbackSkills.findIndex((candidate) => candidate.id === skillId);
      if (index !== -1) fallbackSkills.splice(index, 1);
      return fallbackSkills;
    },
    scanTargets: async () => ({ imported: [], enabled: [], disabled: [], errors: [] }),
    saveTargets: async (targets) => {
      config = { ...config, targets };
      return config;
    },
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
    installLocal: async () => null,
    installGithub: async (input) => {
      const id = input.githubPath?.split("/").filter(Boolean).at(-1) ?? "github-preview";
      return addPreviewSkill(createPreviewMetadata({
        id,
        name: id,
        description: "GitHub preview skill",
        libraryPath: `~/skiller/${id}`,
        source: {
          type: "github",
          githubUrl: input.githubUrl,
          ...(input.githubPath ? { githubPath: input.githubPath } : {}),
          ...(input.ref ? { ref: input.ref } : {}),
          commit: "preview"
        },
        keepUpdated: true
      }));
    },
    discoverGithub: async (githubUrl) => {
      if (/\/tree\/|\/blob\/|raw\.githubusercontent\.com/.test(githubUrl)) {
        return {
          repositoryOnly: false,
          githubUrl,
          ref: "main",
          commit: "preview",
          skills: []
        };
      }

      return {
        repositoryOnly: true,
        githubUrl,
        ref: "HEAD",
        commit: "preview",
        skills: [
          {
            name: "alpha-skill",
            path: "skills/alpha-skill",
            description: "Preview GitHub repository skill",
            githubUrl,
            githubPath: "skills/alpha-skill",
            ref: "HEAD",
            commit: "preview"
          },
          {
            name: "beta-skill",
            path: "skills/beta-skill",
            githubUrl,
            githubPath: "skills/beta-skill",
            ref: "HEAD",
            commit: "preview"
          }
        ]
      };
    },
    installRegistry: async (skillsShId) =>
      addPreviewSkill(createPreviewMetadata({
        id: skillsShId,
        name: skillsShId,
        description: "Registry preview skill",
        libraryPath: `~/skiller/${skillsShId}`,
        source: {
          type: "skills.sh",
          skillsShId,
          githubUrl: "https://github.com/example/skills",
          ref: "main",
          commit: "preview"
        },
        keepUpdated: true
      })),
    leaderboard: async () => ({ skills: fallbackDiscoverSkills }),
    search: async (query) => {
      const normalizedQuery = query.toLowerCase();
      return {
        skills: fallbackDiscoverSkills.filter((skill) =>
          Object.values(skill).some((value) => String(value).toLowerCase().includes(normalizedQuery))
        )
      };
    },
    registrySkill: async (id) =>
      fallbackDiscoverSkills.find((skill) => skill.id === id) ?? {
        id,
        name: id,
        description: "Preview registry skill",
        githubUrl: "https://github.com/example/skills"
      },
    registryAudit: async (id) => ({
      id,
      score: 100,
      issues: [],
      checkedAt: new Date().toISOString()
    }),
    onCheckUpdates: () => () => undefined,
    onScanError: () => () => undefined
  };
}

export const skillerApi = window.skiller ?? createBrowserPreviewApi();
