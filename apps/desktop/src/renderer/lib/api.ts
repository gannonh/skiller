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
  updatedAt?: string;
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
  updateSkill: (skillId: string) => Promise<SkillMetadata>;
  installLocal: () => Promise<SkillMetadata | null>;
  installGithub: (input: { githubUrl: string; githubPath?: string; ref?: string }) => Promise<SkillMetadata>;
  discoverGithub: (githubUrl: string) => Promise<DiscoverGithubSkillsResult>;
  installRegistry: (input: string | { skillsShId: string; registrySkill?: DiscoverSkill }) => Promise<SkillMetadata>;
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
  {
    id: "agent-browser",
    name: "agent-browser",
    description: "Browser automation CLI for agent workflows",
    source: "vercel-labs/agent-browser",
    installs: 259000
  },
  {
    id: "find-skills",
    name: "find-skills",
    description: "Discover and install agent skills",
    source: "vercel-labs/skills",
    installs: 1500000
  },
  {
    id: "frontend-design",
    name: "frontend-design",
    description: "Frontend design guidance for agents",
    source: "anthropics/skills",
    installs: 394900
  },
  {
    id: "browser-use",
    name: "browser-use",
    description: "Automate browser-based QA flows",
    source: "browser-use/browser-use",
    installs: 88000
  },
  {
    id: "github-ci",
    name: "github-ci",
    description: "Fix GitHub Actions failures",
    source: "gannonh/skills",
    installs: 42000
  },
  {
    id: "user-acceptance",
    name: "user-acceptance",
    description: "Collect UAT evidence for finished work",
    source: "gannonh/skills",
    installs: 31000
  },
  {
    id: "linear",
    name: "linear",
    description: "Manage Linear issues from agents",
    source: "gannonh/skills",
    installs: 29000
  },
  {
    id: "printing-press",
    name: "printing-press",
    description: "Generate API CLIs",
    source: "gannonh/skills",
    installs: 26000
  },
  {
    id: "pull-requests",
    name: "pull-requests",
    description: "Work through pull request flows",
    source: "gannonh/skills",
    installs: 24000
  },
  {
    id: "kata-health",
    name: "kata-health",
    description: "Check Kata project health",
    source: "gannonh/skills",
    installs: 18000
  },
  {
    id: "visual-explainer",
    name: "visual-explainer",
    description: "Generate visual technical explainers",
    source: "gannonh/skills",
    installs: 12000
  }
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
  }): SkillMetadata => {
    const now = new Date().toISOString();
    return {
      id: input.id,
      name: input.name,
      description: input.description,
      libraryPath: input.libraryPath,
      source: input.source,
      installedAt: now,
      updatedAt: now,
      contentHash: "preview",
      keepUpdated: input.keepUpdated,
      enabled: true,
      validation: { valid: true, issues: [] }
    };
  };

  const addPreviewSkill = (metadata: SkillMetadata): SkillMetadata => {
    fallbackSkills.push(metadata);
    return metadata;
  };

  const isPreviewUpdateable = (skill: SkillMetadata): skill is SkillMetadata & {
    source: Extract<SkillSource, { type: "github" | "skills.sh" }>;
  } => skill.source.type === "github" || skill.source.type === "skills.sh";

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
    checkUpdates: async () => {
      const available = fallbackSkills
        .filter(isPreviewUpdateable)
        .filter((skill) => skill.source.commit === "preview")
        .map((skill) => ({
          id: skill.id,
          name: skill.name,
          currentCommit: skill.source.commit,
          remoteCommit: "preview-updated"
        }));

      return {
        checkedAt: new Date().toISOString(),
        considered: fallbackSkills.map((skill) => ({ id: skill.id, name: skill.name })),
        available,
        updated: [],
        errors: []
      };
    },
    updateSkill: async (skillId) => {
      const skill = fallbackSkills.find((candidate) => candidate.id === skillId || candidate.name === skillId);
      if (!skill) throw new Error(`Skill not found: ${skillId}`);
      if (skill.source.type === "github" || skill.source.type === "skills.sh") {
        skill.source.commit = "preview-updated";
        skill.contentHash = "preview-updated";
        skill.updatedAt = new Date().toISOString();
      }
      return skill;
    },
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

      if (githubUrl.includes("many-skills")) {
        return {
          repositoryOnly: true,
          githubUrl,
          ref: "HEAD",
          commit: "preview",
          skills: Array.from({ length: 28 }, (_, index) => {
            const number = String(index + 1).padStart(2, "0");
            const name = `skill-${number}`;
            return {
              name,
              path: `skills/${name}`,
              description: `Preview GitHub repository skill ${number}`,
              githubUrl,
              githubPath: `skills/${name}`,
              ref: "HEAD",
              commit: "preview"
            };
          })
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
    installRegistry: async (input) => {
      const skillsShId = typeof input === "string" ? input : input.skillsShId;
      const registrySkill = typeof input === "string" ? undefined : input.registrySkill;
      const source = typeof registrySkill?.source === "string" ? registrySkill.source : "example/skills";
      const sourceSkillId =
        skillsShId === "frontend-design" ? `${source}/${skillsShId}` : skillsShId;

      return addPreviewSkill(createPreviewMetadata({
        id: skillsShId,
        name: skillsShId,
        description: "Registry preview skill",
        libraryPath: `~/skiller/${skillsShId}`,
        source: {
          type: "skills.sh",
          skillsShId: sourceSkillId,
          githubUrl: "https://github.com/example/skills",
          ref: "main",
          commit: "preview"
        },
        keepUpdated: true
      }));
    },
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
