import type {
  DiscoverGithubSkillsResult,
  LibraryState as CoreLibraryState,
  SaveSkillSetInput,
  ScanTargetsResult,
  SkillSource,
  SkillSetMetadata,
  SkillerConfig,
  TargetConfig
} from "@skiller/core";

export type { SaveSkillSetInput, SkillSetMetadata };

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
  tags: string[];
  validation: ValidationResult;
}

export type LibraryState = CoreLibraryState;
export type DiscoverSkill = Record<string, unknown>;
export interface SetSkillSetEnabledResult {
  state: LibraryState;
  scanErrors: ScanTargetsResult["errors"];
}

export interface ScanError {
  message: string;
}

export type ConfigUpdate = Partial<
  Pick<SkillerConfig, "libraryPath" | "keepAllSkillsUpdated" | "targets" | "globalTargetInstallMode" | "projectTargetInstallMode">
>;

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

export type AppUpdateStatus = "idle" | "checking" | "downloading" | "ready" | "not-available" | "unsupported" | "error";

export interface AppUpdateState {
  status: AppUpdateStatus;
  version?: string;
  releaseName?: string;
  releaseDate?: string;
  progress?: number;
  error?: string;
}

export type RemoveListener = () => void;

export interface SkillerApi {
  listLibrary: () => Promise<LibraryState>;
  setSkillEnabled: (skillId: string, enabled: boolean) => Promise<LibraryState>;
  deleteSkill: (skillId: string) => Promise<LibraryState>;
  saveSkillSet: (input: SaveSkillSetInput) => Promise<LibraryState>;
  setSkillMembership: (skillId: string, skillSetIds: string[]) => Promise<LibraryState>;
  deleteSkillSet: (skillSetId: string) => Promise<LibraryState>;
  replaceSkillTags: (skillId: string, tags: string[]) => Promise<LibraryState>;
  setSkillSetEnabled: (skillSetId: string, enabled: boolean) => Promise<SetSkillSetEnabledResult>;
  scanTargets: () => Promise<ScanTargetsResult>;
  saveTargets: (targets: TargetConfig[]) => Promise<SkillerConfig>;
  chooseTargetDirectory: () => Promise<string | null>;
  getConfig: () => Promise<SkillerConfig>;
  saveConfig: (config: ConfigUpdate) => Promise<SkillerConfig>;
  checkUpdates: () => Promise<UpdateCheckResult>;
  updateSkill: (skillId: string) => Promise<SkillMetadata>;
  installLocal: () => Promise<SkillMetadata | null>;
  installGithub: (input: { githubUrl: string; githubPath?: string; ref?: string }) => Promise<SkillMetadata | null>;
  discoverGithub: (githubUrl: string) => Promise<DiscoverGithubSkillsResult>;
  installRegistry: (input: string | { skillsShId: string; registrySkill?: DiscoverSkill }) => Promise<SkillMetadata | null>;
  leaderboard: (type: LeaderboardType) => Promise<{ skills: DiscoverSkill[] }>;
  search: (query: string) => Promise<{ skills: DiscoverSkill[] }>;
  registrySkill: (id: string) => Promise<DiscoverSkill>;
  registryAudit: (id: string) => Promise<DiscoverSkill>;
  getAppUpdateState: () => Promise<AppUpdateState>;
  checkAppUpdate: () => Promise<AppUpdateState>;
  installAppUpdate: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  onAppUpdateState: (callback: (state: AppUpdateState) => void) => RemoveListener;
  onCheckUpdates: (callback: () => void) => RemoveListener;
  onScanError: (callback: (error: ScanError) => void) => RemoveListener;
}

type LegacyLibraryState = LibraryState & SkillMetadata[];
type RendererSkillerApi = Omit<
  SkillerApi,
  | "listLibrary"
  | "setSkillEnabled"
  | "deleteSkill"
  | "saveSkillSet"
  | "setSkillMembership"
  | "deleteSkillSet"
  | "replaceSkillTags"
  | "setSkillSetEnabled"
