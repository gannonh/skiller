# App Auto Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add background app auto-update checks for packaged macOS and Linux AppImage builds, then show a left-panel `Update` button once a downloaded app update is ready to install.

**Architecture:** Add a focused Electron main-process app update service that wraps `electron-updater`, normalizes updater events, and exposes state through IPC. Keep app update state in `App.tsx` so the left panel owns the button. Update Electron Builder and the GitHub release workflow so updater metadata is produced and uploaded with releases.

**Tech Stack:** Electron 35, Electron Builder 26, `electron-updater`, React 19, Vite 6, Vitest, Playwright, pnpm 10.

---

## File Structure

- Create `apps/desktop/src/main/app-update.ts`: owns app update support detection, `electron-updater` event wiring, normalized state, background checks, and guarded install.
- Create `apps/desktop/tests/app-update.test.ts`: unit tests for app update service state transitions, unsupported builds, background interval, and guarded install.
- Modify `apps/desktop/src/main/main.ts`: create and start the app update service after the window exists, stop it during quit, and pass it into IPC.
- Modify `apps/desktop/src/main/ipc.ts`: accept an optional app update service dependency and register app-update IPC channels.
- Modify `apps/desktop/src/preload.cts`: expose app-update methods and listener through `window.skiller`.
- Modify `apps/desktop/src/renderer/lib/api.ts`: add app-update types, API shape, and browser preview fallback behavior.
- Modify `apps/desktop/src/renderer/App.tsx`: subscribe to app update state and render the header `Update` button only when ready.
- Modify `apps/desktop/tests/ipc.test.ts`: verify app-update IPC registration and delegation.
- Modify `apps/desktop/tests/preload.test.ts`: verify preload exposes app-update bridge methods.
- Modify `e2e/skiller.spec.ts`: verify the sidebar app update button appears only for ready app updates and does not affect the skill `Updates` page.
- Modify `apps/desktop/package.json` and `pnpm-lock.yaml`: add `electron-updater` as an app dependency.
- Modify `apps/desktop/electron-builder.yml`: add GitHub publish config and ensure updater metadata generation.
- Modify `.github/workflows/desktop-release.yml`: upload `latest-mac.yml` and `latest-linux.yml` with release assets.

---

### Task 1: Add Electron Updater Dependency And Release Metadata

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/desktop/electron-builder.yml`
- Modify: `.github/workflows/desktop-release.yml`

- [ ] **Step 1: Add the app dependency**

Run:

```bash
pnpm --filter @skiller/desktop add electron-updater
```

Expected: `apps/desktop/package.json` contains `"electron-updater"` under `dependencies`, and `pnpm-lock.yaml` changes.

- [ ] **Step 2: Configure Electron Builder publishing**

In `apps/desktop/electron-builder.yml`, add this block after `directories`:

```yaml
publish:
  provider: github
  owner: gannonh
  repo: skiller
  releaseType: release
```

Expected: Electron Builder has enough provider metadata to create `app-update.yml` in packaged apps and generate platform update metadata during distribution builds.

- [ ] **Step 3: Upload macOS update metadata**

In `.github/workflows/desktop-release.yml`, update the macOS verify step so it checks update metadata:

```yaml
      - name: Verify artifacts
        run: |
          set -euo pipefail
          test -f "apps/desktop/release/Skiller-Desktop-${{ matrix.arch }}.dmg"
          test -f "apps/desktop/release/Skiller-Desktop-${{ matrix.arch }}.zip"
          test -f "apps/desktop/release/latest-mac.yml"
          ls -la apps/desktop/release
```

Update the macOS upload path:

```yaml
          path: |
            apps/desktop/release/Skiller-Desktop-${{ matrix.arch }}.dmg
            apps/desktop/release/Skiller-Desktop-${{ matrix.arch }}.zip
            apps/desktop/release/latest-mac.yml
```

Expected: each macOS artifact upload includes `latest-mac.yml`.

- [ ] **Step 4: Upload Linux update metadata**

In the Linux verify step, add:

```bash
          test -f "apps/desktop/release/latest-linux.yml"
