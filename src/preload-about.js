const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  closeAboutDialog: () => ipcRenderer.send('close-about-dialog'),
});
