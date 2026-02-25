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

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

function toggleApp() {
  if (mainWindow) {
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
      if (process.platform === "darwin") {
        app.focus({ steal: true });
      }
    }
  } else {
    createWindow();
  }
}

function createTray() {
  // macOS requires an image for Tray, so we use a 1x1 transparent pixel
  const emptyIcon = nativeImage.createFromBuffer(Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0x60, 0x00, 0x02, 0x00,
    0x00, 0x05, 0x00, 0x01, 0x0D, 0x26, 0xE5, 0x2E, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
    0xAE, 0x42, 0x60, 0x82
  ]));

  tray = new Tray(emptyIcon);

  if (process.platform === "darwin") {
    tray.setTitle("AI");
  } else {
    tray.setToolTip(APP_NAME);
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show/Hide App', click: () => toggleApp() },
    { type: 'separator' },
    {
      label: 'Quit', click: () => {
        isQuiting = true;
        app.quit();
      }
    }
  ]);

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
    app.dock.hide();
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

