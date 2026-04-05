// Standalone test: launch Electron with dashboard immediately visible
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { getDb, closeDb } = require('./db');
const { ingestAll } = require('./ingest');
const { resolveSessions } = require('./session-resolver');
const stats = require('./stats');

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

app.on('ready', async () => {
  getDb();
  await ingestAll();
  resolveSessions();

  // Register IPC handlers
  ipcMain.handle('get-stats', (event, range) => {
    const r = resolveRange(range);
    return stats.getRangeStats(r.startMs, r.endMs);
  });
  ipcMain.handle('get-model-breakdown', (event, range) => {
    const r = resolveRange(range);
    return stats.getModelBreakdown(r.startMs, r.endMs);
  });
  ipcMain.handle('get-daily-breakdown', (event, days) => stats.getDailyBreakdown(days || 30));
  ipcMain.handle('get-token-type-breakdown', (event, range) => {
    const r = resolveRange(range);
    return stats.getTokenTypeBreakdown(r.startMs, r.endMs);
  });
  ipcMain.handle('get-session-list', (event, limit, offset) => stats.getSessionList(limit || 50, offset || 0));
  ipcMain.handle('get-top-tools', (event, range, limit) => {
    const r = resolveRange(range);
    return stats.getTopTools(r.startMs, r.endMs, limit || 10);
  });
  ipcMain.handle('get-active-time', (event, range) => {
    const r = resolveRange(range);
    return stats.getActiveTimeEstimate(r.startMs, r.endMs);
  });
  ipcMain.handle('get-overall-stats', () => stats.getOverallStats());

  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    title: 'Claude Usage Tracker - Dashboard Test',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'dashboard', 'index.html'));
  win.on('closed', () => { closeDb(); app.quit(); });
});
