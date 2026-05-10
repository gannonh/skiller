import { BrowserWindow, Tray, app } from "electron";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startBackgroundJobs } from "./background.js";
import { registerIpcHandlers } from "./ipc.js";
import { createTray } from "./tray.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;
let cleanupItems: Array<{ stop: () => void }> = [];

function rendererHtmlPath(): string {
  const builtRenderer = join(__dirname, "../renderer/index.html");
  if (existsSync(builtRenderer)) {
    return builtRenderer;
  }

  return join(__dirname, "../../src/renderer/index.html");
}

async function createWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
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
  registerIpcHandlers();
  const window = await createWindow();
  tray = createTray(window);
  cleanupItems = await startBackgroundJobs(window);
});

app.on("before-quit", () => {
  for (const item of cleanupItems) {
    item.stop();
  }
  cleanupItems = [];
  tray?.destroy();
  tray = null;
});
