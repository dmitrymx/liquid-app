/**
 * System Cleaner Service
 * Safe whitelist-based cleaning with preview + Registry scanner (CCleaner-style)
 */
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

const execAsync = promisify(exec)

export interface ScanCategory {
  id: string
  name: string
  nameRu: string
  icon: string
  files: ScanFile[]
  totalSize: number
  selected: boolean
  count?: number
}

export interface ScanFile {
  path: string
  size: number
  lastModified: number
}

export interface RegistryIssue {
  key: string
  valueName: string
  type: string
  description: string
  severity: 'low' | 'medium' | 'high'
}

export interface ScanResult {
  categories: ScanCategory[]
  registryIssues: RegistryIssue[]
  totalSize: number
  scanDuration: number
}

export interface CleanResult {
  cleaned: number
  failed: number
  freedSpace: number
  registryCleaned: number
  errors: string[]
  lockedCount: number
  browsersWereRunning: boolean
}

/** Browser cache paths by browser — Updated for modern Chromium (Cache_Data) */
const BROWSER_CACHE_PATHS: Record<string, string[]> = {
  Chrome: [
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data/Default/Cache'),
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data/Default/Cache_Data'),
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data/Default/Code Cache'),
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data/Default/Service Worker/CacheStorage'),
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data/Default/GPUCache'),
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data/ShaderCache'),
  ],
  Edge: [
    path.join(os.homedir(), 'AppData/Local/Microsoft/Edge/User Data/Default/Cache'),
    path.join(os.homedir(), 'AppData/Local/Microsoft/Edge/User Data/Default/Cache_Data'),
    path.join(os.homedir(), 'AppData/Local/Microsoft/Edge/User Data/Default/Code Cache'),
    path.join(os.homedir(), 'AppData/Local/Microsoft/Edge/User Data/Default/GPUCache'),
    path.join(os.homedir(), 'AppData/Local/Microsoft/Edge/User Data/ShaderCache'),
  ],
  Firefox: [
    path.join(os.homedir(), 'AppData/Local/Mozilla/Firefox/Profiles'),
  ],
  Opera: [
    path.join(os.homedir(), 'AppData/Local/Opera Software/Opera Stable/Cache'),
    path.join(os.homedir(), 'AppData/Local/Opera Software/Opera Stable/Cache_Data'),
  ],
}

/** All browser process names */
const BROWSER_PROCESSES = ['chrome.exe', 'msedge.exe', 'firefox.exe', 'opera.exe', 'brave.exe', 'vivaldi.exe']

const TEMP_PATHS = [
  os.tmpdir(),
  path.join(os.homedir(), 'AppData/Local/Temp'),
  'C:\\Windows\\Temp',
]

/** Check if any browsers are currently running */
export async function areBrowsersRunning(): Promise<string[]> {
  const running: string[] = []
  try {
    const { stdout } = await execAsync(
      'tasklist /FO CSV /NH',
      { timeout: 5000 }
    )
    const lower = stdout.toLowerCase()
    for (const proc of BROWSER_PROCESSES) {
      if (lower.includes(proc.toLowerCase())) {
        running.push(proc.replace('.exe', ''))
      }
    }
  } catch { /* skip */ }
  return running
}

/** Kill browser processes to unlock cache/cookie files */
export async function killBrowsers(): Promise<string[]> {
  const killed: string[] = []
  for (const proc of BROWSER_PROCESSES) {
    try {
      await execAsync(`taskkill /IM "${proc}" /F 2>nul`, { timeout: 5000 })
      killed.push(proc.replace('.exe', ''))
    } catch { /* Not running — fine */ }
  }
  /* Wait a moment for file handles to release */
  if (killed.length > 0) {
    await new Promise(r => setTimeout(r, 1500))
  }
  return killed
}

/** Get size of directory recursively */
async function getDirSize(dirPath: string): Promise<{ size: number; files: ScanFile[] }> {
  let totalSize = 0
  const scanFiles: ScanFile[] = []
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      try {
        if (entry.isFile()) {
          const stat = await fs.stat(fullPath)
          totalSize += stat.size
          scanFiles.push({ path: fullPath, size: stat.size, lastModified: stat.mtimeMs })
        } else if (entry.isDirectory()) {
          const sub = await getDirSize(fullPath)
          totalSize += sub.size
          scanFiles.push(...sub.files)
        }
      } catch { /* Skip inaccessible */ }
    }
  } catch { /* Skip inaccessible */ }
  return { size: totalSize, files: scanFiles }
}

