const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  version: process.versions.electron,
  isDesktop: true,
  getDisplayInfo: () => ipcRenderer.invoke('display:info'),
  onDisplayInfo: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, info) => callback(info);
    ipcRenderer.on('display:info-changed', listener);
    return () => ipcRenderer.removeListener('display:info-changed', listener);
  },
  completeWithAI: (request) => ipcRenderer.invoke('ai:complete', request),
  startWorkspaceProcess: (request) => ipcRenderer.invoke('process:start', request),
  stopWorkspaceProcess: (jobId) => ipcRenderer.invoke('process:stop', jobId),
  onProcessOutput: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, result) => callback(result);
    ipcRenderer.on('process:output', listener);
    return () => ipcRenderer.removeListener('process:output', listener);
  },
  onProcessComplete: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, result) => callback(result);
    ipcRenderer.on('process:complete', listener);
    return () => ipcRenderer.removeListener('process:complete', listener);
  },
  openWorkspace: () => ipcRenderer.invoke('workspace:open'),
  readWorkspaceFile: (filePath) => ipcRenderer.invoke('workspace:read', filePath),
  writeWorkspaceFile: (filePath, content) => ipcRenderer.invoke('workspace:write', filePath, content),
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (token, content) => ipcRenderer.invoke('file:save', token, content),
  saveFileAs: (content) => ipcRenderer.invoke('file:save-as', content)
});
