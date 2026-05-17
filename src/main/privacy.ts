/**
 * Privacy & Security Service
 * Real browser data scanning and cleaning — granular categories
 * Now properly kills browsers before cleaning to avoid EBUSY errors
 */
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

const execAsync = promisify(exec)

export interface PrivacyCategory {
  id: string
  name: string
  nameRu: string
  icon: string
  count: number
  size: number
  selected: boolean
  paths: string[]
  warning?: string
  warningRu?: string
}

export interface PrivacyScanResult {
  categories: PrivacyCategory[]
  totalCount: number
  totalSize: number
}

export interface PrivacyCleanResult {
  cleaned: number
  failed: number
  freedSize: number
  browsersKilled: string[]
}

const HOME = os.homedir()
const BROWSER_PROCESSES = ['chrome.exe', 'msedge.exe', 'firefox.exe', 'opera.exe', 'brave.exe']

/** Check if any browsers are currently running */
async function areBrowsersRunning(): Promise<string[]> {
  const running: string[] = []
  try {
    const { stdout } = await execAsync('tasklist /FO CSV /NH', { timeout: 5000 })
    const lower = stdout.toLowerCase()
    for (const proc of BROWSER_PROCESSES) {
      if (lower.includes(proc.toLowerCase())) {
        running.push(proc.replace('.exe', ''))
      }
    }
  } catch { /* skip */ }
  return running
}

/** Kill browser processes */
async function killBrowsers(): Promise<string[]> {
  const killed: string[] = []
  for (const proc of BROWSER_PROCESSES) {
    try {
      await execAsync(`taskkill /IM "${proc}" /F 2>nul`, { timeout: 5000 })
      killed.push(proc.replace('.exe', ''))
    } catch { /* Not running */ }
  }
  if (killed.length > 0) {
    await new Promise(r => setTimeout(r, 1500))
  }
  return killed
}