> & {
  listLibrary: () => Promise<LegacyLibraryState>;
  setSkillEnabled: (skillId: string, enabled: boolean) => Promise<LegacyLibraryState>;
  deleteSkill: (skillId: string) => Promise<LegacyLibraryState>;
  saveSkillSet: (input: SaveSkillSetInput) => Promise<LegacyLibraryState>;
  setSkillMembership: (skillId: string, skillSetIds: string[]) => Promise<LegacyLibraryState>;
  deleteSkillSet: (skillSetId: string) => Promise<LegacyLibraryState>;
  replaceSkillTags: (skillId: string, tags: string[]) => Promise<LegacyLibraryState>;
  setSkillSetEnabled: (skillSetId: string, enabled: boolean) => Promise<SetSkillSetEnabledResult & { state: LegacyLibraryState }>;
};

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
    tags: [],
    validation: { valid: true, issues: [] },
  }
];

const fallbackSkillSets: SkillSetMetadata[] = [];

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
    globalTargetInstallMode: "symlink",
    projectTargetInstallMode: "symlink",
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
      tags: [],
      validation: { valid: true, issues: [] }
    };
  };

  const fallbackLibraryState = (): LibraryState => ({
    skills: fallbackSkills,
    skillSets: fallbackSkillSets,
    tags: Array.from(new Set(fallbackSkills.flatMap((skill) => skill.tags))).sort((left, right) =>
      left.localeCompare(right)
    )
  });

  const normalizeTag = (value: string): string => value.trim().replace(/\s+/g, " ").toLowerCase();

  const normalizeTags = (tags: string[]): string[] => {
    const seen = new Set<string>();
    const normalizedTags: string[] = [];

    for (const tag of tags) {
      const normalized = normalizeTag(tag);
      if (normalized === "" || seen.has(normalized)) continue;
      seen.add(normalized);
      normalizedTags.push(normalized);
    }

    return normalizedTags;
  };

  const createSkillSetId = (name: string): string => {
    const base = name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "") || "skill-set";
    let candidate = base;
    let suffix = 2;

    while (fallbackSkillSets.some((skillSet) => skillSet.id === candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  };

  const addPreviewSkill = (metadata: SkillMetadata): SkillMetadata => {
    fallbackSkills.push(metadata);
    return metadata;
  };

  const isPreviewUpdateable = (skill: SkillMetadata): skill is SkillMetadata & {
    source: Extract<SkillSource, { type: "github" | "skills.sh" }>;
  } => skill.source.type === "github" || skill.source.type === "skills.sh";

  return {
    listLibrary: async () => fallbackLibraryState(),
    setSkillEnabled: async (skillId, enabled) => {
      const skill = fallbackSkills.find((candidate) => candidate.id === skillId);
      if (skill) skill.enabled = enabled;
      return fallbackLibraryState();
    },
    deleteSkill: async (skillId) => {
      const index = fallbackSkills.findIndex((candidate) => candidate.id === skillId);
      if (index !== -1) fallbackSkills.splice(index, 1);
      for (const skillSet of fallbackSkillSets) {
        skillSet.skillIds = skillSet.skillIds.filter((id) => id !== skillId);
      }
      return fallbackLibraryState();
    },
    saveSkillSet: async (input) => {
      const now = new Date().toISOString();
      if (input.id) {
        const skillSet = fallbackSkillSets.find((candidate) => candidate.id === input.id);
        if (skillSet) {
          skillSet.name = input.name.trim();
          skillSet.skillIds = [...input.skillIds];
          skillSet.targets = input.targets.map((target) => ({ ...target }));
          skillSet.updatedAt = now;
        }
      } else {
        fallbackSkillSets.push({
          id: createSkillSetId(input.name),
          name: input.name.trim(),
          skillIds: [...input.skillIds],
          targets: input.targets.map((target) => ({ ...target })),
          createdAt: now,
          updatedAt: now
        });
      }
      return fallbackLibraryState();
    },
    setSkillMembership: async (skillId, skillSetIds) => {
      const selected = new Set(skillSetIds);
      for (const skillSet of fallbackSkillSets) {
        const shouldInclude = selected.has(skillSet.id);
        const currentlyIncluded = skillSet.skillIds.includes(skillId);
        if (shouldInclude === currentlyIncluded) continue;
        skillSet.skillIds = shouldInclude
          ? [...skillSet.skillIds, skillId]
          : skillSet.skillIds.filter((id) => id !== skillId);
        skillSet.updatedAt = new Date().toISOString();
      }
      return fallbackLibraryState();
    },
    deleteSkillSet: async (skillSetId) => {
      const index = fallbackSkillSets.findIndex((candidate) => candidate.id === skillSetId);
      if (index !== -1) fallbackSkillSets.splice(index, 1);
      return fallbackLibraryState();
    },
    replaceSkillTags: async (skillId, tags) => {
      const skill = fallbackSkills.find((candidate) => candidate.id === skillId);
      if (skill) skill.tags = normalizeTags(tags);
      return fallbackLibraryState();
    },
    setSkillSetEnabled: async (skillSetId, enabled) => {
      const skillSet = fallbackSkillSets.find((candidate) => candidate.id === skillSetId);
      if (skillSet) {
        for (const skill of fallbackSkills) {
          if (skillSet.skillIds.includes(skill.id)) skill.enabled = enabled;
        }
      }
      return { state: fallbackLibraryState(), scanErrors: [] };
    },
    scanTargets: async () => ({ imported: [], enabled: [], disabled: [], errors: [] }),
    saveTargets: async (targets) => {
      config = { ...config, targets };
      return config;
    },
    chooseTargetDirectory: async () => null,
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
    getAppUpdateState: async () => ({ status: "unsupported" }),
    checkAppUpdate: async () => ({ status: "unsupported" }),
    installAppUpdate: async () => {
      throw new Error("App updates are not available in browser preview");
    },
    openExternal: async (url) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onAppUpdateState: () => () => undefined,
    onCheckUpdates: () => () => undefined,
    onScanError: () => () => undefined
  };
}

