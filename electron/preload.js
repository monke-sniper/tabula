const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  onBackendReady: (callback) => ipcRenderer.on('backend-ready', callback),
  onModelWarmed: (callback) => ipcRenderer.on('model-warmed', callback),
});