```

Update the Linux upload path:

```yaml
          path: |
            apps/desktop/release/Skiller-Desktop-${{ steps.linux-artifacts.outputs.appimage_arch }}.AppImage
            apps/desktop/release/Skiller-Desktop-${{ steps.linux-artifacts.outputs.deb_arch }}.deb
            apps/desktop/release/latest-linux.yml
```

Expected: each Linux artifact upload includes `latest-linux.yml`.

- [ ] **Step 5: Run focused validation**

Run:

```bash
pnpm --filter @skiller/desktop typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/package.json pnpm-lock.yaml apps/desktop/electron-builder.yml .github/workflows/desktop-release.yml
git commit -m "chore(desktop): publish app update metadata"
```

---

### Task 2: Build The Main-Process App Update Service

**Files:**
- Create: `apps/desktop/src/main/app-update.ts`
- Create: `apps/desktop/tests/app-update.test.ts`
- Modify: `apps/desktop/vite.config.ts`
- Modify: `apps/desktop/tests/smoke.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `apps/desktop/tests/app-update.test.ts`:

```ts
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppUpdater, ProgressInfo, UpdateInfo } from "electron-updater";

class FakeUpdater extends EventEmitter {
  autoDownload = false;
  checkForUpdates = vi.fn(async () => undefined);
  downloadUpdate = vi.fn(async () => []);
  quitAndInstall = vi.fn();
}

function createSupportedDeps(updater = new FakeUpdater()) {
  return {
    updater: updater as unknown as AppUpdater,
    isPackaged: true,
    platform: "darwin" as NodeJS.Platform,
    env: {},
    setInterval: vi.fn(() => 12 as unknown as NodeJS.Timeout),
    clearInterval: vi.fn()
  };
}

describe("app update service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports unsupported for development builds", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const deps = createSupportedDeps();
    const service = createAppUpdateService({ ...deps, isPackaged: false });

    expect(service.getState()).toEqual({ status: "unsupported" });
    await expect(service.checkNow()).resolves.toEqual({ status: "unsupported" });
    expect(deps.updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("reports unsupported for Linux runs outside AppImage", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const deps = createSupportedDeps();
    const service = createAppUpdateService({ ...deps, platform: "linux", env: {} });

    expect(service.getState()).toEqual({ status: "unsupported" });
    await service.startBackgroundChecks();
    expect(deps.updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("starts background checks for supported builds", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const deps = createSupportedDeps();
    const service = createAppUpdateService(deps);

    await service.startBackgroundChecks();

    expect(deps.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(deps.setInterval).toHaveBeenCalledWith(expect.any(Function), 4 * 60 * 60 * 1000);
  });

  it("downloads available updates and reports readiness", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    const service = createAppUpdateService(createSupportedDeps(updater));
    const states: unknown[] = [];
    service.subscribe((state) => states.push(state));

    updater.emit("checking-for-update");
    updater.emit("update-available", { version: "0.2.2", releaseName: "Skiller Desktop v0.2.2" } satisfies Partial<UpdateInfo>);
    updater.emit("download-progress", { percent: 64, transferred: 64, total: 100, bytesPerSecond: 10 } satisfies ProgressInfo);
    updater.emit("update-downloaded", {
      version: "0.2.2",
      releaseName: "Skiller Desktop v0.2.2",
      releaseDate: "2026-05-12T22:00:00.000Z"
    } satisfies Partial<UpdateInfo>);

    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(service.getState()).toEqual({
      status: "ready",
      version: "0.2.2",
      releaseName: "Skiller Desktop v0.2.2",
      releaseDate: "2026-05-12T22:00:00.000Z"
    });
    expect(states).toContainEqual(expect.objectContaining({ status: "checking" }));
    expect(states).toContainEqual(expect.objectContaining({ status: "downloading", progress: 64 }));
    expect(states).toContainEqual(expect.objectContaining({ status: "ready", version: "0.2.2" }));
  });

  it("guards install until an update is ready", async () => {
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    const service = createAppUpdateService(createSupportedDeps(updater));

    await expect(service.installReadyUpdate()).rejects.toThrow("No downloaded app update is ready to install");
    updater.emit("update-downloaded", { version: "0.2.2" } satisfies Partial<UpdateInfo>);

    await service.installReadyUpdate();

    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("reports updater errors without throwing from event listeners", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { createAppUpdateService } = await import("../src/main/app-update.js");
    const updater = new FakeUpdater();
    const service = createAppUpdateService(createSupportedDeps(updater));

    updater.emit("error", new Error("metadata missing"));

    expect(service.getState()).toEqual({ status: "error", error: "metadata missing" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @skiller/desktop test -- app-update.test.ts
```