function legacyArrayLibraryState(state: LibraryState): LegacyLibraryState {
  return Object.assign([...state.skills], state);
}

function createRendererApi(api: SkillerApi): RendererSkillerApi {
  return {
    ...api,
    listLibrary: async () => legacyArrayLibraryState(await api.listLibrary()),
    setSkillEnabled: async (skillId, enabled) =>
      legacyArrayLibraryState(await api.setSkillEnabled(skillId, enabled)),
    deleteSkill: async (skillId) => legacyArrayLibraryState(await api.deleteSkill(skillId)),
    saveSkillSet: async (input) => legacyArrayLibraryState(await api.saveSkillSet(input)),
    setSkillMembership: async (skillId, skillSetIds) =>
      legacyArrayLibraryState(await api.setSkillMembership(skillId, skillSetIds)),
    deleteSkillSet: async (skillSetId) => legacyArrayLibraryState(await api.deleteSkillSet(skillSetId)),
    replaceSkillTags: async (skillId, tags) => legacyArrayLibraryState(await api.replaceSkillTags(skillId, tags)),
    setSkillSetEnabled: async (skillSetId, enabled) => {
      const result = await api.setSkillSetEnabled(skillSetId, enabled);
      return { ...result, state: legacyArrayLibraryState(result.state) };
    }
  };
}

function isElectronRenderer(): boolean {
  return typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent);
}

function resolveSkillerApi(): SkillerApi {
  if (!window.skiller) {
    return createBrowserPreviewApi();
  }

  // Electron must use the preload bridge as-is so stale partial bridges surface clearly.
  if (isElectronRenderer()) {
    return window.skiller;
  }

  // Browser preview/e2e may stub individual methods on top of the default preview API.
  return { ...createBrowserPreviewApi(), ...window.skiller };
}

export const skillerApi = createRendererApi(resolveSkillerApi());
