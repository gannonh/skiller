import fs from "fs-extra";
import os from "node:os";
import path from "node:path";

export let tmp: string;

export async function setupScannerTest(clearSymlinkMock?: () => void) {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-scanner-"));
  clearSymlinkMock?.();
}

export async function teardownScannerTest() {
  await fs.remove(tmp);
}

export const enabledTarget = (targetPath: string) => ({ path: targetPath, enabled: true });
export const disabledTarget = (targetPath: string) => ({ path: targetPath, enabled: false });
