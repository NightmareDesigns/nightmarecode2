const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  version: process.versions.electron,
  isDesktop: true,
  openFile: () => ipcRenderer.invoke('files:open'),
  saveFile: (file) => ipcRenderer.invoke('files:save', file),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text)
});
