import { contextBridge, ipcRenderer } from "electron";

type ScanError = { message: string };

contextBridge.exposeInMainWorld("skiller", {
  listLibrary: () => ipcRenderer.invoke("library:list"),
  scanTargets: () => ipcRenderer.invoke("targets:scan"),
  leaderboard: (type: "all-time" | "trending" | "hot") => ipcRenderer.invoke("discover:leaderboard", type),
  search: (query: string) => ipcRenderer.invoke("discover:search", query),
  onCheckUpdates: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("action:check-updates", listener);
    return () => ipcRenderer.removeListener("action:check-updates", listener);
  },
  onScanError: (callback: (error: ScanError) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: ScanError) => callback(error);
    ipcRenderer.on("background:scan-error", listener);
    return () => ipcRenderer.removeListener("background:scan-error", listener);
  }
});
