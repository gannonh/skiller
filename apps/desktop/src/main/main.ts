import { BrowserWindow, Tray, app } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startBackgroundJobs } from "./background.js";
import { registerIpcHandlers } from "./ipc.js";
import { createTray } from "./tray.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;
let cleanupItems: Array<{ stop: () => void }> = [];

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}

app.whenReady().then(() => {
  registerIpcHandlers();
  const window = createWindow();
  tray = createTray(window);
  cleanupItems = startBackgroundJobs();
});

app.on("before-quit", () => {
  for (const item of cleanupItems) {
    item.stop();
  }
  cleanupItems = [];
  tray = null;
});