async function scanTempFiles(): Promise<ScanCategory> {
  const allFiles: ScanFile[] = []
  let totalSize = 0
  for (const tempPath of TEMP_PATHS) {
    try {
      const result = await getDirSize(tempPath)
      allFiles.push(...result.files)
      totalSize += result.size
    } catch { /* skip */ }
  }
  return { id: 'temp', name: 'Temporary Files', nameRu: 'Временные файлы', icon: 'folder_open', files: allFiles.slice(0, 500), totalSize, selected: true }
}

async function scanBrowserCache(): Promise<ScanCategory> {
  const allFiles: ScanFile[] = []
  let totalSize = 0
  for (const [, paths] of Object.entries(BROWSER_CACHE_PATHS)) {
    for (const cachePath of paths) {
      try {
        const result = await getDirSize(cachePath)
        allFiles.push(...result.files)
        totalSize += result.size
      } catch { /* skip */ }
    }
  }
  return { id: 'browser_cache', name: 'Browser Cache', nameRu: 'Кэш браузеров', icon: 'language', files: allFiles.slice(0, 500), totalSize, selected: true }
}

async function scanWindowsUpdate(): Promise<ScanCategory> {
  const wuPath = 'C:\\Windows\\SoftwareDistribution\\Download'
  let totalSize = 0
  const allFiles: ScanFile[] = []
  try {
    const result = await getDirSize(wuPath)
    allFiles.push(...result.files)
    totalSize = result.size
  } catch { /* Need admin */ }
  return { id: 'windows_update', name: 'Windows Update Cache', nameRu: 'Кэш обновлений', icon: 'system_update', files: allFiles.slice(0, 200), totalSize, selected: false }
}

async function scanRecycleBin(): Promise<ScanCategory> {
  let totalSize = 0
  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).NameSpace(0xA).Items() | ForEach-Object { $_.Size } | Measure-Object -Sum | Select-Object -ExpandProperty Sum"',
      { timeout: 10000 }
    )
    totalSize = parseInt(stdout.trim()) || 0
  } catch { /* skip */ }
  return { id: 'recycle_bin', name: 'Recycle Bin', nameRu: 'Корзина', icon: 'delete', files: [], totalSize, selected: true }
}

async function scanJunkFiles(): Promise<ScanCategory> {
  const junkPaths = [
    path.join(os.homedir(), 'AppData/Local/CrashDumps'),
    path.join(os.homedir(), 'AppData/Local/D3DSCache'),
    'C:\\Windows\\Minidump',
    'C:\\Windows\\Logs',
  ]
  const allFiles: ScanFile[] = []
  let totalSize = 0
  for (const p of junkPaths) {
    try { const r = await getDirSize(p); allFiles.push(...r.files); totalSize += r.size } catch { /* skip */ }
  }
  return { id: 'junk', name: 'Junk Files', nameRu: 'Мусорные файлы', icon: 'delete_sweep', files: allFiles.slice(0, 300), totalSize, selected: true }
}

/* ===== REGISTRY SCANNER (CCleaner-style) ===== */

/** Check if a file path from registry actually exists */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    let cleaned = filePath.replace(/"/g, '').trim()
    const exeMatch = cleaned.match(/^(.+?\.(exe|dll|ocx|sys|cpl))/i)
    if (exeMatch) cleaned = exeMatch[1]
    cleaned = cleaned.replace(/%([^%]+)%/g, (_, v) => process.env[v] || `%${v}%`)
    await fs.access(cleaned)
    return true
  } catch { return false }
}

