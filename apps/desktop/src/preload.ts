import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("skiller", {
  listLibrary: () => ipcRenderer.invoke("library:list"),
  scanTargets: () => ipcRenderer.invoke("targets:scan"),
  leaderboard: (type: "all-time" | "trending" | "hot") => ipcRenderer.invoke("discover:leaderboard", type),
  search: (query: string) => ipcRenderer.invoke("discover:search", query)
});
