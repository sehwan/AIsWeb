const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appApi", {
  appName: "AI Multi WebView",
  onPowerResume: (callback) => ipcRenderer.on('power-resume', callback),
  onVisibilityChange: (callback) => ipcRenderer.on('window-visibility-change', (e, visible) => callback(visible)),
  clearCache: (type) => ipcRenderer.invoke('clear-cache', type),
  onStatusMessage: (callback) => ipcRenderer.on('status-message', (e, msg) => callback(msg))
});
