const { app, BrowserWindow, shell, nativeImage, Tray, Menu, globalShortcut } = require("electron");
const path = require("path");

const APP_NAME = "AllAI";
const APP_ID = "com.alchemists.allai";
let mainWindow = null;
let tray = null;
let isQuiting = false;

function createAppIcon() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="48" fill="#0b1220" />
  <rect x="24" y="24" width="208" height="208" rx="40" fill="#111827" />
  <text x="128" y="150" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="88" fill="#e2e8f0">AI</text>
</svg>`;

  const base64 = Buffer.from(svg).toString("base64");
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${base64}`);
}

function createWindow() {
  const icon = createAppIcon();
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    title: APP_NAME,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, "app", "index.html"));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    if (!isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function toggleApp() {
  if (mainWindow) {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  } else {
    createWindow();
  }
}

function createTray() {
  const icon = createAppIcon().resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show/Hide App', click: () => toggleApp() },
    { type: 'separator' },
    { label: 'Quit', click: () => {
      isQuiting = true;
      app.quit();
    }}
  ]);
  
  tray.setToolTip(APP_NAME);
  tray.on('click', () => {
    toggleApp();
  });
  tray.on('right-click', () => {
    tray.popUpContextMenu(contextMenu);
  });
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.exit(0);
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  app.setName(APP_NAME);
  app.setAppUserModelId(APP_ID);

  if (process.platform === "darwin") {
    const icon = createAppIcon();
    app.dock.setIcon(icon);
  }

  if (!mainWindow) {
    createWindow();
  }
  
  createTray();

  globalShortcut.register("Control+Space", () => {
    toggleApp();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

