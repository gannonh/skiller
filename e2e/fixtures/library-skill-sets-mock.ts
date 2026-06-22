export function installLibrarySkillSetsMock() {
  const skill = (id: string, tags: string[], enabled = true) => ({
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
    skillSets: [] as Array<{
      id: string;
      name: string;
      skillIds: string[];
      targets: Array<{ path: string; enabled: boolean; scope?: string }>;
      createdAt: string;
      updatedAt: string;
    }>,
    tags: ["browser", "testing", "automation"]
  };
  const refreshTags = () => {
    state.tags = Array.from(new Set(state.skills.flatMap((candidate) => candidate.tags))).sort();
  };
  const createSkillSetId = (name: string) => {
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
    saveSkillSet: async (input: {
      id?: string;
      name: string;
      skillIds: string[];
      targets: Array<{ path: string; enabled: boolean; scope?: string }>;
    }) => {
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
          createdAt: now,
          updatedAt: now
        });
      }
      return state;
    },
    setSkillMembership: async (skillId: string, skillSetIds: string[]) => {
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
    deleteSkillSet: async (skillSetId: string) => {
      state.skillSets = state.skillSets.filter((candidate) => candidate.id !== skillSetId);
      return state;
    },
    replaceSkillTags: async (skillId: string, tags: string[]) => {
      const target = state.skills.find((candidate) => candidate.id === skillId);
      if (target) target.tags = tags;
      refreshTags();
      return state;
    },
    setSkillSetEnabled: async (skillSetId: string, enabled: boolean) => {
      const skillSet = state.skillSets.find((candidate) => candidate.id === skillSetId);
      if (skillSet) {
        for (const candidate of state.skills) {
          if (skillSet.skillIds.includes(candidate.id)) candidate.enabled = enabled;
        }
      }
      return { state, scanErrors: [] };
    }
  };
}
