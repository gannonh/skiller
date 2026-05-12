import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-gh-api-"));
  tempDirs.push(dir);
  return dir;
}

describe("githubRequestHeaders", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("GH_TOKEN", "");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(tempDirs.splice(0).map((dir) => fs.remove(dir)));
  });

  it("uses gh from PATH when no environment token is configured", async () => {
    const binPath = await makeTempDir();
    const ghPath = path.join(binPath, "gh");
    await fs.writeFile(ghPath, "#!/bin/sh\nprintf path-token\n");
    await fs.chmod(ghPath, 0o755);
    vi.stubEnv("PATH", binPath);

    const { githubRequestHeaders } = await import("./github-api.js");

    await expect(githubRequestHeaders()).resolves.toMatchObject({
      Authorization: "Bearer path-token"
    });
  });

  it("uses an explicit Skiller gh path before PATH lookup", async () => {
    const binPath = await makeTempDir();
    const ghPath = path.join(binPath, "gh");
    await fs.writeFile(ghPath, "#!/bin/sh\nprintf custom-token\n");
    await fs.chmod(ghPath, 0o755);
    vi.stubEnv("PATH", "");
    vi.stubEnv("SKILLER_GH_PATH", ghPath);

    const { githubRequestHeaders } = await import("./github-api.js");

    await expect(githubRequestHeaders()).resolves.toMatchObject({
      Authorization: "Bearer custom-token"
    });
  });

  it("omits authorization when gh is present but auth fails", async () => {
    const binPath = await makeTempDir();
    const ghPath = path.join(binPath, "gh");
    await fs.writeFile(ghPath, "#!/bin/sh\nprintf 'not logged in' >&2\nexit 1\n");
    await fs.chmod(ghPath, 0o755);
    vi.stubEnv("PATH", "");
    vi.stubEnv("SKILLER_GH_PATH", ghPath);

    const { githubRequestHeaders } = await import("./github-api.js");

    await expect(githubRequestHeaders()).resolves.not.toHaveProperty("Authorization");
  });
});
