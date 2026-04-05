const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getStats: (range) => ipcRenderer.invoke('get-stats', range),
  getModelBreakdown: (range) => ipcRenderer.invoke('get-model-breakdown', range),
  getDailyBreakdown: (days) => ipcRenderer.invoke('get-daily-breakdown', days),
  getTokenTypeBreakdown: (range) => ipcRenderer.invoke('get-token-type-breakdown', range),
  getSessionList: (limit, offset) => ipcRenderer.invoke('get-session-list', limit, offset),
  getTopTools: (range, limit) => ipcRenderer.invoke('get-top-tools', range, limit),
  getActiveTime: (range) => ipcRenderer.invoke('get-active-time', range),
  getOverallStats: () => ipcRenderer.invoke('get-overall-stats'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});
