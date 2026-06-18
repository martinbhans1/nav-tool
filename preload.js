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

  // custom (frameless) window controls
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    maximizeToggle: () => ipcRenderer.invoke('win:maximizeToggle'),
    close: () => ipcRenderer.invoke('win:close'),
    isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
    onMaximizeChange: (cb) => ipcRenderer.on('win:maximized', (_e, v) => cb(!!v)),
  },

  // flush-on-close: main asks us to persist before the window closes
  onFlush: (cb) => ipcRenderer.on('app:flush', () => cb()),
  flushed: () => ipcRenderer.send('app:flushed'),
});
