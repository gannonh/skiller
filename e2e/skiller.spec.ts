import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __installAppUpdateCalls?: number;
  }
}

test("renders the library from the browser preview API", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Installed master skills")).toBeVisible();
  await expect(page.getByText("1 master skills")).toBeVisible();
  await expect(page.getByRole("cell", { name: "example-skill", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Enabled" })).toBeVisible();
});

test("focuses the tag input when editing row tags", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("row", { name: /example-skill/ }).getByRole("button", { name: "Edit tags for example-skill" }).click();

  await expect(page.getByRole("combobox", { name: "Tags for example-skill" })).toBeFocused();
});

test("uses a compact tag edit action", async ({ page }) => {
  await page.goto("/");

  const editButton = page.getByRole("row", { name: /example-skill/ }).getByRole("button", { name: "Edit tags for example-skill" });
  const box = await editButton.boundingBox();

  expect(box).not.toBeNull();
  expect(box!.width).toBeLessThanOrEqual(26);
  expect(box!.height).toBeLessThanOrEqual(26);
});

test("tokenizes row tags with comma and enter", async ({ page }) => {
  await page.goto("/");

  const row = page.getByRole("row", { name: /example-skill/ });
  await row.getByRole("button", { name: "Edit tags for example-skill" }).click();
  const input = page.getByRole("combobox", { name: "Tags for example-skill" });

  await input.fill("frameworks,");
  await expect(row.getByText("frameworks")).toBeVisible();

  await input.fill("tdd");
  await input.press("Enter");
  await expect(row.getByText("tdd")).toBeVisible();

  await row.getByRole("button", { name: "Save tags for example-skill" }).click();
  await expect(row.getByText("frameworks")).toBeVisible();
  await expect(row.getByText("tdd")).toBeVisible();
});

test("autocompletes row tags from existing library tags", async ({ page }) => {
  await page.addInitScript(() => {
    const skill = (id, tags) => ({
      id,
      name: id,
      libraryPath: `/tmp/${id}`,
      source: { type: "local", path: `/tmp/${id}` },
      installedAt: "2026-05-12T00:00:00.000Z",
      keepUpdated: false,
      enabled: true,
      tags,
      validation: { valid: true, issues: [] }
    });
    const libraryState = { skills: [skill("tag-source", ["frameworks"]), skill("target-skill", [])], skillSets: [], tags: ["frameworks"] };
    window.skiller = {
      listLibrary: async () => libraryState,
      replaceSkillTags: async (skillId, tags) => {
        const target = libraryState.skills.find((candidate) => candidate.id === skillId);
        if (target) target.tags = tags;
        libraryState.tags = Array.from(new Set(libraryState.skills.flatMap((candidate) => candidate.tags))).sort();
        return libraryState;
      }
    };
  });
  await page.goto("/");

  const row = page.getByRole("row", { name: /target-skill/ });
  await row.getByRole("button", { name: "Edit tags for target-skill" }).click();
  const input = page.getByRole("combobox", { name: "Tags for target-skill" });
  await input.fill("fra");

  await page.getByRole("option", { name: "frameworks" }).click();

  await expect(row.getByText("frameworks")).toBeVisible();
});

test("manages skill sets and tag filters from the library", async ({ page }) => {
  await page.addInitScript(() => {
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
      skills: [skill("alpha-skill", ["browser", "testing"]), skill("beta-skill", ["browser"], false)],
      skillSets: [],
      tags: ["browser", "testing"]
    };
    const refreshTags = () => {
      state.tags = Array.from(new Set(state.skills.flatMap((candidate) => candidate.tags))).sort();
    };
    window.skiller = {
      listLibrary: async () => state,
      createSkillSet: async (name) => {
        state.skillSets.push({
          id: name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "") || "skill-set",
          name: name.trim(),
          createdAt: "2026-05-12T00:00:00.000Z",
          updatedAt: "2026-05-12T00:00:00.000Z"
        });
        return state;
      },
      renameSkillSet: async (skillSetId, name) => {
        const skillSet = state.skillSets.find((candidate) => candidate.id === skillSetId);
        if (skillSet) skillSet.name = name.trim();
        return state;
      },
      deleteSkillSet: async (skillSetId) => {
        state.skillSets = state.skillSets.filter((candidate) => candidate.id !== skillSetId);
        for (const candidate of state.skills) {
          if (candidate.skillSetId === skillSetId) delete candidate.skillSetId;
        }
        return state;
      },
      assignSkillSet: async (skillId, skillSetId) => {
        const target = state.skills.find((candidate) => candidate.id === skillId);
        if (target) {
          if (skillSetId) target.skillSetId = skillSetId;
          else delete target.skillSetId;
        }
        return state;
      },
      replaceSkillTags: async (skillId, tags) => {
        const target = state.skills.find((candidate) => candidate.id === skillId);
        if (target) target.tags = tags;
        refreshTags();
        return state;
      },
      setSkillSetEnabled: async (skillSetId, enabled) => {
        for (const candidate of state.skills) {
          if (candidate.skillSetId === skillSetId) candidate.enabled = enabled;
        }
        return { state, scanErrors: [] };
      }
    };
  });
  await page.goto("/");

  await page.getByLabel("New skill set name").fill("Agent v1.0");
  await page.getByRole("button", { name: "Create set" }).click();
  await expect(page.getByRole("button", { name: "Agent v1.0", exact: true })).toHaveAttribute("aria-pressed", "false");

  await page.getByLabel("Set for alpha-skill").selectOption("agent-v1.0");
  await page.getByLabel("Set for beta-skill").selectOption("agent-v1.0");
  await expect(page.getByText("2 members")).toBeVisible();
  await expect(page.getByText("mixed")).toBeVisible();

  await page.getByRole("button", { name: "browser" }).click();
  await page.getByRole("button", { name: "testing" }).click();
  await expect(page.getByRole("cell", { name: "alpha-skill", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "beta-skill", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "browser" }).press("Tab");
  await expect(page.getByRole("button", { name: "testing" })).toBeFocused();
  await page.getByRole("button", { name: "testing" }).click();
  await expect(page.getByRole("cell", { name: "beta-skill", exact: true })).toBeVisible();

  await page.getByLabel("Enable Agent v1.0").click();
  await expect(page.locator('[data-slot="badge"]').filter({ hasText: /^on$/ })).toBeVisible();

  await page.getByRole("button", { name: "Rename Agent v1.0" }).click();
  await page.getByLabel("Rename skill set").fill("Runtime");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByRole("button", { name: "Runtime", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Delete Runtime" }).click();
  await expect(page.getByRole("button", { name: "Runtime", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Set for alpha-skill")).toHaveValue("none");
});

test("deletes a library skill from the browser preview API", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("row", { name: /example-skill/ }).getByRole("button", { name: "Delete example-skill" }).click();

  await expect(page.getByText("0 master skills")).toBeVisible();
  await expect(page.getByRole("cell", { name: "example-skill", exact: true })).toHaveCount(0);
});

test("sorts library columns with name as the default", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("GitHub URL").fill("https://github.com/example/skills");
  await page.getByRole("button", { name: "Add from GitHub" }).click();

  await expect(page.getByRole("heading", { name: "GitHub Skills" })).toBeVisible();
  await expect(page.getByRole("row", { name: /alpha-skill/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /beta-skill/ })).toBeVisible();
  await page.getByRole("button", { name: "Install selected" }).click();
  await expect(page.getByRole("cell", { name: "beta-skill", exact: true })).toBeVisible();

  for (const column of ["Name", "Source", "Skill Set", "Status", "Enabled", "Actions"]) {
    await expect(page.getByRole("button", { name: `Sort by ${column}` })).toBeVisible();
  }

  const rows = page.locator("tbody tr");
  await expect(rows.nth(0).locator("td").first()).toHaveText("alpha-skill");
  await expect(rows.nth(1).locator("td").first()).toHaveText("beta-skill");
  await expect(rows.nth(2).locator("td").first()).toHaveText("example-skill");

  await page.getByRole("button", { name: "Sort by Name" }).click();

  await expect(rows.nth(0).locator("td").first()).toHaveText("example-skill");
  await expect(rows.nth(1).locator("td").first()).toHaveText("beta-skill");
  await expect(rows.nth(2).locator("td").first()).toHaveText("alpha-skill");
});

test("shows configured target directories and refreshes scans", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Targets" }).click();

  await expect(page.getByText("Default and custom agent skill directories")).toBeVisible();
  await expect(page.getByText("~/.agents/skills")).toBeVisible();
  await expect(page.getByText("~/.claude/skills")).toBeVisible();

  await page.getByRole("button", { name: "Sync Targets" }).click();

  await expect(page.getByText("Sync complete: 0 changes, 0 errors")).toBeVisible();
});

test("validates settings paths in browser preview mode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();

  await expect(page.getByText("Library, scan, startup, and tray behavior")).toBeVisible();
  const input = page.getByLabel("Master library path");
  await expect(input).toHaveValue("~/skiller");

  await input.fill("relative/path");
  await page.getByRole("button", { name: "Save Settings" }).click();
  await expect(page.getByText("Library path must be absolute or start with ~/")).toBeVisible();

  await input.fill("/tmp/skiller");
  await page.getByRole("button", { name: "Save Settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await expect(input).toHaveValue("/tmp/skiller");
});

test("searches discover results", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Discover" }).click();

  await expect(page.getByText("Skills Leaderboard (skills.sh)")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "#" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Installs" })).toBeVisible();
  await expect(page.getByRole("row", { name: /agent-browser vercel-labs\/agent-browser 259K/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /kata-health gannonh\/skills/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more skills" })).toBeVisible();

  await page.getByRole("button", { name: "Load more skills" }).click();
  await expect(page.getByRole("row", { name: /visual-explainer gannonh\/skills/ })).toBeVisible();

  await page.getByPlaceholder("Search skills.sh").fill("browser");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByText("Search results for browser")).toBeVisible();
  await expect(page.getByRole("cell", { name: "agent-browser" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "browser-use" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "find-skills" })).toHaveCount(0);
});

test("shows provenance in the library and navigates to discover", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("columnheader", { name: "Source" })).toBeVisible();
  await expect(page.getByText("Local", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Browse skills.sh registry" }).click();
  await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
});

test("installs a GitHub skill from one URL field in preview mode", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByPlaceholder("Path")).toHaveCount(0);
  await expect(page.getByPlaceholder("Ref")).toHaveCount(0);
  await page.getByLabel("GitHub URL").fill("https://github.com/gannonh/skills/tree/main/fix-github-ci");
  await page.getByRole("button", { name: "Add from GitHub" }).click();

  await expect(page.getByRole("cell", { name: "github-preview", exact: true })).toBeVisible();
});

test("selects skills from a GitHub repository preview", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("GitHub URL").fill("https://github.com/example/skills");
  await page.getByRole("button", { name: "Add from GitHub" }).click();

  await expect(page.getByRole("heading", { name: "GitHub Skills" })).toBeVisible();
  await expect(page.getByRole("row", { name: /alpha-skill/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /beta-skill/ })).toBeVisible();
  await page.getByRole("row", { name: /beta-skill/ }).getByRole("checkbox").click();
  await page.getByRole("button", { name: "Install selected" }).click();

  await expect(page.getByRole("cell", { name: "alpha-skill", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "beta-skill", exact: true })).toHaveCount(0);
});

test("keeps GitHub repository install actions visible for long skill lists", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("GitHub URL").fill("https://github.com/example/many-skills");
  await page.getByRole("button", { name: "Add from GitHub" }).click();

  await expect(page.getByRole("heading", { name: "GitHub Skills" })).toBeVisible();
  await expect(page.getByRole("row", { name: /skill-28/ })).toBeVisible();

  const installButton = page.getByRole("button", { name: "Install selected" });
  await expect(installButton).toBeVisible();
  const buttonBox = await installButton.boundingBox();
  const viewport = page.viewportSize();

  expect(buttonBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(viewport!.height);
});

test("installs a registry result from Discover preview mode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Discover" }).click();

  await page.getByRole("row", { name: /agent-browser/ }).getByRole("button", { name: "Install" }).click();
  await expect(page.getByRole("row", { name: /agent-browser/ }).getByRole("button", { name: "Installed" })).toBeVisible();

  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("cell", { name: "agent-browser", exact: true })).toBeVisible();
  await expect(page.getByText("Registry", { exact: true })).toBeVisible();
});

