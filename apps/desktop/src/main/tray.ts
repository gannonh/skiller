import { BrowserWindow, Menu, Tray, app } from "electron";

export function createTray(window: BrowserWindow): Tray {
  const tray = new Tray(process.platform === "darwin" ? "assets/trayTemplate.png" : "assets/tray.png");
  tray.setToolTip("Skiller");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Skiller", click: () => window.show() },
      { label: "Refresh scan", click: () => window.webContents.send("action:refresh-scan") },
      { label: "Check updates", click: () => window.webContents.send("action:check-updates") },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() }
    ])
  );
  return tray;
}
