import { expect, test } from "@playwright/test";

test("renders the library from the browser preview API", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Installed master skills")).toBeVisible();
  await expect(page.getByText("1 master skills")).toBeVisible();
  await expect(page.getByRole("cell", { name: "example-skill", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Enabled" })).toBeVisible();
});

test("deletes a library skill from the browser preview API", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("row", { name: /example-skill/ }).getByRole("button", { name: "Delete example-skill" }).click();

  await expect(page.getByText("0 master skills")).toBeVisible();
  await expect(page.getByRole("cell", { name: "example-skill", exact: true })).toHaveCount(0);
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

  await expect(page.getByText("trending leaderboard")).toBeVisible();
  await page.getByPlaceholder("Search skills").fill("browser");
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

  await page.getByRole("button", { name: "Browse registry" }).click();
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

test("installs a registry result from Discover preview mode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Discover" }).click();

  await page.getByRole("row", { name: /agent-browser/ }).getByRole("button", { name: "Install" }).click();
  await expect(page.getByRole("row", { name: /agent-browser/ }).getByRole("button", { name: "Installed" })).toBeVisible();

  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("cell", { name: "agent-browser", exact: true })).toBeVisible();
  await expect(page.getByText("Registry", { exact: true })).toBeVisible();
});

test("lists updateable skills on the Updates page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Discover" }).click();
  await page.getByRole("row", { name: /agent-browser/ }).getByRole("button", { name: "Install" }).click();
  await page.getByRole("button", { name: "Updates" }).click();

  await expect(page.getByRole("columnheader", { name: "Source" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "agent-browser" })).toBeVisible();
  await expect(page.getByText("Registry")).toBeVisible();
});
