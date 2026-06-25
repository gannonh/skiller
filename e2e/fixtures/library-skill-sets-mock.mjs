export function installLibrarySkillSetsMock() {
  const skill = (id, tags, enabled = true) => ({
    id,
    name: id,
    libraryPath: `/tmp/${id}`,
    source: { type: "local", path: `/tmp/${id}` },
    installedAt: "2026-05-12T00:00:00.000Z",
    keepUpdated: false,
    enabled,
    tags,
    validation: { valid: true, issues: [] }
  });
  const state = {
    skills: [
      skill("alpha-skill", ["browser", "testing"]),
      skill("beta-skill", ["browser"], false),
      skill("gamma-skill", ["automation"])
    ],
    skillSets: [],
    tags: ["browser", "testing", "automation"]
  };
  const refreshTags = () => {
    state.tags = Array.from(new Set(state.skills.flatMap((candidate) => candidate.tags))).sort();
  };
  const createSkillSetId = (name) => {
    const base =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^[.-]+|[.-]+$/g, "") || "skill-set";
    let id = base;
    let suffix = 2;
    while (state.skillSets.some((candidate) => candidate.id === id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    return id;
  };

  window.skiller = {
    listLibrary: async () => state,
    saveSkillSet: async (input) => {
      const now = "2026-05-12T00:00:00.000Z";
      if (input.id) {
        const skillSet = state.skillSets.find((candidate) => candidate.id === input.id);
        if (!skillSet) {
          throw new Error(`Skill set not found: ${input.id}`);
        }
        skillSet.name = input.name.trim();
        skillSet.skillIds = [...input.skillIds];
        skillSet.targets = input.targets.map((target) => ({ ...target }));
        skillSet.updatedAt = now;
      } else {
        state.skillSets.push({
          id: createSkillSetId(input.name),
          name: input.name.trim(),
          skillIds: [...input.skillIds],
          targets: input.targets.map((target) => ({ ...target })),
          enabled: true,
          createdAt: now,
          updatedAt: now
        });
      }
      return state;
    },
    setSkillMembership: async (skillId, skillSetIds) => {
      const selected = new Set(skillSetIds);
      for (const skillSet of state.skillSets) {
        const shouldInclude = selected.has(skillSet.id);
        const currentlyIncluded = skillSet.skillIds.includes(skillId);
        if (shouldInclude === currentlyIncluded) continue;
        skillSet.skillIds = shouldInclude
          ? [...skillSet.skillIds, skillId]
          : skillSet.skillIds.filter((id) => id !== skillId);
      }
      return state;
    },
    deleteSkillSet: async (skillSetId) => {
      state.skillSets = state.skillSets.filter((candidate) => candidate.id !== skillSetId);
      return state;
    },
    replaceSkillTags: async (skillId, tags) => {
      const target = state.skills.find((candidate) => candidate.id === skillId);
      if (target) target.tags = tags;
      refreshTags();
      return state;
    },
    setSkillSetEnabled: async (skillSetId, enabled) => {
      const skillSet = state.skillSets.find((candidate) => candidate.id === skillSetId);
      if (skillSet) {
        skillSet.enabled = enabled;
        skillSet.updatedAt = "2026-05-12T00:00:00.000Z";
      }
      return { state, scanErrors: [] };
    },
    setSkillEnabled: async () => state,
    deleteSkill: async () => state,
    scanTargets: async () => ({ imported: [], enabled: [], disabled: [], errors: [] }),
    saveTargets: async (targets) => ({
      libraryPath: "~/skiller",
      targets,
      globalTargetInstallMode: "symlink",
      projectTargetInstallMode: "symlink",
      updateSchedule: { intervalHours: 24 },
      keepAllSkillsUpdated: false,
      launchAtLogin: false,
      trayEnabled: true
    }),
    getConfig: async () => ({
      libraryPath: "~/skiller",
      targets: [],
      globalTargetInstallMode: "symlink",
      projectTargetInstallMode: "symlink",
      updateSchedule: { intervalHours: 24 },
      keepAllSkillsUpdated: false,
      launchAtLogin: false,
      trayEnabled: true
    }),
    saveConfig: async () => ({
      libraryPath: "~/skiller",
      targets: [],
      globalTargetInstallMode: "symlink",
      projectTargetInstallMode: "symlink",
      updateSchedule: { intervalHours: 24 },
      keepAllSkillsUpdated: false,
      launchAtLogin: false,
      trayEnabled: true
    }),
    checkUpdates: async () => ({ checkedAt: new Date().toISOString(), considered: [], available: [], updated: [], errors: [] }),
    updateSkill: async () => {
      throw new Error("not implemented");
    },
    installLocal: async () => null,
    installGithub: async () => null,
    discoverGithub: async () => ({ repositoryOnly: false, githubUrl: "", ref: "HEAD", commit: "", skills: [] }),
    installRegistry: async () => null,
    leaderboard: async () => ({ skills: [] }),
    search: async () => ({ skills: [] }),
    registrySkill: async (id) => ({ id }),
    registryAudit: async (id) => ({ id }),
    getAppUpdateState: async () => ({ status: "unsupported" }),
    checkAppUpdate: async () => ({ status: "unsupported" }),
    installAppUpdate: async () => undefined,
    openExternal: async () => undefined,
    onAppUpdateState: () => () => undefined,
    onCheckUpdates: () => () => undefined,
    onScanError: () => () => undefined
  };
}