test("marks existing registry skills as installed by source alias", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Discover" }).click();

  await page.getByRole("row", { name: /frontend-design/ }).getByRole("button", { name: "Install" }).click();

  await expect(page.getByRole("row", { name: /frontend-design/ }).getByRole("button", { name: "Installed" })).toBeVisible();
});

test("hides the app update button until a downloaded app update is ready", async ({ page }) => {
  await page.addInitScript(() => {
    window.skiller = {
      getAppUpdateState: async () => ({ status: "checking" }),
      onAppUpdateState: () => () => undefined,
      listLibrary: async () => ({ skills: [], skillSets: [], tags: [] })
    };
  });

  await page.goto("/");

  await expect(page.getByRole("button", { name: /Install app update/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Updates" })).toBeVisible();
});

test("installs a ready app update from the left panel heading", async ({ page }) => {
  await page.addInitScript(() => {
    window.__installAppUpdateCalls = 0;
    window.skiller = {
      getAppUpdateState: async () => ({ status: "ready", version: "0.2.2" }),
      installAppUpdate: async () => {
        window.__installAppUpdateCalls += 1;
      },
      onAppUpdateState: () => () => undefined,
      listLibrary: async () => ({ skills: [], skillSets: [], tags: [] })
    };
  });

  await page.goto("/");

  await page.getByRole("button", { name: "Install app update 0.2.2" }).click();
  await expect.poll(() => page.evaluate(() => window.__installAppUpdateCalls)).toBe(1);
});

test("keeps app update UI separate from skill updates", async ({ page }) => {
  await page.addInitScript(() => {
    window.skiller = {
      getAppUpdateState: async () => ({ status: "ready", version: "0.2.2" }),
      onAppUpdateState: () => () => undefined,
      listLibrary: async () => ({ skills: [], skillSets: [], tags: [] }),
      checkUpdates: async () => ({ checkedAt: new Date().toISOString(), considered: [], available: [], updated: [], errors: [] })
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Updates" }).click();

  await expect(page.getByRole("heading", { name: "Updates" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Install app update 0.2.2" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check for Updates" })).toBeVisible();
});

test("lists updateable skills on the Updates page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Discover" }).click();
  await page.getByRole("row", { name: /agent-browser/ }).getByRole("button", { name: "Install" }).click();
  await page.getByRole("button", { name: "Updates", exact: true }).click();

  await expect(page.getByRole("columnheader", { name: "Source" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sort by Last Updated" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "agent-browser" })).toBeVisible();
  await expect(page.getByText("Registry")).toBeVisible();
  await expect(page.getByText("Skills added from GitHub or skills.sh can be updated")).toBeVisible();
  await expect(page.getByText("Keep all skills updated")).toHaveCount(0);
});

test("updates an available skill from the Updates page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Discover" }).click();
  await page.getByRole("row", { name: /agent-browser/ }).getByRole("button", { name: "Install" }).click();
  await page.getByRole("button", { name: "Updates", exact: true }).click();
  await page.getByRole("button", { name: "Check for Updates" }).click();

  const row = page.getByRole("row", { name: /agent-browser/ });
  await expect(row.getByRole("button", { name: "Update agent-browser" })).toBeVisible();
  await row.getByRole("button", { name: "Update agent-browser" }).click();

  await expect(row.getByRole("button", { name: "updated" })).toBeVisible();

  await page.getByRole("button", { name: "Library" }).click();
  await page.getByRole("button", { name: "Updates", exact: true }).click();
  await expect(page.getByRole("row", { name: /agent-browser/ }).getByText("current")).toBeVisible();
});

test("shows update check errors without marking rows current", async ({ page }) => {
  await page.addInitScript(() => {
    const skill = {
      id: "rate-limited",
      name: "rate-limited",
      libraryPath: "/tmp/rate-limited",
      source: {
        type: "github",
        githubUrl: "https://github.com/example/skills",
        githubPath: "skills/rate-limited",
        ref: "HEAD",
        commit: "abc123"
      },
      installedAt: "2026-05-11T00:00:00.000Z",
      updatedAt: "2026-05-11T00:00:00.000Z",
      keepUpdated: true,
      enabled: true,
      tags: [],
      validation: { valid: true, issues: [] }
    };
    const libraryState = { skills: [skill], skillSets: [], tags: [] };
    window.skiller = {
      listLibrary: async () => libraryState,
      setSkillEnabled: async () => libraryState,
      deleteSkill: async () => libraryState,
      scanTargets: async () => ({ imported: [], enabled: [], disabled: [], errors: [] }),
      saveTargets: async (targets) => ({
        libraryPath: "~/skiller",
        targets,
        updateSchedule: { intervalHours: 24 },
        keepAllSkillsUpdated: false,
        launchAtLogin: false,
        trayEnabled: true
      }),
      getConfig: async () => ({
        libraryPath: "~/skiller",
        targets: [],
        updateSchedule: { intervalHours: 24 },
        keepAllSkillsUpdated: false,
        launchAtLogin: false,
        trayEnabled: true
      }),
      saveConfig: async () => ({
        libraryPath: "~/skiller",
        targets: [],
        updateSchedule: { intervalHours: 24 },
        keepAllSkillsUpdated: false,
        launchAtLogin: false,
        trayEnabled: true
      }),
      checkUpdates: async () => ({
        checkedAt: "2026-05-11T00:00:00.000Z",
        considered: [{ id: "rate-limited", name: "rate-limited" }],
        available: [],
        updated: [],
        errors: [{ id: "rate-limited", message: "GitHub update check failed: 403 rate limit exceeded" }]
      }),
      updateSkill: async () => skill,
      installLocal: async () => null,
      installGithub: async () => skill,
      discoverGithub: async () => ({ repositoryOnly: false, githubUrl: "", ref: "", commit: "", skills: [] }),
      installRegistry: async () => skill,
      leaderboard: async () => ({ skills: [] }),
      search: async () => ({ skills: [] }),
      registrySkill: async () => ({}),
      registryAudit: async () => ({}),
      onCheckUpdates: () => () => undefined,
      onScanError: () => () => undefined
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Updates", exact: true }).click();
  await page.getByRole("button", { name: "Check for Updates" }).click();

  const row = page.getByRole("row", { name: /rate-limited/ });
  await expect(row.getByText("error")).toBeVisible();
  await expect(row.getByText("current")).toHaveCount(0);
  await expect(page.getByText(/1 errors/)).toBeVisible();
  await expect(page.getByText("Update check errors")).toBeVisible();
  await expect(page.getByText("rate-limited: GitHub update check failed: 403 rate limit exceeded")).toBeVisible();
});
