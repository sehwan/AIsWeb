const { app, BrowserWindow, shell, nativeImage, Tray, Menu, globalShortcut, powerMonitor, ipcMain, session, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

// Energy & Stability Configurations
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows', 'true');
app.commandLine.appendSwitch('disable-renderer-backgrounding', 'true');
app.commandLine.appendSwitch('enable-blink-features', 'OcclusionTracking');

const APP_NAME = "AI";
const APP_ID = "com.alchemists.allai";
let mainWindow = null;
let tray = null;
let isQuiting = false;

const PARTITIONS = [
  "persist:perplexity",
  "persist:gemini",
  "persist:claude",
  "persist:chatgpt"
];

async function performCleanup(type = 'only') {
  console.log(`Starting cleanup: ${type}`);
  for (const partition of PARTITIONS) {
    const ses = session.fromPartition(partition);
    try {
      if (type === 'all') {
        // Clear everything including cookies and localStorage
        await ses.clearStorageData();
      } else {
        // Clear cache and cachestorage only (keep logins)
        await ses.clearCache();
        await ses.clearStorageData({
          storages: ['cachestorage', 'appcache', 'shadercache']
        });
      }
    } catch (err) {
      console.error(`Failed to clean partition ${partition}:`, err);
    }
  }
  
  // Update last cleanup date
  const cleanupInfoPath = path.join(app.getPath("userData"), "last-cleanup.json");
  try {
    fs.writeFileSync(cleanupInfoPath, JSON.stringify({ lastDate: Date.now() }));
  } catch (err) {
    console.error("Failed to save cleanup date:", err);
  }
}

async function checkAutoCleanup() {
  const cleanupInfoPath = path.join(app.getPath("userData"), "last-cleanup.json");
  let lastDate = 0;
  if (fs.existsSync(cleanupInfoPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cleanupInfoPath, "utf8"));
      lastDate = data.lastDate || 0;
    } catch (e) {}
  }

  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
  if (Date.now() - lastDate > TWO_WEEKS_MS) {
    console.log("Auto-cleanup triggered (2 weeks passed)");
    await performCleanup('only'); // Auto cleanup always keeps logins
    return true;
  }
  return false;
}

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
      webviewTag: true,
      backgroundThrottling: false,
      spellcheck: false
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
    if (mainWindow.isVisible() && mainWindow.isFocused() && !mainWindow.isMinimized()) {
      mainWindow.hide();
    } else {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
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

function createTrayIcon() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
  <rect x="2" y="2" width="18" height="18" rx="4" fill="#000000" />
  <text x="11" y="15" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="bold" fill="#ffffff">AI</text>
</svg>`;
  const base64 = Buffer.from(svg).toString("base64");
  const img = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${base64}`);
  img.setTemplateImage(true);
  return img;
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);

  if (process.platform === "darwin") {
    tray.setTitle("AI");
  } else {
    tray.setToolTip(APP_NAME);
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: '창 열기 / 숨기기', click: () => toggleApp() },
    { type: 'separator' },
    { 
      label: '캐시 정리 (로그인 유지)', 
      click: async () => {
        await performCleanup('only');
        if (mainWindow) {
          mainWindow.webContents.send('status-message', "캐시 정리가 완료되었습니다.");
        }
      } 
    },
    { 
      label: '전체 초기화 (로그아웃 포함)', 
      click: async () => {
        const choice = dialog.showMessageBoxSync({
          type: 'warning',
          buttons: ['취소', '초기화 실행'],
          defaultId: 0,
          title: '전체 초기화 확인',
          message: '모든 로그인 정보와 데이터가 삭제됩니다. 계속하시겠습니까?',
        });
        
        if (choice === 1) {
          await performCleanup('all');
          if (mainWindow) {
            mainWindow.webContents.send('status-message', "전체 데이터가 초기화되었습니다.");
          }
        }
      } 
    },
    { type: 'separator' },
    {
      label: '종료하기', click: () => {
        isQuiting = true;
        app.quit();
      }
    }
  ]);

  if (tray) {
    tray.setContextMenu(contextMenu);
  }
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

  // Stability & Optimization: Handle web process crashes
  app.on("web-contents-created", (event, contents) => {
    contents.on("render-process-gone", (event, details) => {
      console.error(`Render process gone (${details.reason}). Redeploying...`);
      if (details.reason !== "clean-exit") {
        contents.reload();
      }
    });

    contents.on("will-attach-webview", (e, webPreferences) => {
      // By default, let webviews thrive but allow renderer to manage them
      webPreferences.backgroundThrottling = false;
    });
  });

  // Global Watchdog
  app.on('child-process-gone', (event, details) => {
    console.error(`Sub-process gone (${details.type}): ${details.reason}`);
  });

  if (!mainWindow) {
    createWindow();
  }

  createTray();
  
  // Handle manual cleanup requests
  ipcMain.handle('clear-cache', async (event, type) => {
    await performCleanup(type);
    return true;
  });

  // Check for auto-cleanup on startup
  setTimeout(async () => {
    const autoDone = await checkAutoCleanup();
    if (autoDone && mainWindow) {
      mainWindow.webContents.send('status-message', "자동 캐시 정리가 수행되었습니다.");
    }
  }, 3000);
 
  // Power event handling
  powerMonitor.on('suspend', () => console.log('System Suspending...'));

  powerMonitor.on('resume', () => {
    console.log('System Resumed');
    if (mainWindow) mainWindow.webContents.send('power-resume');
  });

  powerMonitor.on('unlock-screen', () => {
    console.log('Screen Unlocked');
    if (mainWindow) mainWindow.webContents.send('power-resume');
  });

  // Energy: Monitor visibility for intelligent throttling
  const updateVisibility = () => {
    if (!mainWindow) return;
    const v = mainWindow.isVisible() && !mainWindow.isMinimized();
    mainWindow.webContents.send('window-visibility-change', v);
  };
  
  app.on('browser-window-focus', updateVisibility);
  app.on('browser-window-blur', updateVisibility);

  globalShortcut.register("Control+Space", () => toggleApp());

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
  if (process.platform !== "darwin") app.quit();
});
