// The single, audited bridge the UI gets. No Node, no network — just these
// disk operations, all going through the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  exportBackup: (data) => ipcRenderer.invoke('data:export', data),
  importBackup: () => ipcRenderer.invoke('data:import'),
  dataPath: () => ipcRenderer.invoke('data:dataPath'),
  revealData: () => ipcRenderer.invoke('data:reveal'),
});
