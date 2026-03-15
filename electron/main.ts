/**
 * Agent Deck - Electron Main Process
 *
 * Starts the Express server in-process, then opens a BrowserWindow.
 */

import { app, BrowserWindow, shell, Menu } from "electron";
import path from "path";
import fs from "fs";
import net from "net";
import http from "http";

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let serverPort = 3002;

// ─── Port Discovery ──────────────────────────────────

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function waitForServer(port: number, timeout = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    function ping() {
      if (Date.now() > deadline) return reject(new Error("Server startup timed out"));
      const req = http.get(`http://127.0.0.1:${port}/api/deck/agents`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else setTimeout(ping, 200);
      });
      req.on("error", () => setTimeout(ping, 200));
      req.setTimeout(3000, () => {
        req.destroy();
        setTimeout(ping, 200);
      });
    }
    ping();
  });
}

// ─── Window ──────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    title: "Agent Deck",
    backgroundColor: "#0f0f14",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // External links → system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── Menu (macOS) ────────────────────────────────────

function createMenu() {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" as const }, { role: "front" as const }]
          : [{ role: "close" as const }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── App Lifecycle ───────────────────────────────────

app.on("ready", async () => {
  createMenu();

  try {
    if (isDev) {
      // Dev mode: assume server + vite are running externally
      serverPort = parseInt(process.env.PORT || "3002", 10);
    } else {
      serverPort = await findFreePort();

      // Ensure user data directory for DB
      const dataDir = path.join(app.getPath("userData"), "data");
      fs.mkdirSync(dataDir, { recursive: true });

      // Set env before server import
      process.env.PORT = String(serverPort);
      process.env.DECK_DB_PATH = path.join(dataDir, "deck.db");
      process.env.DECK_STATIC_DIR = path.join(__dirname, "../dist");
      process.env.DECK_TEAM_CONFIGS = path.join(__dirname, "../team-configs");

      // Start bundled server (side-effect import)
      const serverPath = path.join(__dirname, "server.cjs");
      require(serverPath);

      await waitForServer(serverPort);
    }

    createWindow();
  } catch (err) {
    console.error("Failed to start Agent Deck:", err);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});
