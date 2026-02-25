const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("appApi", {
  appName: "AI Multi WebView"
});
