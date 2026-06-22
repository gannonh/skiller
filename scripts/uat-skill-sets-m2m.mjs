import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { installLibrarySkillSetsMock } from "../e2e/fixtures/library-skill-sets-mock.mjs";

const ARTIFACTS = process.env.ARTIFACTS_DIR ?? path.join(process.cwd(), "artifacts", "skill-sets-m2m-uat");
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

async function main() {
  const recording = startRecording();
  await sleep(1000);

  const browser = await chromium.launch({
    headless: false,
    args: ["--window-size=1400,900", "--window-position=100,80"]
  });

  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(installLibrarySkillSetsMock);

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