/** Scan broken Uninstall entries */
async function scanBrokenUninstall(): Promise<RegistryIssue[]> {
  const issues: RegistryIssue[] = []
  try {
    const { stdout } = await execAsync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall" /s',
      { timeout: 15000, maxBuffer: 5 * 1024 * 1024 }
    )
    const blocks = stdout.split(/\r?\n\r?\n/)
    for (const block of blocks) {
      const lines = block.split(/\r?\n/)
      const keyLine = lines.find(l => l.startsWith('HKEY_'))
      if (!keyLine) continue
      let displayName = '', installLocation = '', uninstallString = ''
      for (const line of lines) {
        const m = line.match(/^\s{4}(.+?)\s{4}REG_SZ\s{4}(.+)/i)
        if (!m) continue
        const n = m[1].trim(), v = m[2].trim()
        if (n === 'DisplayName') displayName = v
        if (n === 'InstallLocation') installLocation = v
        if (n === 'UninstallString') uninstallString = v
      }
      if (displayName && uninstallString && !(await pathExists(uninstallString))) {
        issues.push({ key: keyLine.trim(), valueName: displayName, type: 'orphaned_uninstall', description: `"${displayName}" — деинсталлятор не найден`, severity: 'medium' })
      }
      if (displayName && installLocation && installLocation.length > 3 && !(await pathExists(installLocation))) {
        issues.push({ key: keyLine.trim(), valueName: displayName, type: 'broken_path', description: `"${displayName}" — путь установки не существует`, severity: 'low' })
      }
    }
  } catch { /* empty */ }
  return issues
}

/** Scan broken App Paths entries */
async function scanBrokenAppPaths(): Promise<RegistryIssue[]> {
  const issues: RegistryIssue[] = []
  try {
    const { stdout } = await execAsync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths" /s',
      { timeout: 10000, maxBuffer: 2 * 1024 * 1024 }
    )
    const blocks = stdout.split(/\r?\n\r?\n/)
    for (const block of blocks) {
      const lines = block.split(/\r?\n/)
      const keyLine = lines.find(l => l.startsWith('HKEY_'))
      if (!keyLine) continue
      for (const line of lines) {
        const m = line.match(/^\s+\(Default\)\s+REG_SZ\s{4}(.+)/i)
        if (m) {
          const appPath = m[1].trim()
          if (appPath.length > 3 && !(await pathExists(appPath))) {
            const appName = keyLine.split('\\').pop() || 'Unknown'
            issues.push({ key: keyLine.trim(), valueName: appName, type: 'broken_path', description: `App Paths: "${appName}" — файл не найден`, severity: 'low' })
          }
        }
      }
    }
  } catch { /* skip */ }
  return issues
}

/** Scan stale MUI cache — collects individual value names for deletion */
async function scanMuiCache(): Promise<RegistryIssue[]> {
  const issues: RegistryIssue[] = []
  const MUI_KEY = 'HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\MuiCache'
  try {
    const { stdout } = await execAsync(
      `reg query "${MUI_KEY}"`,
      { timeout: 10000, maxBuffer: 5 * 1024 * 1024 }
    )
    const staleEntries: string[] = []
    for (const line of stdout.split(/\r?\n/)) {
      const m = line.match(/^\s{4}(.+?)\s{4}REG_SZ\s{4}(.+)/i)
      if (m) {
        const valueName = m[1].trim()
        const fp = valueName.replace('.FriendlyAppName', '')
        if ((fp.includes(':\\') || fp.includes('%')) && !(await pathExists(fp))) {
          staleEntries.push(valueName)
        }
      }
      if (staleEntries.length >= 50) break /* Limit scan depth */
    }
    if (staleEntries.length > 0) {
      issues.push({
        key: MUI_KEY,
        valueName: staleEntries.join('|'),  /* Store all value names joined */
        type: 'stale_mru',
        description: `MUI Cache: ${staleEntries.length} записей для удалённых программ`,
        severity: 'low'
      })
    }
  } catch { /* skip */ }
  return issues
}

/** Scan obsolete startup entries (programs removed but startup entry remains) */
async function scanObsoleteStartup(): Promise<RegistryIssue[]> {
  const issues: RegistryIssue[] = []
  const STARTUP_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
  try {
    const { stdout } = await execAsync(
      `reg query "${STARTUP_KEY}"`,
      { timeout: 10000 }
    )
    for (const line of stdout.split(/\r?\n/)) {
      const m = line.match(/^\s{4}(.+?)\s{4}REG_SZ\s{4}(.+)/i)
      if (m) {
        const name = m[1].trim(), cmdPath = m[2].trim()
        if (!(await pathExists(cmdPath))) {
          /* FIX: Use FULL registry key path, not truncated */
          issues.push({ key: STARTUP_KEY, valueName: name, type: 'obsolete_startup', description: `Автозагрузка: "${name}" — файл не найден`, severity: 'high' })
        }
      }
    }
  } catch { /* skip */ }
  return issues
}

