/**
 * Liquid App — Main Process Entry
 * Premium System Optimizer for Windows 11
 * Developer: Максимов Д.А., Жигулевск, 2026
 */
import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { getHardwareSnapshot, startHardwarePolling, stopHardwarePolling, getDetailedDiskInfo, startTempMonitorDaemon, stopTempMonitorDaemon, setFanSpeed, resetFan, resetAllFans, getFanControlData } from './hardware'
import { scanSystem, cleanFiles, backupRegistry, cleanSelectedRegistry } from './cleaner'
import { getStartupItems, toggleStartupItem } from './startup'
import { runBenchmark } from './benchmark'
import { getFullSystemInfo } from './utils'
import { scanPrivacy, cleanPrivacy } from './privacy'
import { registerWidgetIPC, cleanupWidgets, toggleWidgets, broadcastHardwareData } from './widget'
import { getIpInfo, runSpeedTest, checkAnonymity, resetNetwork } from './network'
import { runSfc, runDismCheck, runDismRepair, runChkdsk } from './system-health'
import { listRestorePoints, createRestorePoint, backupRegistry as backupRegistryFull, listBackups, isSystemProtectionEnabled, restoreRegistryFromBackup, restoreSystem } from './backup'
import { activateGameMode, deactivateGameMode, getGameModeStatus } from './gamemode'
import { installLogger, registerLoggerIPC } from './logger'
import { 
  getTelemetryStatus, 
  setTelemetryTweak, 
  rollbackTelemetry, 
  readHosts, 
  writeHosts, 
  toggleTelemetryBlock, 
  getContextMenuItems, 
  toggleContextMenuItem, 
  listUwpApps, 
  uninstallUwpApp, 
  restoreDefaultUwpApps 
} from './tweaks'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

/** Create the main application window */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    frame: false,
    transparent: false,
    backgroundColor: '#0c1519',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    icon: path.join(__dirname, '../../resources/icon.png')
  })

  /* Graceful show after ready */
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  /* Open external links in default browser */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  /* Load renderer with retry for dev server race condition */
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    const url = process.env['ELECTRON_RENDERER_URL']
    const loadWithRetry = async (retries = 10, delay = 500): Promise<void> => {
      try {
        await mainWindow!.loadURL(url)
      } catch {
        if (retries > 0) {
          await new Promise(r => setTimeout(r, delay))
          return loadWithRetry(retries - 1, delay)
        }
      }
    }
    loadWithRetry()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

/** Create system tray icon */
function createTray(): void {
  /* Use .ico for Windows tray — supports multiple DPI natively */
  const icoPath = path.join(__dirname, '../../resources/icon.ico')
  const pngPath = path.join(__dirname, '../../resources/icon.png')
  const iconPath = process.platform === 'win32' ? icoPath : pngPath
  try {
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    tray = new Tray(icon)
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Открыть Liquid App', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: 'Быстрая оптимизация', click: () => mainWindow?.webContents.send('quick-optimize') },
      { label: 'Виджеты', type: 'checkbox', checked: false, click: (item) => toggleWidgets(item.checked) },
      { type: 'separator' },
      { label: 'Выход', click: () => app.quit() }
    ])
    tray.setToolTip('Liquid App — System Optimizer')
    tray.setContextMenu(contextMenu)
    tray.on('double-click', () => mainWindow?.show())
  } catch {
    /* Tray icon not found — skip silently */
  }
}