Expected: FAIL because `../src/main/app-update.js` does not exist.

- [ ] **Step 3: Implement the app update service**

Create `apps/desktop/src/main/app-update.ts`:

```ts
import { EventEmitter } from "node:events";
import electronUpdater, { type AppUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";

export type AppUpdateStatus = "idle" | "checking" | "downloading" | "ready" | "not-available" | "unsupported" | "error";

export interface AppUpdateState {
  status: AppUpdateStatus;
  version?: string;
  releaseName?: string | null;
  releaseDate?: string;
  progress?: number;
  error?: string;
}

export interface AppUpdateService {
  getState: () => AppUpdateState;
  subscribe: (listener: (state: AppUpdateState) => void) => () => void;
  startBackgroundChecks: () => Promise<AppUpdateState>;
  checkNow: () => Promise<AppUpdateState>;
  installReadyUpdate: () => Promise<void>;
  stop: () => void;
}

interface AppUpdateDependencies {
  updater: AppUpdater;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
}

const UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function updateInfoState(status: AppUpdateStatus, info?: Partial<UpdateInfo>): AppUpdateState {
  return {
    status,
    ...(info?.version ? { version: info.version } : {}),
    ...(Object.hasOwn(info ?? {}, "releaseName") ? { releaseName: info?.releaseName ?? null } : {}),
    ...(info?.releaseDate ? { releaseDate: info.releaseDate } : {})
  };
}

function isSupported(input: Pick<AppUpdateDependencies, "isPackaged" | "platform" | "env">): boolean {
  if (!input.isPackaged) return false;
  if (input.platform === "darwin") return true;
  if (input.platform === "linux") return Boolean(input.env.APPIMAGE);
  return false;
}

export function getAutoUpdater(): AppUpdater {
  const { autoUpdater } = electronUpdater;
  return autoUpdater;
}

export function createAppUpdateService(dependencies: Partial<AppUpdateDependencies> = {}): AppUpdateService {
  const deps: AppUpdateDependencies = {
    updater: getAutoUpdater(),
    isPackaged: false,
    platform: process.platform,
    env: process.env,
    setInterval,
    clearInterval,
    ...dependencies
  };
  const events = new EventEmitter();
  let state: AppUpdateState = isSupported(deps) ? { status: "idle" } : { status: "unsupported" };
  let interval: NodeJS.Timeout | undefined;

  const setState = (next: AppUpdateState) => {
    state = next;
    events.emit("state", state);
  };
  const setErrorState = (error: unknown): AppUpdateState => {
    console.error("App update failed", error);
    const next = { status: "error", error: errorMessage(error) } satisfies AppUpdateState;
    setState(next);
    return next;
  };

  deps.updater.autoDownload = false;
  deps.updater.on("checking-for-update", () => setState({ status: "checking" }));
  deps.updater.on("update-not-available", (info: UpdateInfo) => setState(updateInfoState("not-available", info)));
  deps.updater.on("update-available", (info: UpdateInfo) => {
    setState(updateInfoState("downloading", info));
    void deps.updater.downloadUpdate().catch((error: unknown) => {
      setErrorState(error);
    });
  });
  deps.updater.on("download-progress", (progress: ProgressInfo) => {
    setState({ ...state, status: "downloading", progress: progress.percent });
  });
  deps.updater.on("update-downloaded", (info: UpdateInfo) => setState(updateInfoState("ready", info)));
  deps.updater.on("error", (error: unknown) => setErrorState(error));

  return {
    getState: () => state,
    subscribe: (listener) => {
      events.on("state", listener);
      return () => events.off("state", listener);
    },
    startBackgroundChecks: async () => {
      if (state.status === "unsupported") return state;
      if (!interval) {
        interval = deps.setInterval(() => {
          void deps.updater.checkForUpdates().catch((error: unknown) => {
            setErrorState(error);
          });
        }, UPDATE_INTERVAL_MS);
      }
      return await deps.updater.checkForUpdates().then(() => state).catch((error: unknown) => {
        return setErrorState(error);
      });
    },
    checkNow: async () => {
      if (state.status === "unsupported") return state;
      return await deps.updater.checkForUpdates().then(() => state).catch((error: unknown) => {
        return setErrorState(error);
      });
    },
    installReadyUpdate: async () => {
      if (state.status !== "ready") {
        throw new Error("No downloaded app update is ready to install");
      }
      deps.updater.quitAndInstall(false, true);
    },
    stop: () => {
      if (interval) {
        deps.clearInterval(interval);
        interval = undefined;
      }
    }
  };
}
```

