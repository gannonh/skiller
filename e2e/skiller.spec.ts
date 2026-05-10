import { expect, test } from "@playwright/test";

test("renders the library from the browser preview API", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Installed master skills")).toBeVisible();
  await expect(page.getByText("1 master skills")).toBeVisible();
  await expect(page.getByRole("cell", { name: "example-skill" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "1", exact: true })).toBeVisible();
});

test("shows configured target directories and refreshes scans", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Targets" }).click();

  await expect(page.getByText("Default and custom agent skill directories")).toBeVisible();
  await expect(page.getByText("~/.agents/skills")).toBeVisible();
  await expect(page.getByText("~/.claude/skills")).toBeVisible();

  await page.getByRole("button", { name: "Refresh Scan" }).click();

  await expect(page.getByText("Scan complete: 1 changes, 0 errors")).toBeVisible();
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
