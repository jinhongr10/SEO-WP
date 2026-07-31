const { contextBridge, ipcRenderer } = require('electron');

const backendUrl = ipcRenderer.sendSync('desktop.getBackendUrlSync');

contextBridge.exposeInMainWorld('__SEO_WP_SYNC_BACKEND_URL__', backendUrl);

contextBridge.exposeInMainWorld('seoWpSyncDesktop', {
  platform: process.platform,
  getBackendUrl: () => ipcRenderer.invoke('desktop.getBackendUrl'),
  getThemeInfo: () => ipcRenderer.invoke('desktop.getThemeInfo'),
  setThemeSource: (source) => ipcRenderer.invoke('desktop.setThemeSource', source),
  onThemeUpdated: (callback) => {
    const listener = (_event, info) => callback(info);
    ipcRenderer.on('desktop.themeUpdated', listener);
    return () => ipcRenderer.removeListener('desktop.themeUpdated', listener);
  },
  onBackendReady: (callback) => {
    const listener = (_event, info) => callback(info);
    ipcRenderer.on('desktop.backendReady', listener);
    return () => ipcRenderer.removeListener('desktop.backendReady', listener);
  },
  onBackendFailed: (callback) => {
    const listener = (_event, info) => callback(info);
    ipcRenderer.on('desktop.backendFailed', listener);
    return () => ipcRenderer.removeListener('desktop.backendFailed', listener);
  },
  openPath: (kind) => ipcRenderer.invoke('desktop.openPath', kind),
  selectJsonFile: () => ipcRenderer.invoke('desktop.selectJsonFile'),
  restartBackend: () => ipcRenderer.invoke('desktop.restartBackend'),
  exportDiagnostics: () => ipcRenderer.invoke('desktop.exportDiagnostics'),
  getUpdateStatus: () => ipcRenderer.invoke('desktop.updates.getStatus'),
  checkForUpdates: () => ipcRenderer.invoke('desktop.updates.check'),
  installUpdate: () => ipcRenderer.invoke('desktop.updates.install'),
  onUpdateStatus: (callback) => {
    const listener = (_event, info) => callback(info);
    ipcRenderer.on('desktop.updates.status', listener);
    return () => ipcRenderer.removeListener('desktop.updates.status', listener);
  },
});