- [ ] **Step 4: Include the service in coverage**

In `apps/desktop/vite.config.ts`, update the coverage include list:

```ts
      include: ["src/main/app-update.ts", "src/main/background.ts", "src/main/update-check.ts"],
```

- [ ] **Step 5: Update smoke import**

In `apps/desktop/tests/smoke.test.ts`, replace the file with:

```ts
import { describe, expect, it } from "vitest";
import { createAppUpdateService } from "../src/main/app-update.js";
import { checkDesktopUpdates } from "../src/main/update-check.js";

describe("desktop smoke", () => {
  it("loads desktop update wiring", () => {
    expect(checkDesktopUpdates).toEqual(expect.any(Function));
    expect(createAppUpdateService).toEqual(expect.any(Function));
  });
});
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --filter @skiller/desktop test -- app-update.test.ts smoke.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/main/app-update.ts apps/desktop/tests/app-update.test.ts apps/desktop/vite.config.ts apps/desktop/tests/smoke.test.ts
git commit -m "feat(desktop): add app update service"
```

---

### Task 3: Wire App Update IPC And Main Lifecycle

**Files:**
- Modify: `apps/desktop/src/main/main.ts`
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/preload.cts`
- Modify: `apps/desktop/tests/ipc.test.ts`
- Modify: `apps/desktop/tests/preload.test.ts`

- [ ] **Step 1: Write failing IPC test**

In `apps/desktop/tests/ipc.test.ts`, add this test inside `describe("ipc handlers", () => { ... })`:

```ts
  it("registers app update handlers", async () => {
    const appUpdateService = {
      getState: vi.fn(() => ({ status: "ready", version: "0.2.2" })),
      checkNow: vi.fn(async () => ({ status: "checking" })),
      installReadyUpdate: vi.fn(async () => undefined)
    };
    const { registerIpcHandlers } = await import("../src/main/ipc.js");
    registerIpcHandlers({ appUpdateService });

    await expect(mocks.handlers.get("app-update:get-state")?.({})).resolves.toEqual({ status: "ready", version: "0.2.2" });
    await expect(mocks.handlers.get("app-update:check")?.({})).resolves.toEqual({ status: "checking" });
    await expect(mocks.handlers.get("app-update:install")?.({})).resolves.toBeUndefined();
    expect(appUpdateService.installReadyUpdate).toHaveBeenCalledTimes(1);
  });
