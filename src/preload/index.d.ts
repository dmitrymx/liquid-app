/**
 * Type definitions for the preload API exposed to renderer
 */

interface ElectronAPI {
  minimize: () => void
  maximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  getHardwareSnapshot: () => Promise<any>
  startHardwarePolling: (intervalMs: number) => void
  stopHardwarePolling: () => void
  onHardwareUpdate: (callback: (data: any) => void) => () => void
  scanSystem: () => Promise<any>
  cleanFiles: (targets: string[]) => Promise<any>
  backupRegistry: (issues: any[]) => Promise<any>
  cleanRegistry: (issues: any[]) => Promise<any>
  getStartupItems: () => Promise<any>
  toggleStartupItem: (id: string, enabled: boolean) => Promise<any>
  runBenchmark: (type: string) => Promise<any>
  onBenchmarkProgress: (callback: (progress: any) => void) => () => void
  getSystemInfo: () => Promise<any>
  openExternal: (url: string) => void
  onQuickOptimize: (callback: () => void) => () => void

  /* Privacy */
  scanPrivacy: () => Promise<any>
  cleanPrivacy: (targets: string[]) => Promise<any>

  /* RAM Purge */
  purgeRam: () => Promise<any>

  /* Power Profiles */
  getPowerProfile: () => Promise<any>
  listPowerProfiles: () => Promise<any>
  setPowerProfile: (guid: string) => Promise<any>

  /* Uninstaller */
  listApps: () => Promise<any>
  uninstallApp: (cmd: string) => Promise<any>

  /* Autostart */
  setAutostart: (enabled: boolean) => Promise<any>

  /* Widgets */
  toggleWidgets: (enabled: boolean) => Promise<any>
  setWidgetOpacity: (opacity: number) => Promise<any>
  setWidgetAlwaysOnTop: (on: boolean) => Promise<any>
  toggleSingleWidget: (widgetId: string, enabled: boolean) => Promise<any>
  getWidgetState: () => Promise<any>
  closeWidget: (widgetId: string) => void
  setWidgetLang: (lang: string) => Promise<any>

  /* Network Tools */
  getIpInfo: () => Promise<any>
  runSpeedTest: () => Promise<any>
  checkAnonymity: () => Promise<any>

  /* Registry Restore */
  restoreRegistry: (backupPath: string) => Promise<any>
  openFolder: (dirPath: string) => Promise<any>

  /* Disk Details (CrystalDiskInfo-style) */
  getDiskDetails: () => Promise<any>

  /* System Health */
  runSfc: () => Promise<any>
  runDism: () => Promise<any>
  runDismRepair: () => Promise<any>
  runChkdsk: () => Promise<any>
  onHealthProgress: (callback: (data: any) => void) => () => void

  /* Backup & Restore */
  listRestorePoints: () => Promise<any>
  createRestorePoint: (desc: string) => Promise<any>
  backupRegistryFull: () => Promise<any>
  listBackups: () => Promise<any>
  isSystemProtectionEnabled: () => Promise<boolean>
  restoreRegistryFromBackup: (dir: string) => Promise<any>
  restoreSystem: (seq: number) => Promise<any>

  /* Game Mode */
  activateGameMode: () => Promise<any>
  deactivateGameMode: () => Promise<any>
  getGameModeStatus: () => Promise<any>

  /* Cleaner Progress */
  onCleanerProgress: (callback: (data: any) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
  /** App version injected by Vite define */
  const __APP_VERSION__: string
}

export {}
