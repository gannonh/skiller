import { BrowserWindow, Menu, Tray, app, nativeImage } from "electron";

const trayPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALUlEQVR42mP8z8Dwn4ECwESJ5lEDRg0YNWDUgFEDRg0YNWDUgFEDBgcA2aIEEz4n4aMAAAAASUVORK5CYII=";

export function createTray(window: BrowserWindow): Tray {
  const image = nativeImage.createFromBuffer(Buffer.from(trayPngBase64, "base64"));
  if (process.platform === "darwin") {
    image.setTemplateImage(true);
  }

  const tray = new Tray(image);
  tray.setToolTip("Skiller");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show Skiller", click: () => window.show() },
      { label: "Check for Updates", click: () => window.webContents.send("action:check-updates") },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() }
    ])
  );
  return tray;
}
