import { checkForSkillUpdates, expandHome, loadConfig } from "@skiller/core";

export async function checkDesktopUpdates(): Promise<Awaited<ReturnType<typeof checkForSkillUpdates>>> {
  const config = await loadConfig();
  return checkForSkillUpdates({
    libraryPath: expandHome(config.libraryPath),
    config
  });
}