/** Count files in a directory (non-recursive, fast) */
async function countFiles(dirPath: string): Promise<{ count: number; size: number; paths: string[] }> {
  let count = 0, size = 0
  const paths: string[] = []
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const e of entries) {
      if (e.isFile()) {
        try {
          const fp = path.join(dirPath, e.name)
          const st = await fs.stat(fp)
          count++
          size += st.size
          if (paths.length < 100) paths.push(fp)
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }
  return { count, size, paths }
}

/** Recursively count files matching patterns */
async function countFilesRecursive(
  dirPath: string,
  extensions?: string[],
  maxDepth = 3,
  depth = 0
): Promise<{ count: number; size: number; paths: string[] }> {
  let count = 0, size = 0
  const paths: string[] = []
  if (depth > maxDepth) return { count, size, paths }
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const e of entries) {
      const fp = path.join(dirPath, e.name)
      try {
        if (e.isFile()) {
          if (!extensions || extensions.some(ext => e.name.endsWith(ext))) {
            const st = await fs.stat(fp)
            count++
            size += st.size
            if (paths.length < 200) paths.push(fp)
          }
        } else if (e.isDirectory() && depth < maxDepth) {
          const sub = await countFilesRecursive(fp, extensions, maxDepth, depth + 1)
          count += sub.count
          size += sub.size
          paths.push(...sub.paths.slice(0, 50))
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return { count, size, paths }
}

/** Scan browser cookies */
async function scanCookies(): Promise<PrivacyCategory> {
  const cookiePaths = [
    path.join(HOME, 'AppData/Local/Google/Chrome/User Data/Default/Network/Cookies'),
    path.join(HOME, 'AppData/Local/Google/Chrome/User Data/Default/Cookies'),
    path.join(HOME, 'AppData/Local/Microsoft/Edge/User Data/Default/Network/Cookies'),
    path.join(HOME, 'AppData/Local/Microsoft/Edge/User Data/Default/Cookies'),
  ]
  const cookieDirs = [
    path.join(HOME, 'AppData/Local/Google/Chrome/User Data/Default/Network'),
    path.join(HOME, 'AppData/Local/Microsoft/Edge/User Data/Default/Network'),
    path.join(HOME, 'AppData/Roaming/Mozilla/Firefox/Profiles'),
  ]

  let count = 0, size = 0
  const foundPaths: string[] = []

  for (const cp of cookiePaths) {
    try {
      const st = await fs.stat(cp)
      count++
      size += st.size
      foundPaths.push(cp)
    } catch { /* skip */ }
  }

  for (const dir of cookieDirs) {
    const r = await countFilesRecursive(dir, ['.sqlite', 'cookies', '.json'], 2)
    count += r.count
    size += r.size
    foundPaths.push(...r.paths)
  }

  return {
    id: 'cookies', name: 'Browser Cookies', nameRu: 'Cookies браузеров',
    icon: 'cookie', count, size, selected: true, paths: foundPaths,
    warning: '⚠ Deleting cookies will log you out of all websites. Browsers will be closed automatically.',
    warningRu: '⚠ Удаление cookies разлогинит вас из всех сайтов. Браузеры будут закрыты автоматически.'
  }
}

/** Scan browser history ONLY (not Windows Recent) */
async function scanBrowserHistory(): Promise<PrivacyCategory> {
  const historyFiles = [
    path.join(HOME, 'AppData/Local/Google/Chrome/User Data/Default/History'),
    path.join(HOME, 'AppData/Local/Google/Chrome/User Data/Default/Visited Links'),
    path.join(HOME, 'AppData/Local/Google/Chrome/User Data/Default/Top Sites'),
    path.join(HOME, 'AppData/Local/Google/Chrome/User Data/Default/Shortcuts'),
    path.join(HOME, 'AppData/Local/Microsoft/Edge/User Data/Default/History'),
    path.join(HOME, 'AppData/Local/Microsoft/Edge/User Data/Default/Visited Links'),
    path.join(HOME, 'AppData/Local/Microsoft/Edge/User Data/Default/Top Sites'),
  ]

  let count = 0, size = 0
  const foundPaths: string[] = []

  for (const hf of historyFiles) {
    try {
      const st = await fs.stat(hf)
      count++
      size += st.size
      foundPaths.push(hf)
    } catch { /* skip */ }
  }

  return {
    id: 'browser_history', name: 'Browser History', nameRu: 'История браузеров',
    icon: 'history', count, size, selected: true, paths: foundPaths,
    warning: '⚠ Browsing history, search shortcuts, and frequently visited sites will be cleared. Browsers will be closed.',
    warningRu: '⚠ История просмотров, ярлыки поиска и часто посещаемые сайты будут очищены. Браузеры будут закрыты.'
  }
}

/** Scan Windows Recent Files separately */
async function scanRecentFiles(): Promise<PrivacyCategory> {
  const recentDir = path.join(HOME, 'AppData/Roaming/Microsoft/Windows/Recent')

  const recent = await countFiles(recentDir)

  return {
    id: 'recent_files', name: 'Windows Recent Files', nameRu: 'Недавние файлы Windows',
    icon: 'schedule', count: recent.count, size: recent.size, selected: false, paths: recent.paths,
    warning: '⚠ Recent files list in Explorer will be cleared',
    warningRu: '⚠ Список недавних файлов в Проводнике будет очищен'
  }
}

/** Scan sensitive/tracking files (logs, crash reports, diagnostic data) */
async function scanSensitiveFiles(): Promise<PrivacyCategory> {
  const sensitiveDirs = [
    { dir: path.join(HOME, 'AppData/Local/CrashDumps'), ext: ['.dmp', '.mdmp'] },
    { dir: path.join(HOME, 'AppData/Local/Diagnostics'), ext: undefined },
    { dir: path.join(HOME, 'AppData/Local/Microsoft/Windows/WebCache'), ext: undefined },
    { dir: path.join(HOME, 'AppData/Local/ConnectedDevicesPlatform'), ext: ['.log', '.dat'] },
  ]

  let count = 0, size = 0
  const foundPaths: string[] = []

  for (const { dir, ext } of sensitiveDirs) {
    const r = await countFilesRecursive(dir, ext, 2)
    count += r.count
    size += r.size
    foundPaths.push(...r.paths)
  }

  return {
    id: 'sensitive', name: 'Diagnostic & Tracking Data', nameRu: 'Диагностика и трекинг',
    icon: 'fingerprint', count, size, selected: false, paths: foundPaths
  }
}

/** Full privacy scan — 4 granular categories */
export async function scanPrivacy(): Promise<PrivacyScanResult> {
  const categories = await Promise.all([
    scanCookies(),
    scanBrowserHistory(),
    scanRecentFiles(),
    scanSensitiveFiles()
  ])

  return {
    categories,
    totalCount: categories.reduce((s, c) => s + c.count, 0),
    totalSize: categories.reduce((s, c) => s + c.size, 0)
  }
}

/** Clean selected privacy categories — kills browsers first for cookie/history */
export async function cleanPrivacy(targetIds: string[]): Promise<PrivacyCleanResult> {
  const scan = await scanPrivacy()
  const selected = scan.categories.filter(c => targetIds.includes(c.id))

  let cleaned = 0, failed = 0, freedSize = 0
  let browsersKilled: string[] = []

  /* Kill browsers if we're cleaning cookies or history (they lock SQLite files) */
  const needsBrowserKill = targetIds.includes('cookies') || targetIds.includes('browser_history')
  if (needsBrowserKill) {
    const running = await areBrowsersRunning()
    if (running.length > 0) {
      browsersKilled = await killBrowsers()
    }
  }

  for (const cat of selected) {
    for (const fp of cat.paths) {
      try {
        const st = await fs.stat(fp).catch(() => null)
        const size = st?.size || 0
        /* Try unlink first, then rm -rf */
        try {
          await fs.unlink(fp)
        } catch {
          await fs.rm(fp, { recursive: true, force: true, maxRetries: 2, retryDelay: 300 })
        }
        cleaned++
        freedSize += size
      } catch {
        failed++
      }
    }
  }

  return { cleaned, failed, freedSize, browsersKilled }
}
