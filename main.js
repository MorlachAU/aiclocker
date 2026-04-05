const { app, BrowserWindow, Menu, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { getDb, closeDb, setDataDir } = require('./src/db');
const { ingestAll } = require('./src/ingest');
const { resolveSessions } = require('./src/session-resolver');
const stats = require('./src/stats');
const watcher = require('./src/watcher');
const settings = require('./src/settings');
const { createTray, destroyTray } = require('./src/tray');

// electron-updater is only available in the packaged app (it imports
// node modules not present when running from source under `npm start`).
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
  // Running from source — updater is unavailable and not needed
}

// Hide from taskbar when no windows are open
app.setAppUserModelId('com.mousewheeldigital.aiclocker');

let dashboardWindow = null;
let aboutWindow = null;
let trayHandle = null;

function resolveRange(range) {
  switch (range) {
    case 'today': return stats.getTodayRange();
    case 'week': return stats.getWeekRange();
    case 'month': return stats.getMonthRange();
    case 'all': return { startMs: 0, endMs: Date.now() };
    default:
      if (range && range.startMs !== undefined) return range;
      return stats.getTodayRange();
  }
}

function buildDashboardMenu() {
  const template = [
    {
      label: '&File',
      submenu: [
        {
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+W',
          click: () => dashboardWindow && dashboardWindow.close(),
        },
        { type: 'separator' },
        {
          label: 'Quit AIClocker',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: '&View',
      submenu: [
        { role: 'reload' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: '&Help',
      submenu: [
        {
          label: 'View on GitHub',
          click: () => shell.openExternal('https://github.com/MorlachAU/aiclocker'),
        },
        {
          label: 'Report an Issue',
          click: () => shell.openExternal('https://github.com/MorlachAU/aiclocker/issues'),
        },
        { type: 'separator' },
        {
          label: 'MouseWheel Digital',
          click: () => shell.openExternal('https://www.mousewheeldigital.com/'),
        },
        {
          label: 'Buy Me a Coffee',
          click: () => shell.openExternal('https://buymeacoffee.com/mousewheeldigital'),
        },
        { type: 'separator' },
        {
          label: 'About AIClocker',
          click: () => openAbout(dashboardWindow),
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

function openDashboard() {
  if (dashboardWindow) {
    dashboardWindow.focus();
    return;
  }

  dashboardWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    title: 'AIClocker',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  dashboardWindow.setMenu(buildDashboardMenu());
  dashboardWindow.loadFile(path.join(__dirname, 'dashboard', 'index.html'));

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });
}

function openAbout(parentWindow) {
  if (aboutWindow) {
    aboutWindow.focus();
    return;
  }

  const opts = {
    width: 440,
    height: 620,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'About AIClocker',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload-about.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (parentWindow) {
    opts.parent = parentWindow;
    opts.modal = true;
  }

  aboutWindow = new BrowserWindow(opts);
  aboutWindow.setMenu(null);
  aboutWindow.loadFile(path.join(__dirname, 'dashboard', 'about.html'));

  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
}

function registerIpcHandlers() {
  ipcMain.handle('get-stats', (event, range) => {
    const r = resolveRange(range);
    return stats.getRangeStats(r.startMs, r.endMs);
  });

  ipcMain.handle('get-model-breakdown', (event, range) => {
    const r = resolveRange(range);
    return stats.getModelBreakdown(r.startMs, r.endMs);
  });

  ipcMain.handle('get-daily-breakdown', (event, days) => {
    return stats.getDailyBreakdown(days || 30);
  });

  ipcMain.handle('get-token-type-breakdown', (event, range) => {
    const r = resolveRange(range);
    return stats.getTokenTypeBreakdown(r.startMs, r.endMs);
  });

  ipcMain.handle('get-session-list', (event, limit, offset) => {
    return stats.getSessionList(limit || 50, offset || 0);
  });

  ipcMain.handle('get-top-tools', (event, range, limit) => {
    const r = resolveRange(range);
    return stats.getTopTools(r.startMs, r.endMs, limit || 10);
  });

  ipcMain.handle('get-active-time', (event, range) => {
    const r = resolveRange(range);
    return stats.getActiveTimeEstimate(r.startMs, r.endMs);
  });

  ipcMain.handle('get-overall-stats', () => {
    return stats.getOverallStats();
  });

  // Allow the dashboard to open external links in the user's default browser.
  // Whitelist the protocols to avoid abuse from injected content.
  ipcMain.handle('open-external', async (event, url) => {
    if (typeof url !== 'string') return { ok: false, error: 'url must be a string' };
    const allowed = /^(https?|mailto):/i;
    if (!allowed.test(url)) return { ok: false, error: 'protocol not allowed' };
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('copy-to-clipboard', (event, text) => {
    clipboard.writeText(String(text || ''));
    return { ok: true };
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.on('close-about-dialog', () => {
    if (aboutWindow) aboutWindow.close();
  });
}

function applyStartWithWindows(enabled) {
  // Portable builds should not write login-item registry entries — the user
  // can run the exe from anywhere and moving/deleting it would leave a
  // broken Startup entry behind.
  if (process.env.PORTABLE_EXECUTABLE_DIR) return;

  app.setLoginItemSettings({
    openAtLogin: !!enabled,
    // Hide the window on login — app runs in tray only
    openAsHidden: true,
    path: process.execPath,
    args: ['--hidden'],
  });
}

function toggleStartWithWindows() {
  const current = settings.get('startWithWindows');
  const next = !current;
  settings.set('startWithWindows', next);
  applyStartWithWindows(next);
  if (trayHandle) trayHandle.refresh();
  return next;
}

/**
 * Resolve the data directory and migrate an older database if needed.
 *
 * Priority:
 *   1. Portable build → <folder next to AIClocker-Portable.exe>/data
 *      (detected via PORTABLE_EXECUTABLE_DIR set by electron-builder at runtime)
 *   2. Installed app  → %APPDATA%/AIClocker/data (via app.getPath('userData'))
 *   3. Dev / run from source → <projectRoot>/data (legacy behavior)
 *
 * The portable version keeps all state next to its .exe so the whole app
 * can be moved between machines on a USB stick with no leftovers anywhere.
 *
 * If a database already exists at one of the legacy locations from the
 * pre-AIClocker rebrand, copy it over on first launch (installed builds only).
 */
function resolveDataDirAndMigrate() {
  const isPackaged = app.isPackaged;
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;

  // Portable build — keep data next to the exe
  if (isPackaged && portableDir) {
    const targetDataDir = path.join(portableDir, 'AIClocker-data');
    if (!fs.existsSync(targetDataDir)) {
      fs.mkdirSync(targetDataDir, { recursive: true });
    }
    // Redirect Electron's userData so settings/caches stay near the exe too
    app.setPath('userData', path.join(portableDir, 'AIClocker-data', 'electron'));
    setDataDir(targetDataDir);
    console.log(`Portable mode — data directory: ${targetDataDir}`);
    return;
  }

  const userDataDir = app.getPath('userData');
  const targetDataDir = path.join(userDataDir, 'data');

  if (!isPackaged) {
    // Dev mode — keep using <projectRoot>/data (default in db.js)
    return;
  }

  // Ensure target exists
  if (!fs.existsSync(targetDataDir)) {
    fs.mkdirSync(targetDataDir, { recursive: true });
  }

  const targetDbPath = path.join(targetDataDir, 'usage.db');

  // If no DB at the target, look for a DB at known legacy locations and copy it.
  if (!fs.existsSync(targetDbPath)) {
    const candidates = [
      path.join('E:', 'Dev', 'aiclocker', 'data', 'usage.db'),
      path.join('E:', 'Dev', 'claude-usage-tracker', 'data', 'usage.db'),
    ];
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          console.log(`Migrating database from ${candidate}`);
          fs.copyFileSync(candidate, targetDbPath);
          // Copy WAL/SHM too if present (SQLite may need them)
          for (const ext of ['-wal', '-shm']) {
            const src = candidate + ext;
            if (fs.existsSync(src)) {
              try { fs.copyFileSync(src, targetDbPath + ext); } catch (e) {}
            }
          }
          break;
        }
      } catch (e) { /* try next candidate */ }
    }
  }

  setDataDir(targetDataDir);
  console.log(`Using data directory: ${targetDataDir}`);
}

function setupAutoUpdater() {
  if (!autoUpdater || !app.isPackaged) return;

  autoUpdater.logger = {
    info: (...args) => console.log('[updater]', ...args),
    warn: (...args) => console.warn('[updater]', ...args),
    error: (...args) => console.error('[updater]', ...args),
    debug: () => {},
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] update available:', info.version);
  });
  autoUpdater.on('update-not-available', () => {
    console.log('[updater] no updates available');
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] update downloaded:', info.version, '— will install on next launch');
  });
  autoUpdater.on('error', (err) => {
    // Self-signed certs and missing GitHub releases will land here — don't crash
    console.warn('[updater] error:', err.message);
  });

  // Initial check + periodic re-check every 6 hours
  autoUpdater.checkForUpdatesAndNotify().catch(e => {
    console.warn('[updater] initial check failed:', e.message);
  });
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }, 6 * 60 * 60 * 1000);
}

async function initialize() {
  resolveDataDirAndMigrate();

  console.log('Initializing database...');
  getDb();

  console.log('Ingesting data...');
  const result = await ingestAll((i, total, name) => {
    process.stdout.write(`  [${i}/${total}] ${name}\r`);
  });
  console.log(`\nIngested ${result.totalNew} new records from ${result.totalFiles} files`);

  console.log('Resolving sessions...');
  resolveSessions();
}

app.on('ready', async () => {
  // Don't quit when all windows are closed (tray app)
  app.on('window-all-closed', (e) => e.preventDefault());

  await initialize();
  registerIpcHandlers();

  // Apply start-with-Windows preference
  applyStartWithWindows(settings.get('startWithWindows'));

  trayHandle = createTray(
    openDashboard,
    toggleStartWithWindows,
    () => openAbout(null),  // from tray there's no parent window for the modal
    () => {
      watcher.stop();
      destroyTray();
      closeDb();
      app.quit();
    }
  );

  // Start file watcher — refresh tray on changes
  watcher.start(() => {
    if (trayHandle) trayHandle.refresh();
  });

  // Kick off auto-updater in the background (packaged builds only)
  setupAutoUpdater();

  console.log('AIClocker running in system tray.');
});

app.on('before-quit', () => {
  watcher.stop();
  destroyTray();
  closeDb();
});