```

Expected TypeScript will require `registerIpcHandlers` to accept this dependency after implementation.

- [ ] **Step 2: Write failing preload assertions**

In `apps/desktop/tests/preload.test.ts`, add assertions in the existing test:

```ts
    expect(preloadSource).toContain("getAppUpdateState");
    expect(preloadSource).toContain("checkAppUpdate");
    expect(preloadSource).toContain("installAppUpdate");
    expect(preloadSource).toContain("onAppUpdateState");
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
pnpm --filter @skiller/desktop test -- ipc.test.ts preload.test.ts
```

Expected: FAIL because the IPC and preload app-update APIs do not exist yet.

- [ ] **Step 4: Update IPC handler registration**

In `apps/desktop/src/main/ipc.ts`, import the service type:

```ts
import type { AppUpdateService } from "./app-update.js";
```

Add this type near the other exported types:

```ts
export interface IpcHandlerDependencies {
  appUpdateService?: Pick<AppUpdateService, "getState" | "checkNow" | "installReadyUpdate">;
}
```

Change the exported function signature:

```ts
export function registerIpcHandlers(dependencies: IpcHandlerDependencies = {}): void {
```

Add these handlers near the existing config/update handlers:

```ts
  ipcMain.handle("app-update:get-state", async () => {
    return dependencies.appUpdateService?.getState() ?? { status: "unsupported" };
  });

  ipcMain.handle("app-update:check", async () => {
    return dependencies.appUpdateService?.checkNow() ?? { status: "unsupported" };
  });

  ipcMain.handle("app-update:install", async () => {
    if (!dependencies.appUpdateService) {
      throw new Error("App updates are not available");
    }
    await dependencies.appUpdateService.installReadyUpdate();
  });
```

- [ ] **Step 5: Update preload bridge**

In `apps/desktop/src/preload.cts`, add these methods in the object passed to `contextBridge.exposeInMainWorld`:

```ts
  getAppUpdateState: () => ipcRenderer.invoke("app-update:get-state"),
  checkAppUpdate: () => ipcRenderer.invoke("app-update:check"),
  installAppUpdate: () => ipcRenderer.invoke("app-update:install"),
  onAppUpdateState: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on("app-update:state", listener);
    return () => ipcRenderer.removeListener("app-update:state", listener);
  },
```

- [ ] **Step 6: Wire main lifecycle**

In `apps/desktop/src/main/main.ts`, add the import:

```ts
import { createAppUpdateService } from "./app-update.js";
```

Add this module variable:

```ts
let appUpdateService: ReturnType<typeof createAppUpdateService> | null = null;
```

Replace the app-ready registration block with this flow:

```ts
  appUpdateService = createAppUpdateService({ isPackaged: app.isPackaged });
  registerIpcHandlers({ appUpdateService });
  const window = await createWindow();
  appUpdateService.subscribe((state) => {
    window.webContents.send("app-update:state", state);
  });
  void appUpdateService.startBackgroundChecks();
  tray = createTray(window);
  cleanupItems = await startBackgroundJobs(window);
```

In `app.on("before-quit", ...)`, add:

```ts
  appUpdateService?.stop();
  appUpdateService = null;
