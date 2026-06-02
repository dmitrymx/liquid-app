/** Typed IPC invoke wrappers */
const api = window.electronAPI

export const ipc = {
  minimize: () => api?.minimize(),
  maximize: () => api?.maximize(),
  close: () => api?.close(),
  isMaximized: () => api?.isMaximized() ?? Promise.resolve(false),
  getHardwareSnapshot: () => api?.getHardwareSnapshot() ?? Promise.resolve(null),
  startHardwarePolling: (ms: number) => api?.startHardwarePolling(ms),
  stopHardwarePolling: () => api?.stopHardwarePolling(),
  onHardwareUpdate: (cb: (d: any) => void) => api?.onHardwareUpdate(cb) ?? (() => {}),
  scanSystem: () => api?.scanSystem() ?? Promise.resolve(null),
  cleanFiles: (t: string[]) => api?.cleanFiles(t) ?? Promise.resolve(null),
  backupRegistry: (issues: any[]) => api?.backupRegistry(issues) ?? Promise.resolve(null),
  cleanRegistry: (issues: any[]) => api?.cleanRegistry(issues) ?? Promise.resolve(null),
  onCleanerProgress: (cb: (d: any) => void) => api?.onCleanerProgress(cb) ?? (() => {}),
  getStartupItems: () => api?.getStartupItems() ?? Promise.resolve([]),
  toggleStartupItem: (id: string, enabled: boolean) => api?.toggleStartupItem(id, enabled),
  runBenchmark: (type: string) => api?.runBenchmark(type) ?? Promise.resolve(null),
  onBenchmarkProgress: (cb: (p: any) => void) => api?.onBenchmarkProgress(cb) ?? (() => {}),
  getSystemInfo: () => api?.getSystemInfo() ?? Promise.resolve(null),
  openExternal: (url: string) => api?.openExternal(url),

  /* Privacy */
  scanPrivacy: () => api?.scanPrivacy() ?? Promise.resolve(null),
  cleanPrivacy: (targets: string[]) => api?.cleanPrivacy(targets) ?? Promise.resolve(null),

  /* RAM Purge */
  purgeRam: () => api?.purgeRam() ?? Promise.resolve(null),

  /* Power Profiles */
  getPowerProfile: () => api?.getPowerProfile() ?? Promise.resolve(null),
  listPowerProfiles: () => api?.listPowerProfiles() ?? Promise.resolve([]),
  setPowerProfile: (guid: string) => api?.setPowerProfile(guid) ?? Promise.resolve(null),

  /* Uninstaller */
  listApps: () => api?.listApps() ?? Promise.resolve([]),
  uninstallApp: (cmd: string) => api?.uninstallApp(cmd) ?? Promise.resolve(null),

  /* Autostart */
  setAutostart: (enabled: boolean) => api?.setAutostart(enabled) ?? Promise.resolve(null),

  /* Widgets */
  toggleWidgets: (enabled: boolean) => api?.toggleWidgets(enabled) ?? Promise.resolve(null),
  setWidgetOpacity: (opacity: number) => api?.setWidgetOpacity(opacity) ?? Promise.resolve(null),
  setWidgetAlwaysOnTop: (on: boolean) => api?.setWidgetAlwaysOnTop(on) ?? Promise.resolve(null),
  toggleSingleWidget: (widgetId: string, enabled: boolean) => api?.toggleSingleWidget(widgetId, enabled) ?? Promise.resolve(null),
  getWidgetState: () => api?.getWidgetState() ?? Promise.resolve(null),
  closeWidget: (widgetId: string) => api?.closeWidget(widgetId),
  setWidgetLang: (lang: string) => api?.setWidgetLang(lang) ?? Promise.resolve(null),

  /* Network Tools */
  getIpInfo: () => api?.getIpInfo() ?? Promise.resolve(null),
  runSpeedTest: () => api?.runSpeedTest() ?? Promise.resolve(null),
  checkAnonymity: () => api?.checkAnonymity() ?? Promise.resolve(null),
  onSpeedTestProgress: (cb: (d: { percent: number; mbps: number }) => void) => api?.onSpeedTestProgress(cb) ?? (() => {}),

  /* Registry Restore */
  restoreRegistry: (backupPath: string) => api?.restoreRegistry(backupPath) ?? Promise.resolve(null),
  openFolder: (dirPath: string) => api?.openFolder(dirPath) ?? Promise.resolve(null),

  /* Disk Details (CrystalDiskInfo-style) */
  getDiskDetails: () => api?.getDiskDetails() ?? Promise.resolve([]),

  /* System Health */
  runSfc: () => api?.runSfc() ?? Promise.resolve(null),
  runDism: () => api?.runDism() ?? Promise.resolve(null),
  runDismRepair: () => api?.runDismRepair() ?? Promise.resolve(null),
  runChkdsk: () => api?.runChkdsk() ?? Promise.resolve(null),
  onHealthProgress: (cb: (data: any) => void) => api?.onHealthProgress(cb) ?? (() => {}),

  /* Backup & Restore */
  listRestorePoints: () => api?.listRestorePoints() ?? Promise.resolve([]),
  createRestorePoint: (desc: string) => api?.createRestorePoint(desc) ?? Promise.resolve(null),
  backupRegistryFull: () => api?.backupRegistryFull() ?? Promise.resolve(null),
  listBackups: () => api?.listBackups() ?? Promise.resolve([]),
  isSystemProtectionEnabled: () => api?.isSystemProtectionEnabled() ?? Promise.resolve(false),
  restoreRegistryFromBackup: (dir: string) => api?.restoreRegistryFromBackup(dir) ?? Promise.resolve(null),
  restoreSystem: (seq: number) => api?.restoreSystem(seq) ?? Promise.resolve(null),

  /* Game Mode */
  activateGameMode: () => api?.activateGameMode() ?? Promise.resolve(null),
  deactivateGameMode: () => api?.deactivateGameMode() ?? Promise.resolve(null),
  getGameModeStatus: () => api?.getGameModeStatus() ?? Promise.resolve(null),

  /* Fan Control */
  getFanData: () => api?.getFanData() ?? Promise.resolve({ fans: [], temps: [], cpu: {}, gpu: {} }),
  setFanSpeed: (id: string, value: number) => api?.setFanSpeed(id, value) ?? Promise.resolve({ ok: false }),
  resetFan: (id: string) => api?.resetFan(id) ?? Promise.resolve({ ok: false }),
  resetAllFans: () => api?.resetAllFans() ?? Promise.resolve({ ok: false }),

  /* Network Reset */
  resetNetwork: () => api?.resetNetwork() ?? Promise.resolve({ success: false, log: [] }),

  /* System Tweaks */
  getTelemetryStatus: () => api?.getTelemetryStatus() ?? Promise.resolve({}),
  setTelemetryTweak: (id: string, active: boolean) => api?.setTelemetryTweak(id, active) ?? Promise.resolve(),
  rollbackTelemetry: () => api?.rollbackTelemetry() ?? Promise.resolve(),
  readHosts: () => api?.readHosts() ?? Promise.resolve(''),
  writeHosts: (content: string) => api?.writeHosts(content) ?? Promise.resolve(),
  toggleTelemetryBlock: (active: boolean) => api?.toggleTelemetryBlock(active) ?? Promise.resolve(),
  getContextMenuItems: () => api?.getContextMenuItems() ?? Promise.resolve([]),
  toggleContextMenuItem: (parentPath: string, keyName: string, enabled: boolean) => api?.toggleContextMenuItem(parentPath, keyName, enabled) ?? Promise.resolve(),
  listUwpApps: () => api?.listUwpApps() ?? Promise.resolve([]),
  uninstallUwpApp: (name: string) => api?.uninstallUwpApp(name) ?? Promise.resolve(),
  restoreDefaultUwpApps: () => api?.restoreDefaultUwpApps() ?? Promise.resolve(),

  /* Logs */
  getLogs: () => api?.getLogs() ?? Promise.resolve([]),
  saveLogs: () => api?.saveLogs() ?? Promise.resolve({ ok: false }),
  openLogsFolder: () => api?.openLogsFolder() ?? Promise.resolve(null),
}