/** Scan SharedDLLs for orphaned entries — collect real value names */
async function scanSharedDlls(): Promise<RegistryIssue[]> {
  const issues: RegistryIssue[] = []
  const SHARED_KEY = 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\SharedDLLs'
  try {
    const { stdout } = await execAsync(
      `reg query "${SHARED_KEY}"`,
      { timeout: 15000, maxBuffer: 5 * 1024 * 1024 }
    )
    const staleEntries: string[] = []
    for (const line of stdout.split(/\r?\n/)) {
      const m = line.match(/^\s{4}(.+?)\s{4}REG_DWORD\s{4}(.+)/i)
      if (m) {
        const dllPath = m[1].trim()
        if (dllPath.includes(':\\') && !(await pathExists(dllPath))) {
          staleEntries.push(dllPath)
        }
      }
      if (staleEntries.length >= 50) break /* Limit scan depth */
    }
    if (staleEntries.length > 0) {
      issues.push({
        key: SHARED_KEY,
        valueName: staleEntries.join('|'),
        type: 'stale_shared_dll',
        description: `SharedDLLs: ${staleEntries.length} записей с отсутствующими файлами`,
        severity: 'low'
      })
    }
  } catch { /* skip */ }
  return issues
}

/** Full registry scan */
async function scanRegistry(): Promise<RegistryIssue[]> {
  const allIssues: RegistryIssue[] = []
  const results = await Promise.allSettled([
    scanBrokenUninstall(),
    scanBrokenAppPaths(),
    scanMuiCache(),
    scanObsoleteStartup(),
    scanSharedDlls()
  ])
  for (const r of results) {
    if (r.status === 'fulfilled') allIssues.push(...r.value)
  }
  /* Assign unique IDs */
  allIssues.forEach((issue, i) => { (issue as any).id = `reg_${i}_${Date.now()}` })
  return allIssues
}