```

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm --filter @skiller/desktop test -- ipc.test.ts preload.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run typecheck**

Run:

```bash
pnpm --filter @skiller/desktop typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/main/main.ts apps/desktop/src/main/ipc.ts apps/desktop/src/preload.cts apps/desktop/tests/ipc.test.ts apps/desktop/tests/preload.test.ts
git commit -m "feat(desktop): expose app update ipc"
```

---

### Task 4: Add Renderer App Update API And Sidebar Button

**Files:**
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Modify: `apps/desktop/src/renderer/App.tsx`
- Modify: `e2e/skiller.spec.ts`

- [ ] **Step 1: Write failing Playwright tests**

Add these tests to `e2e/skiller.spec.ts`:

```ts
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
```

TypeScript will need this declaration near the imports in `e2e/skiller.spec.ts`:

```ts
declare global {
  interface Window {
    __installAppUpdateCalls?: number;
  }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm test:e2e -- e2e/skiller.spec.ts
```

Expected: FAIL because the renderer API and sidebar button do not exist yet.

- [ ] **Step 3: Add renderer API types and fallback**

In `apps/desktop/src/renderer/lib/api.ts`, add:

```ts
export type AppUpdateStatus = "idle" | "checking" | "downloading" | "ready" | "not-available" | "unsupported" | "error";

export interface AppUpdateState {
  status: AppUpdateStatus;
  version?: string;
  releaseName?: string | null;
  releaseDate?: string;
  progress?: number;
  error?: string;
}
```

Add to `SkillerApi`:

```ts
  getAppUpdateState: () => Promise<AppUpdateState>;
  checkAppUpdate: () => Promise<AppUpdateState>;
  installAppUpdate: () => Promise<void>;
  onAppUpdateState: (callback: (state: AppUpdateState) => void) => RemoveListener;
```

Add to `createBrowserPreviewApi()` return object:

```ts
    getAppUpdateState: async () => ({ status: "unsupported" }),
    checkAppUpdate: async () => ({ status: "unsupported" }),
    installAppUpdate: async () => {
      throw new Error("App updates are not available in browser preview");
    },
    onAppUpdateState: () => () => undefined,
```

- [ ] **Step 4: Render the header button**

In `apps/desktop/src/renderer/App.tsx`, update imports:

```ts
import { useEffect, useState } from "react";
import { ArrowReloadHorizontalIcon, BookOpenIcon, DiscoverSquareIcon, DownloadCircle01Icon, FolderTreeIcon, SettingsIcon } from "@hugeicons/core-free-icons";
import { skillerApi, type AppUpdateState } from "./lib/api.js";
```

Add this helper before `export function App()`:

```tsx
function AppUpdateButton({ state }: { state: AppUpdateState }) {
  if (state.status !== "ready") return null;

  const label = state.version ? `Install app update ${state.version}` : "Install app update";

  return (
    <Button type="button" size="sm" aria-label={label} onClick={() => void skillerApi.installAppUpdate()}>
      <HugeiconsIcon icon={DownloadCircle01Icon} strokeWidth={2} data-icon="inline-start" />
      Update
    </Button>
  );
}
```

Inside `App`, add state and subscription:

```tsx
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateState>({ status: "idle" });

  useEffect(() => {
    let mounted = true;
    void skillerApi.getAppUpdateState().then((state) => {
      if (mounted) setAppUpdateState(state);
    });
    const removeListener = skillerApi.onAppUpdateState((state) => {
      setAppUpdateState(state);
    });
    return () => {
      mounted = false;
      removeListener();
    };
  }, []);
```

Replace the right side of the sidebar header with:

```tsx
              <div className="flex shrink-0 items-center gap-2">
                <AppUpdateButton state={appUpdateState} />
                <ModeToggle />
              </div>
```

- [ ] **Step 5: Run focused checks**

Run:

```bash
pnpm --filter @skiller/desktop typecheck
pnpm test:e2e -- e2e/skiller.spec.ts
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/lib/api.ts apps/desktop/src/renderer/App.tsx e2e/skiller.spec.ts
git commit -m "feat(desktop): show ready app update action"
```

---

### Task 5: Final Verification And Packaged Metadata Check

**Files:**
- No source files should change unless verification reveals a concrete defect.

- [ ] **Step 1: Run desktop unit coverage**

Run:

```bash
pnpm --filter @skiller/desktop test:coverage
```

Expected: PASS with coverage thresholds met.

- [ ] **Step 2: Run full repo check**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 3: Build macOS distribution metadata locally when on macOS**

Run:

```bash
pnpm --dir apps/desktop run desktop:dist:mac
test -f apps/desktop/release/latest-mac.yml
```

Expected: PASS, and `apps/desktop/release/latest-mac.yml` exists. If signing secrets are unavailable locally and Electron Builder fails during signing, record the exact failure and rely on CI for signed artifact validation.

- [ ] **Step 4: Build Linux AppImage metadata when Docker or Linux build environment is available**

Run:

```bash
pnpm --dir apps/desktop exec electron-builder --config electron-builder.yml --linux AppImage --x64
test -f apps/desktop/release/latest-linux.yml
```

Expected: PASS when the environment supports Linux packaging. If run on macOS without Linux packaging support, record the exact unsupported build error.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: worktree is clean except for intentional generated release artifacts ignored by git, and the last commits match the completed tasks.
