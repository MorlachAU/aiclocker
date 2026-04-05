const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const stats = require('./stats');
const pricing = require('./pricing');
const watcher = require('./watcher');
const settings = require('./settings');

let tray = null;
let refreshTimer = null;

function formatTokens(n) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function formatDuration(ms) {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function buildContextMenu(callbacks) {
  const { onOpenDashboard, onToggleStartup, onQuit } = callbacks;

  const todayRange = stats.getTodayRange();
  const weekRange = stats.getWeekRange();
  const today = stats.getRangeStats(todayRange.startMs, todayRange.endMs);
  const week = stats.getRangeStats(weekRange.startMs, weekRange.endMs);

  const todayActive = stats.getActiveTimeEstimate(todayRange.startMs, todayRange.endMs);
  const weekActive = stats.getActiveTimeEstimate(weekRange.startMs, weekRange.endMs);

  const isActive = watcher.getIsActive();
  const statusLabel = isActive ? 'Active' : 'Idle';

  // Get current session info
  const sessions = stats.getSessionList(1, 0);
  const currentSession = sessions.length > 0 ? sessions[0] : null;

  const menuItems = [];

  if (currentSession && currentSession.title) {
    menuItems.push({ label: `Session: ${currentSession.title}`, enabled: false });
    if (currentSession.model) {
      menuItems.push({ label: `  Model: ${pricing.getModelDisplayName(currentSession.model)}`, enabled: false });
    }
  }
  menuItems.push({ label: `  Status: ${statusLabel}`, enabled: false });
  menuItems.push({ type: 'separator' });

  menuItems.push({
    label: `Today: ~$${today.totalCost.toFixed(2)} API eq. | ${formatTokens(today.totalTokens)} tokens | ${formatDuration(todayActive)}`,
    enabled: false,
  });
  menuItems.push({
    label: `This Week: ~$${week.totalCost.toFixed(2)} API eq. | ${formatTokens(week.totalTokens)} tokens | ${formatDuration(weekActive)}`,
    enabled: false,
  });
  menuItems.push({ type: 'separator' });

  // Model breakdown for today
  const models = stats.getModelBreakdown(todayRange.startMs, todayRange.endMs);
  if (models.length > 0) {
    menuItems.push({ label: 'Today by model:', enabled: false });
    for (const m of models) {
      if (m.totalCost > 0) {
        menuItems.push({
          label: `  ${m.displayName}: $${m.totalCost.toFixed(2)} (${m.messageCount} msgs)`,
          enabled: false,
        });
      }
    }
    menuItems.push({ type: 'separator' });
  }

  // Provider breakdown for today (if more than one provider has activity)
  const providers = stats.getProviderBreakdown(todayRange.startMs, todayRange.endMs);
  if (providers.length > 1) {
    menuItems.push({ label: 'Today by tool:', enabled: false });
    for (const p of providers) {
      if (p.total_cost > 0) {
        menuItems.push({
          label: `  ${p.provider}: $${p.total_cost.toFixed(2)} (${p.message_count} msgs)`,
          enabled: false,
        });
      }
    }
    menuItems.push({ type: 'separator' });
  }

  menuItems.push({ label: 'Open Dashboard', click: onOpenDashboard });
  menuItems.push({ type: 'separator' });
  menuItems.push({
    label: 'Start with Windows',
    type: 'checkbox',
    checked: !!settings.get('startWithWindows'),
    click: onToggleStartup,
  });
  menuItems.push({ type: 'separator' });
  menuItems.push({ label: 'Quit', click: onQuit });

  return Menu.buildFromTemplate(menuItems);
}

function createTray(onOpenDashboard, onToggleStartup, onQuit) {
  const iconPath = path.join(__dirname, '..', 'icon.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch (e) {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('AIClocker');

  const callbacks = { onOpenDashboard, onToggleStartup, onQuit };

  const refresh = () => {
    try {
      const menu = buildContextMenu(callbacks);
      tray.setContextMenu(menu);

      const todayRange = stats.getTodayRange();
      const today = stats.getRangeStats(todayRange.startMs, todayRange.endMs);
      const status = watcher.getIsActive() ? 'Active' : 'Idle';
      tray.setToolTip(`AIClocker: ~$${today.totalCost.toFixed(2)} API eq. today | ${status}`);
    } catch (e) {
      console.error('Tray refresh error:', e.message);
    }
  };

  refresh();

  // Auto-refresh every 60 seconds
  refreshTimer = setInterval(refresh, 60000);

  tray.on('click', () => {
    refresh();
  });

  return { refresh };
}

function destroyTray() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { createTray, destroyTray };