/** Backup specific registry keys to .reg file before deleting */
export async function backupRegistry(issues: RegistryIssue[]): Promise<{ backupPath: string } | { error: string }> {
  const backupDir = path.join(os.homedir(), 'Documents', 'LiquidApp_Backups')
  try {
    await fs.mkdir(backupDir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupFile = path.join(backupDir, `registry_backup_${ts}.reg`)

    let content = 'Windows Registry Editor Version 5.00\r\n\r\n'
    content += `; Liquid App Registry Backup\r\n`
    content += `; Date: ${new Date().toLocaleString()}\r\n`
    content += `; Issues: ${issues.length}\r\n\r\n`

    /* Export each key */
    for (const issue of issues) {
      const key = issue.key
      if (!key || !key.startsWith('HK')) continue
      try {
        const { stdout } = await execAsync(`reg export "${key}" CON /y`, { timeout: 5000 })
        content += `; ${issue.description}\r\n`
        content += stdout.replace('Windows Registry Editor Version 5.00', '').trim()
        content += '\r\n\r\n'
      } catch {
        /* Key may not be exportable, write a comment */
        content += `; FAILED TO EXPORT: ${key}\r\n`
        content += `; ${issue.description}\r\n\r\n`
      }
    }

    await fs.writeFile(backupFile, content, 'utf-8')
    return { backupPath: backupFile }
  } catch (err) {
    return { error: `Ошибка создания бэкапа: ${String(err)}` }
  }
}

/** Clean only selected registry issues */
export async function cleanSelectedRegistry(issues: RegistryIssue[]): Promise<{ cleaned: number; failed: number; errors: string[] }> {
  let cleaned = 0, failed = 0
  const errors: string[] = []

  /** Normalize long-form HKEY names to short-form for reg.exe */
  const normalizeKey = (key: string): string =>
    key.replace(/^HKEY_CURRENT_USER/i, 'HKCU')
       .replace(/^HKEY_LOCAL_MACHINE/i, 'HKLM')
       .replace(/^HKEY_CLASSES_ROOT/i, 'HKCR')

  for (const issue of issues) {
    const nKey = normalizeKey(issue.key)
    try {
      if (issue.type === 'orphaned_uninstall' || issue.type === 'broken_path') {
        /* For full key entries — delete the whole subkey */
        if (nKey.startsWith('HK')) {
          await execAsync(`reg delete "${nKey}" /f`, { timeout: 8000 })
          cleaned++
        }
      } else if (issue.type === 'obsolete_startup') {
        /* For startup entries — delete specific value using FULL key path */
        await execAsync(`reg delete "${nKey}" /v "${issue.valueName}" /f`, { timeout: 5000 })
        cleaned++
      } else if (issue.type === 'stale_mru' || issue.type === 'stale_shared_dll') {
        /* MUI cache / SharedDLLs — delete individual stale entries by value name */
        const valueNames = issue.valueName.split('|').filter(v => v.length > 0)
        for (const vn of valueNames) {
          try {
            await execAsync(`reg delete "${nKey}" /v "${vn}" /f`, { timeout: 3000 })
            cleaned++
          } catch (e) {
            failed++
            errors.push(`${vn}: ${String(e)}`)
          }
        }
      }
    } catch (err) {
      failed++
      const errMsg = String(err)
      errors.push(`[${issue.type}] ${issue.valueName}: ${errMsg.slice(0, 200)}`)
    }
  }

  return { cleaned, failed, errors }
}

/** Full system scan (files + registry) */
export async function scanSystem(): Promise<ScanResult> {
  const start = Date.now()
  const [categories, registryIssues] = await Promise.all([
    Promise.all([
      scanTempFiles(),
      scanBrowserCache(),
      scanJunkFiles(),
      scanRecycleBin(),
      scanWindowsUpdate()
    ]),
    scanRegistry()
  ])

  if (registryIssues.length > 0) {
    categories.push({
      id: 'registry',
      name: 'Registry Issues',
      nameRu: 'Ошибки реестра',
      icon: 'settings_suggest',
      files: [],
      totalSize: 0,
      selected: true,
      count: registryIssues.length
    })
  }

  return {
    categories,
    registryIssues,
    totalSize: categories.reduce((s, c) => s + c.totalSize, 0),
    scanDuration: Date.now() - start
  }
}

/**
 * Delete directory contents aggressively — rm -rf each child.
 * Skips locked/busy files instantly (0 retries) to prevent hanging.
 * Returns { deleted, skipped } counts.
 * Optionally calls onProgress every batch for live UI feedback.
 */
async function nukeDirectoryContents(
  dirPath: string,
  onProgress?: (deleted: number, skipped: number, freedBytes: number) => void
): Promise<{ deleted: number; skipped: number; freedBytes: number }> {
  let deleted = 0, skipped = 0, freedBytes = 0
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fp = path.join(dirPath, entry.name)
      try {
        const stat = await fs.stat(fp).catch(() => null)
        const size = stat?.isDirectory() ? 0 : (stat?.size || 0)
        /* Use Promise.race with a 3s timeout to skip stuck files */
        await Promise.race([
          fs.rm(fp, { recursive: true, force: true, maxRetries: 0 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ])
        deleted++
        freedBytes += size
      } catch {
        skipped++
      }
      /* Emit progress every 20 files */
      if (onProgress && (deleted + skipped) % 20 === 0) {
        onProgress(deleted, skipped, freedBytes)
      }
    }
  } catch { /* directory inaccessible */ }
  if (onProgress) onProgress(deleted, skipped, freedBytes)
  return { deleted, skipped, freedBytes }
}

/**
 * Clean selected file categories.
 * IMPORTANT: Registry is excluded — must be cleaned via cleanSelectedRegistry() with explicit user selection.
 * Uses aggressive directory-level deletion + optional browser kill.
 * Emits 'cleaner:progress' events to the renderer for real-time progress tracking.
 */
export async function cleanFiles(targetIds: string[], win?: import('electron').BrowserWindow | null, killBrowsersFirst = true): Promise<CleanResult> {
  let cleaned = 0, failed = 0, freedSpace = 0, lockedCount = 0
  const registryCleaned = 0
  const errors: string[] = []

  const totalSteps = targetIds.length
  let currentStep = 0

  /** Send progress event to renderer */
  const emit = (categoryId: string, status: 'start' | 'done' | 'progress', extra?: Record<string, any>) => {
    if (status === 'done') currentStep++
    const percent = Math.round((currentStep / totalSteps) * 100)
    try {
      win?.webContents?.send('cleaner:progress', { categoryId, status, percent, step: currentStep, totalSteps, ...extra })
    } catch { /* window may be closed */ }
  }

  /* Check if browsers are running */
  const runningBrowsers = await areBrowsersRunning()
  const browsersWereRunning = runningBrowsers.length > 0
  const needsBrowserKill = browsersWereRunning && (targetIds.includes('browser_cache'))

  /* Kill browsers if cleaning browser cache and they're running */
  if (needsBrowserKill && killBrowsersFirst) {
    await killBrowsers()
    /* Extra wait for file handles to release on Windows */
    await new Promise(r => setTimeout(r, 1000))
  }

  /* ── Temp files: delete contents of temp directories ── */
  if (targetIds.includes('temp')) {
    emit('temp', 'start')
    for (const tempPath of TEMP_PATHS) {
      const r = await nukeDirectoryContents(tempPath, (del, skip, freed) => {
        emit('temp', 'progress', { deleted: cleaned + del, skipped: failed + skip, freedBytes: freedSpace + freed })
      })
      cleaned += r.deleted
      failed += r.skipped
      freedSpace += r.freedBytes
    }
    emit('temp', 'done')
  }

  /* ── Browser cache: delete entire cache directories (they will be recreated) ── */
  if (targetIds.includes('browser_cache')) {
    emit('browser_cache', 'start')
    for (const [, paths] of Object.entries(BROWSER_CACHE_PATHS)) {
      for (const cachePath of paths) {
        try {
          const stat = await fs.stat(cachePath).catch(() => null)
          if (!stat) continue
          const sizeResult = await getDirSize(cachePath)
          await fs.rm(cachePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 })
          cleaned++
          freedSpace += sizeResult.size
        } catch {
          /* If rm failed, try deleting contents individually */
          const r = await nukeDirectoryContents(cachePath)
          cleaned += r.deleted
          lockedCount += r.skipped
          freedSpace += r.freedBytes
        }
      }
    }
    emit('browser_cache', 'done')
  }

  /* ── Junk files ── */
  if (targetIds.includes('junk')) {
    emit('junk', 'start')
    const junkPaths = [
      path.join(os.homedir(), 'AppData/Local/CrashDumps'),
      path.join(os.homedir(), 'AppData/Local/D3DSCache'),
      'C:\\Windows\\Minidump',
      'C:\\Windows\\Logs',
    ]
    for (const junkPath of junkPaths) {
      const r = await nukeDirectoryContents(junkPath)
      cleaned += r.deleted
      failed += r.skipped
      freedSpace += r.freedBytes
    }
    emit('junk', 'done')
  }

  /* ── Recycle Bin ── */
  if (targetIds.includes('recycle_bin')) {
    emit('recycle_bin', 'start')
    try {
      /* Get size before clearing */
      let binSize = 0
      try {
        const { stdout } = await execAsync(
          'powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).NameSpace(0xA).Items() | ForEach-Object { $_.Size } | Measure-Object -Sum | Select-Object -ExpandProperty Sum"',
          { timeout: 10000 }
        )
        binSize = parseInt(stdout.trim()) || 0
      } catch { /* skip */ }

      await execAsync(
        'powershell -NoProfile -Command "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"',
        { timeout: 30000 }
      )
      freedSpace += binSize
      cleaned++
    } catch (e) {
      failed++
      errors.push(`Корзина: ${String(e)}`)
    }
    emit('recycle_bin', 'done')
  }

  /* ── Windows Update cache: stop service, clean, restart ── */
  if (targetIds.includes('windows_update')) {
    emit('windows_update', 'start')
    try {
      /* Stop Windows Update service */
      await execAsync('net stop wuauserv /y', { timeout: 15000 }).catch(() => {})
      await execAsync('net stop bits /y', { timeout: 10000 }).catch(() => {})
      await new Promise(r => setTimeout(r, 1000))

      /* Delete contents */
      const wuPath = 'C:\\Windows\\SoftwareDistribution\\Download'
      const r = await nukeDirectoryContents(wuPath)
      cleaned += r.deleted
      failed += r.skipped
      freedSpace += r.freedBytes

      /* Restart services */
      await execAsync('net start wuauserv', { timeout: 15000 }).catch(() => {})
      await execAsync('net start bits', { timeout: 10000 }).catch(() => {})
    } catch (e) {
      failed++
      errors.push(`Windows Update: ${String(e)}`)
      /* Always try to restart services */
      await execAsync('net start wuauserv', { timeout: 10000 }).catch(() => {})
      await execAsync('net start bits', { timeout: 10000 }).catch(() => {})
    }
    emit('windows_update', 'done')
  }

  return { cleaned, failed, freedSpace, registryCleaned, errors, lockedCount, browsersWereRunning }
}
