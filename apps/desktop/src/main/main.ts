import { BrowserWindow, Tray, app, nativeImage } from "electron";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAppUpdateService } from "./app-update.js";
import { startBackgroundJobs } from "./background.js";
import { registerIpcHandlers } from "./ipc.js";
import { createTray } from "./tray.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;
let cleanupItems: Array<{ stop: () => void }> = [];
let appUpdateService: ReturnType<typeof createAppUpdateService> | null = null;

function appIconPath(): string | undefined {
  const candidates = [
    join(__dirname, "../../assets/app-icon.png"),
    join(__dirname, "../../../assets/app-icon.png")
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function rendererHtmlPath(): string {
  const builtRenderer = join(__dirname, "../renderer/index.html");
  if (existsSync(builtRenderer)) {
    return builtRenderer;
  }

  return join(__dirname, "../../src/renderer/index.html");
}

async function createWindow(): Promise<BrowserWindow> {
  const icon = appIconPath();
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    if (process.env.VITE_DEV_SERVER_URL) {
      await window.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      await window.loadFile(rendererHtmlPath());
    }
  } catch (error) {
    console.error("Failed to load renderer", error);
  }

  return window;
}

app.whenReady().then(async () => {
  const icon = appIconPath();
  if (icon && process.platform === "darwin" && app.dock) {
    const dockIcon = nativeImage.createFromPath(icon);
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  }

  appUpdateService = createAppUpdateService({ isPackaged: app.isPackaged });
  registerIpcHandlers({ appUpdateService });
  const window = await createWindow();
  appUpdateService.subscribe((state) => {
    window.webContents.send("app-update:state", state);
  });
  void appUpdateService.startBackgroundChecks();
  tray = createTray(window);
  cleanupItems = await startBackgroundJobs(window);
});

app.on("before-quit", () => {
  appUpdateService?.stop();
  appUpdateService = null;
  for (const item of cleanupItems) {
    item.stop();
  }
  cleanupItems = [];
  tray?.destroy();
  tray = null;
});