/** Register all IPC handlers */
function registerIPC(): void {
  /* Window controls */
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow?.close())
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

  /* Hardware monitoring */
  ipcMain.handle('hardware:snapshot', async () => {
    try {
      return await getHardwareSnapshot()
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.on('hardware:startPolling', (event, intervalMs: number) => {
    startHardwarePolling(intervalMs, (data) => {
      event.sender.send('hardware:update', data)
      /* Share with widgets — no separate polling needed */
      broadcastHardwareData(data)
    })
  })

  ipcMain.on('hardware:stopPolling', () => {
    stopHardwarePolling()
  })

  /* System Cleaner */
  ipcMain.handle('cleaner:scan', async () => {
    try {
      return await scanSystem()
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('cleaner:clean', async (_event, targets: string[]) => {
    try {
      return await cleanFiles(targets, mainWindow)
    } catch (err) {
      return { error: String(err) }
    }
  })

  /* Registry — backup before cleaning */
  ipcMain.handle('cleaner:backupRegistry', async (_event, issues: any[]) => {
    try {
      return await backupRegistry(issues)
    } catch (err) {
      return { error: String(err) }
    }
  })

  /* Registry — clean selected issues */
  ipcMain.handle('cleaner:cleanRegistry', async (_event, issues: any[]) => {
    try {
      return await cleanSelectedRegistry(issues)
    } catch (err) {
      return { error: String(err) }
    }
  })

  /* Startup Manager */
  ipcMain.handle('startup:list', async () => {
    try {
      return await getStartupItems()
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('startup:toggle', async (_event, id: string, enabled: boolean) => {
    try {
      return await toggleStartupItem(id, enabled)
    } catch (err) {
      return { error: String(err) }
    }
  })

  /* Benchmarks */
  ipcMain.handle('benchmark:run', async (event, type: string) => {
    try {
      return await runBenchmark(type, (progress) => {
        event.sender.send('benchmark:progress', progress)
      })
    } catch (err) {
      return { error: String(err) }
    }
  })

  /* System Info */
  ipcMain.handle('system:info', async () => {
    try {
      return await getFullSystemInfo()
    } catch (err) {
      return { error: String(err) }
    }
  })

  /* Privacy */
  ipcMain.handle('privacy:scan', async () => {
    try { return await scanPrivacy() }
    catch (err) { return { error: String(err) } }
  })

  ipcMain.handle('privacy:clean', async (_event, targets: string[]) => {
    try { return await cleanPrivacy(targets) }
    catch (err) { return { error: String(err) } }
  })

  /* Network Tools */
  ipcMain.handle('network:ipInfo', async () => {
    try { return await getIpInfo() }
    catch (err) { return { error: String(err) } }
  })

  ipcMain.handle('network:speedTest', async (event) => {
    try {
      return await runSpeedTest((pct, mbps) => {
        event.sender.send('network:speedTestProgress', { percent: pct, mbps: mbps ?? 0 })
      })
    }
    catch (err) { return { error: String(err) } }
  })

  ipcMain.handle('network:anonymity', async () => {
    try { return await checkAnonymity() }
    catch (err) { return { error: String(err) } }
  })

  /* Registry Restore from .reg backup */
  ipcMain.handle('registry:restore', async (_event, backupPath: string) => {
    try {
      await execAsync(`reg import "${backupPath}"`, { timeout: 30000 })
      return { success: true }
    } catch (err) {
      return { error: String(err) }
    }
  })


  /* ── Disk Details (CrystalDiskInfo-style) ── */
  ipcMain.handle('disk:getDetails', async () => {
    try { return await getDetailedDiskInfo() }
    catch (err) { return { error: String(err) } }
  })

  /* RAM Purge — trim working sets of bloated processes.
     NOTE: ProcessIdleTasks was removed — per Microsoft docs and forums (2025),
     it only triggers idle maintenance tasks (defrag, restore points), NOT RAM clearing.
     MinWorkingSet threshold raised to 200MB to avoid trimming essential processes
     which would cause hard page faults and degrade performance. */
  ipcMain.handle('system:purgeRam', async () => {
    try {
      const before = await execAsync(
        'powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024)"',
        { timeout: 5000 }
      )
      const freeBefore = parseInt(before.stdout.trim()) || 0

      /* Trim working sets only for genuinely bloated processes (>200MB) */
      await execAsync(
        'powershell -NoProfile -Command "Get-Process | Where-Object { $_.WorkingSet64 -gt 200MB } | ForEach-Object { try { $_.MinWorkingSet = [IntPtr]::new(1) } catch {} }"',
        { timeout: 15000 }
      ).catch(() => {})

      /* Wait a moment for OS to reclaim */
      await new Promise(r => setTimeout(r, 1500))

      const after = await execAsync(
        'powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024)"',
        { timeout: 5000 }
      )
      const freeAfter = parseInt(after.stdout.trim()) || 0
      const freed = Math.max(0, freeAfter - freeBefore)

      return { freedMB: freed, freeBeforeMB: freeBefore, freeAfterMB: freeAfter }
    } catch (err) { return { error: String(err) } }
  })

  /* Power Profile — use PowerShell with UTF-8 encoding to avoid hieroglyphs */
  ipcMain.handle('system:getPowerProfile', async () => {
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; powercfg /getactivescheme"',
        { timeout: 5000 }
      )
      const m = stdout.match(/:\s*(.+?)\s+\((.+?)\)/)
      return { guid: m?.[1]?.trim(), name: m?.[2]?.trim() }
    } catch (err) { return { error: String(err) } }
  })

  ipcMain.handle('system:listPowerProfiles', async () => {
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; powercfg /list"',
        { timeout: 5000 }
      )
      const profiles: { guid: string; name: string; active: boolean }[] = []
      for (const line of stdout.split('\n')) {
        const m = line.match(/:\s*(.+?)\s+\((.+?)\)/)
        if (m) {
          profiles.push({
            guid: m[1].trim(),
            name: m[2].trim(),
            active: line.includes('*')
          })
        }
      }
      return profiles
    } catch (err) { return { error: String(err) } }
  })

  ipcMain.handle('system:setPowerProfile', async (_event, guid: string) => {
    try {
      await execAsync(`powercfg /setactive ${guid}`, { timeout: 5000 })
      return { success: true }
    } catch (err) { return { error: String(err) } }
  })

  /* Uninstaller — list installed apps */
  ipcMain.handle('apps:list', async () => {
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | Select-Object DisplayName, Publisher, InstallDate, @{N=\'Size\';E={$_.EstimatedSize}}, UninstallString, DisplayVersion | ConvertTo-Json -Depth 1"',
        { timeout: 20000, maxBuffer: 10 * 1024 * 1024 }
      )
      return JSON.parse(stdout.trim() || '[]')
    } catch (err) { return { error: String(err) } }
  })

  ipcMain.handle('apps:uninstall', async (_event, uninstallString: string) => {
    try {
      /* Security: sanitize uninstallString to prevent command injection */
      const dangerousChars = /[&|;><`$]/
      if (dangerousChars.test(uninstallString)) {
        return { error: 'Blocked: uninstall string contains suspicious characters' }
      }
      /* Must start with a drive letter path or "MsiExec" */
      const trimmed = uninstallString.replace(/^"/, '').trim()
      if (!/^[A-Za-z]:\\/.test(trimmed) && !/^MsiExec/i.test(trimmed) && !/^rundll32/i.test(trimmed)) {
        return { error: 'Blocked: uninstall string does not start with a valid path' }
      }
      /* Launch the uninstaller */
      await execAsync(uninstallString, { timeout: 60000 })
      return { success: true }
    } catch (err) { return { error: String(err) } }
  })

  /* Autostart — real Windows login item */
  ipcMain.handle('app:setAutostart', async (_event, enabled: boolean) => {
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        path: app.getPath('exe'),
        args: []
      })
      return { success: true, enabled }
    } catch (err) { return { error: String(err) } }
  })

  ipcMain.on('open:external', (_event, url: string) => {
    shell.openExternal(url)
  })

  /* ── Shell: open folder in Explorer ── */
  ipcMain.handle('shell:openPath', async (_event, dirPath: string) => {
    try {
      /* Expand environment variables like %TEMP%, %LOCALAPPDATA% */
      let expanded = dirPath.replace(/%([^%]+)%/g, (_, v) => process.env[v] || `%${v}%`)
      /* Handle shell: URIs (e.g., shell:RecycleBinFolder) */
      if (expanded.startsWith('shell:')) {
        const { exec: execCb } = require('child_process')
        execCb(`explorer ${expanded}`, { windowsHide: true })
        return { success: true }
      }
      const result = await shell.openPath(expanded)
      if (result) return { error: result }
      return { success: true }
    } catch (err) { return { error: String(err) } }
  })

  /* ── System Health IPC ── */
  ipcMain.handle('health:runSfc', async (event) => {
    return runSfc((data) => {
      event.sender.send('health:progress', data)
    })
  })
  ipcMain.handle('health:runDism', async (event) => {
    return runDismCheck((data) => {
      event.sender.send('health:progress', data)
    })
  })
  ipcMain.handle('health:runDismRepair', async (event) => {
    return runDismRepair((data) => {
      event.sender.send('health:progress', data)
    })
  })
  ipcMain.handle('health:runChkdsk', async (event) => {
    return runChkdsk((data) => {
      event.sender.send('health:progress', data)
    })
  })

  /* ── Backup & Restore IPC ── */
  ipcMain.handle('backup:listRestorePoints', async () => listRestorePoints())
  ipcMain.handle('backup:createRestorePoint', async (_e, desc: string) => createRestorePoint(desc))
  ipcMain.handle('backup:backupRegistry', async () => backupRegistryFull())
  ipcMain.handle('backup:listBackups', () => listBackups())
  ipcMain.handle('backup:isProtectionEnabled', async () => isSystemProtectionEnabled())
  ipcMain.handle('backup:restoreRegistry', async (_e, dir: string) => restoreRegistryFromBackup(dir))
  ipcMain.handle('backup:restoreSystem', async (_e, seq: number) => restoreSystem(seq))

  /* ── Game Mode IPC ── */
  ipcMain.handle('gamemode:activate', async () => activateGameMode())
  ipcMain.handle('gamemode:deactivate', async () => deactivateGameMode())
  ipcMain.handle('gamemode:status', () => getGameModeStatus())

  /* Fan Control */
  ipcMain.handle('fan:getData', async () => {
    try { return await getFanControlData() } catch (e: any) { return { error: e.message } }
  })
  ipcMain.handle('fan:setSpeed', async (_e, id: string, value: number) => {
    try { return await setFanSpeed(id, value) } catch (e: any) { return { ok: false, error: e.message } }
  })
  ipcMain.handle('fan:resetFan', async (_e, id: string) => {
    try { return await resetFan(id) } catch (e: any) { return { ok: false, error: e.message } }
  })
  ipcMain.handle('fan:resetAll', async () => {
    try { return await resetAllFans() } catch (e: any) { return { ok: false, error: e.message } }
  })

  /* ── Network Reset IPC ── */
  ipcMain.handle('network:resetNetwork', async () => resetNetwork())

  /* ── System Tweaks IPC ── */
  ipcMain.handle('tweaks:getTelemetryStatus', async () => getTelemetryStatus())
  ipcMain.handle('tweaks:setTelemetryTweak', async (_e, id: string, active: boolean) => setTelemetryTweak(id, active))
  ipcMain.handle('tweaks:rollbackTelemetry', async () => rollbackTelemetry())
  ipcMain.handle('tweaks:readHosts', async () => readHosts())
  ipcMain.handle('tweaks:writeHosts', async (_e, content: string) => writeHosts(content))
  ipcMain.handle('tweaks:toggleTelemetryBlock', async (_e, active: boolean) => toggleTelemetryBlock(active))
  ipcMain.handle('tweaks:getContextMenuItems', async () => getContextMenuItems())
  ipcMain.handle('tweaks:toggleContextMenuItem', async (_e, parentPath: string, keyName: string, enabled: boolean) => toggleContextMenuItem(parentPath, keyName, enabled))
  ipcMain.handle('tweaks:listUwpApps', async () => listUwpApps())
  ipcMain.handle('tweaks:uninstallUwpApp', async (_e, name: string) => uninstallUwpApp(name))
  ipcMain.handle('tweaks:restoreDefaultUwpApps', async () => restoreDefaultUwpApps())

  /* Widget IPC */
  registerWidgetIPC()
}

/* Single instance lock */
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

/* App lifecycle */
app.whenReady().then(async () => {
  installLogger()
  registerIPC()
  registerLoggerIPC()
  createWindow()
  createTray()
  /* Start TempMonitor daemon for continuous fan monitoring + control */
  startTempMonitorDaemon()
})

/** Check if current process has admin privileges */
function isRunningAsAdmin(): boolean {
  try {
    const { execSync } = require('child_process')
    /* 'net session' only succeeds when running as Administrator */
    execSync('net session', { stdio: 'ignore', windowsHide: true, timeout: 5000 })
    return true
  } catch {
    return false
  }
}

app.on('window-all-closed', () => {
  stopHardwarePolling()
  stopTempMonitorDaemon()
  cleanupWidgets()
  app.quit()
})

app.on('before-quit', () => {
  stopHardwarePolling()
  stopTempMonitorDaemon()
  cleanupWidgets()
})
