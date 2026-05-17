/**
 * Preload Script — Context Bridge for Renderer
 * Exposes safe IPC methods to the React frontend
 */
import { contextBridge, ipcRenderer } from 'electron'

/** Typed API exposed to renderer */
const electronAPI = {
  /* Window controls */
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  /* Hardware monitoring */
  getHardwareSnapshot: () => ipcRenderer.invoke('hardware:snapshot'),
  startHardwarePolling: (intervalMs: number) => ipcRenderer.send('hardware:startPolling', intervalMs),
  stopHardwarePolling: () => ipcRenderer.send('hardware:stopPolling'),
  onHardwareUpdate: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('hardware:update', handler)
    return () => ipcRenderer.removeListener('hardware:update', handler)
  },

  /* System Cleaner */
  scanSystem: () => ipcRenderer.invoke('cleaner:scan'),
  cleanFiles: (targets: string[]) => ipcRenderer.invoke('cleaner:clean', targets),
  backupRegistry: (issues: any[]) => ipcRenderer.invoke('cleaner:backupRegistry', issues),
  cleanRegistry: (issues: any[]) => ipcRenderer.invoke('cleaner:cleanRegistry', issues),
  onCleanerProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('cleaner:progress', handler)
    return () => ipcRenderer.removeListener('cleaner:progress', handler)
  },

  /* Startup Manager */
  getStartupItems: () => ipcRenderer.invoke('startup:list'),
  toggleStartupItem: (id: string, enabled: boolean) => ipcRenderer.invoke('startup:toggle', id, enabled),

  /* Benchmarks */
  runBenchmark: (type: string) => ipcRenderer.invoke('benchmark:run', type),
  onBenchmarkProgress: (callback: (progress: any) => void) => {
    const handler = (_event: any, progress: any) => callback(progress)
    ipcRenderer.on('benchmark:progress', handler)
    return () => ipcRenderer.removeListener('benchmark:progress', handler)
  },

  /* System info */
  getSystemInfo: () => ipcRenderer.invoke('system:info'),

  /* Privacy */
  scanPrivacy: () => ipcRenderer.invoke('privacy:scan'),
  cleanPrivacy: (targets: string[]) => ipcRenderer.invoke('privacy:clean', targets),

  /* RAM Purge */
  purgeRam: () => ipcRenderer.invoke('system:purgeRam'),

  /* Power Profiles */
  getPowerProfile: () => ipcRenderer.invoke('system:getPowerProfile'),
  listPowerProfiles: () => ipcRenderer.invoke('system:listPowerProfiles'),
  setPowerProfile: (guid: string) => ipcRenderer.invoke('system:setPowerProfile', guid),

  /* Uninstaller */
  listApps: () => ipcRenderer.invoke('apps:list'),
  uninstallApp: (cmd: string) => ipcRenderer.invoke('apps:uninstall', cmd),

  /* Autostart */
  setAutostart: (enabled: boolean) => ipcRenderer.invoke('app:setAutostart', enabled),

  /* External links */
  openExternal: (url: string) => ipcRenderer.send('open:external', url),

  /* Widgets */
  toggleWidgets: (enabled: boolean) => ipcRenderer.invoke('widgets:toggle', enabled),
  setWidgetOpacity: (opacity: number) => ipcRenderer.invoke('widgets:setOpacity', opacity),
  setWidgetAlwaysOnTop: (on: boolean) => ipcRenderer.invoke('widgets:setAlwaysOnTop', on),
  toggleSingleWidget: (widgetId: string, enabled: boolean) => ipcRenderer.invoke('widgets:toggleSingle', widgetId, enabled),
  getWidgetState: () => ipcRenderer.invoke('widgets:getState'),
  closeWidget: (widgetId: string) => ipcRenderer.send('widget:close', widgetId),
  setWidgetLang: (lang: string) => ipcRenderer.invoke('widgets:setLang', lang),

  /* Network Tools */
  getIpInfo: () => ipcRenderer.invoke('network:ipInfo'),
  runSpeedTest: () => ipcRenderer.invoke('network:speedTest'),
  checkAnonymity: () => ipcRenderer.invoke('network:anonymity'),

  /* Registry Restore */
  restoreRegistry: (backupPath: string) => ipcRenderer.invoke('registry:restore', backupPath),
  openFolder: (dirPath: string) => ipcRenderer.invoke('shell:openPath', dirPath),

  /* Disk Details (CrystalDiskInfo-style) */
  getDiskDetails: () => ipcRenderer.invoke('disk:getDetails'),


  /* Quick optimize event */
  onQuickOptimize: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('quick-optimize', handler)
    return () => ipcRenderer.removeListener('quick-optimize', handler)
  },

  /* System Health */
  runSfc: () => ipcRenderer.invoke('health:runSfc'),
  runDism: () => ipcRenderer.invoke('health:runDism'),
  runDismRepair: () => ipcRenderer.invoke('health:runDismRepair'),
  runChkdsk: () => ipcRenderer.invoke('health:runChkdsk'),
  onHealthProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('health:progress', handler)
    return () => ipcRenderer.removeListener('health:progress', handler)
  },

  /* Backup & Restore */
  listRestorePoints: () => ipcRenderer.invoke('backup:listRestorePoints'),
  createRestorePoint: (desc: string) => ipcRenderer.invoke('backup:createRestorePoint', desc),
  backupRegistryFull: () => ipcRenderer.invoke('backup:backupRegistry'),
  listBackups: () => ipcRenderer.invoke('backup:listBackups'),
  isSystemProtectionEnabled: () => ipcRenderer.invoke('backup:isProtectionEnabled'),
  restoreRegistryFromBackup: (dir: string) => ipcRenderer.invoke('backup:restoreRegistry', dir),
  restoreSystem: (seq: number) => ipcRenderer.invoke('backup:restoreSystem', seq),

  /* Game Mode */
  activateGameMode: () => ipcRenderer.invoke('gamemode:activate'),
  deactivateGameMode: () => ipcRenderer.invoke('gamemode:deactivate'),
  getGameModeStatus: () => ipcRenderer.invoke('gamemode:status'),

  /* Fan Control */
  getFanData: () => ipcRenderer.invoke('fan:getData'),
  setFanSpeed: (id: string, value: number) => ipcRenderer.invoke('fan:setSpeed', id, value),
  resetFan: (id: string) => ipcRenderer.invoke('fan:resetFan', id),
  resetAllFans: () => ipcRenderer.invoke('fan:resetAll'),

  /* Logs */
  getLogs: () => ipcRenderer.invoke('logs:get'),
  saveLogs: () => ipcRenderer.invoke('logs:save'),
  openLogsFolder: () => ipcRenderer.invoke('logs:openFolder')
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
