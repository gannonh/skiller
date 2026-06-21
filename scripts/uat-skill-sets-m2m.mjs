import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ARTIFACTS = "/opt/cursor/artifacts/skill-sets-m2m-uat";
const DISPLAY = process.env.DISPLAY || ":1";

fs.mkdirSync(ARTIFACTS, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function captureScreen(filename) {
  return new Promise((resolve, reject) => {
    const output = path.join(ARTIFACTS, filename);
    const proc = spawn("ffmpeg", [
      "-y",
      "-f",
      "x11grab",
      "-video_size",
      "1920x1080",
      "-i",
      `${DISPLAY}.0`,
      "-frames:v",
      "1",
      output
    ]);
    proc.on("close", (code) => (code === 0 ? resolve(output) : reject(new Error(`ffmpeg screenshot failed: ${code}`))));
  });
}

function startRecording() {
  const output = path.join(ARTIFACTS, "skill-sets-m2m-uat.mp4");
  const proc = spawn(
    "ffmpeg",
    [
      "-y",
      "-f",
      "x11grab",
      "-video_size",
      "1920x1080",
      "-framerate",
      "15",
      "-i",
      `${DISPLAY}.0`,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      output
    ],
    { stdio: "ignore" }
  );
  return { proc, output };
}

const mockApi = `
  const skill = (id, tags, enabled = true) => ({
    id,
    name: id,
    libraryPath: \`/tmp/\${id}\`,
    source: { type: "local", path: \`/tmp/\${id}\` },
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
  window.skiller = {
    listLibrary: async () => state,
    saveSkillSet: async (input) => {
      const now = new Date().toISOString();
      if (input.id) {
        const skillSet = state.skillSets.find((candidate) => candidate.id === input.id);
        if (skillSet) {
          skillSet.name = input.name.trim();
          skillSet.skillIds = [...input.skillIds];
          skillSet.targets = input.targets.map((target) => ({ ...target }));
          skillSet.updatedAt = now;
        }
      } else {
        state.skillSets.push({
          id: input.name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "") || "skill-set",
          name: input.name.trim(),
          skillIds: [...input.skillIds],
          targets: input.targets.map((target) => ({ ...target })),
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
    replaceSkillTags: async () => state,
    setSkillSetEnabled: async (skillSetId, enabled) => {
      const skillSet = state.skillSets.find((candidate) => candidate.id === skillSetId);
      if (skillSet) {
        for (const candidate of state.skills) {
          if (skillSet.skillIds.includes(candidate.id)) candidate.enabled = enabled;
        }
      }
      return { state, scanErrors: [] };
    },
    setSkillEnabled: async () => state,
    deleteSkill: async () => state,
    scanTargets: async () => ({ imported: [], enabled: [], disabled: [], errors: [] }),
    saveTargets: async (targets) => ({ libraryPath: "~/skiller", targets, updateSchedule: { intervalHours: 24 }, keepAllSkillsUpdated: false, launchAtLogin: false, trayEnabled: true }),
    getConfig: async () => ({ libraryPath: "~/skiller", targets: [], updateSchedule: { intervalHours: 24 }, keepAllSkillsUpdated: false, launchAtLogin: false, trayEnabled: true }),
    saveConfig: async () => ({ libraryPath: "~/skiller", targets: [], updateSchedule: { intervalHours: 24 }, keepAllSkillsUpdated: false, launchAtLogin: false, trayEnabled: true }),
    checkUpdates: async () => ({ checkedAt: new Date().toISOString(), considered: [], available: [], updated: [], errors: [] }),
    updateSkill: async () => { throw new Error("not implemented"); },
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
`;

async function main() {
  const recording = startRecording();
  await sleep(1000);

  const browser = await chromium.launch({
    headless: false,
    args: ["--window-size=1400,900", "--window-position=100,80"]
  });

  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(mockApi);

  let step = 1;
  async function shot(label) {
    const name = `${String(step).padStart(2, "0")}-${label}.png`;
    await page.screenshot({ path: path.join(ARTIFACTS, `viewport-${name}`), fullPage: true });
    await sleep(400);
    const screenPath = await captureScreen(`screen-${name}`);
    console.log(`Captured ${screenPath}`);
    step += 1;
  }

  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await sleep(800);
  await shot("library-initial");

  await page.getByRole("button", { name: "Create New Skill Set" }).click();
  await sleep(500);
  await shot("create-skill-set-modal");

  await page.locator("#skill-set-name").fill("Agent v1.0");
  await page.getByLabel("New target path").fill("~/.cursor/skills");
  await page.getByRole("button", { name: "Add Target" }).click();
  await sleep(400);
  await shot("create-skill-set-filled");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await sleep(600);
  await shot("skill-set-created");

  await page.getByRole("button", { name: "Manage skill sets for alpha-skill" }).click();
  await sleep(500);
  await shot("membership-modal-alpha");

  await page.getByRole("checkbox", { name: /Agent v1\.0/ }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await sleep(600);
  await shot("membership-alpha-saved");

  await page.getByRole("button", { name: "Manage skill sets for beta-skill" }).click();
  await sleep(500);
  await shot("membership-modal-beta");

  await page.getByRole("checkbox", { name: /Agent v1\.0/ }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await sleep(600);
  await shot("membership-saved-m2m");

  await page.getByRole("button", { name: "Edit Agent v1.0" }).click();
  await sleep(500);
  await shot("edit-skill-set-modal");

  await page.locator("#skill-set-name").fill("Runtime Bundle");
  await page.getByRole("checkbox", { name: "Include alpha-skill" }).check();
  await page.getByRole("checkbox", { name: "Include gamma-skill" }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await sleep(600);
  await shot("skill-set-renamed");

  await browser.close();
  recording.proc.kill("SIGINT");
  await sleep(1500);

  console.log(`Video: ${recording.output}`);
  console.log(`Artifacts: ${ARTIFACTS}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
