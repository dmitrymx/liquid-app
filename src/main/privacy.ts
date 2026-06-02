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
const BROWSER_PROCESSES = ['chrome.exe', 'msedge.exe', 'firefox.exe', 'opera.exe', 'brave.exe', 'browser.exe']

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

/** Dynamically detect all Chromium user profile directories */
async function getChromiumProfiles(userDataPath: string): Promise<string[]> {
  const profiles: string[] = []
  try {
    const entries = await fs.readdir(userDataPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const profilePath = path.join(userDataPath, entry.name)
        try {
          await fs.access(path.join(profilePath, 'Preferences'))
          profiles.push(profilePath)
        } catch { /* Not a profile directory */ }
      }
    }
  } catch { /* Directory does not exist */ }
  return profiles
}

/** Dynamically detect all Firefox user profile directories */
async function getFirefoxProfiles(): Promise<string[]> {
  const profiles: string[] = []
  const ffProfilesDir = path.join(HOME, 'AppData/Roaming/Mozilla/Firefox/Profiles')
  try {
    const entries = await fs.readdir(ffProfilesDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const profilePath = path.join(ffProfilesDir, entry.name)
        try {
          await fs.access(path.join(profilePath, 'prefs.js'))
          profiles.push(profilePath)
        } catch { /* Not a profile directory */ }
      }
    }
  } catch { /* Directory does not exist */ }
  return profiles
}

/** Scan browser cookies safely (no bookmark/saved password loss) */
async function scanCookies(): Promise<PrivacyCategory> {
  const foundPaths: string[] = []

  // 1. Chromium browsers: Chrome, Edge, Yandex Browser, Brave
  const chromiumDirs = [
    path.join(HOME, 'AppData/Local/Google/Chrome/User Data'),
    path.join(HOME, 'AppData/Local/Microsoft/Edge/User Data'),
    path.join(HOME, 'AppData/Local/Yandex/YandexBrowser/User Data'),
    path.join(HOME, 'AppData/Local/BraveSoftware/Brave-Browser/User Data'),
  ]

  for (const udPath of chromiumDirs) {
    const profiles = await getChromiumProfiles(udPath)
    for (const profile of profiles) {
      foundPaths.push(
        path.join(profile, 'Network/Cookies'),
        path.join(profile, 'Cookies')
      )
    }
  }

  // 2. Opera Stable
  const operaDir = path.join(HOME, 'AppData/Roaming/Opera Software/Opera Stable')
  foundPaths.push(
    path.join(operaDir, 'Network/Cookies'),
    path.join(operaDir, 'Cookies')
  )

  // 3. Firefox profiles cookies
  const ffProfiles = await getFirefoxProfiles()
  for (const profile of ffProfiles) {
    foundPaths.push(
      path.join(profile, 'cookies.sqlite'),
      path.join(profile, 'cookies.sqlite-shm'),
      path.join(profile, 'cookies.sqlite-wal')
    )
  }

  // Check stat and sum size
  let count = 0, size = 0
  const finalPaths: string[] = []
  for (const p of foundPaths) {
    try {
      const st = await fs.stat(p)
      count++
      size += st.size
      finalPaths.push(p)
    } catch { /* File does not exist */ }
  }

  return {
    id: 'cookies', name: 'Browser Cookies', nameRu: 'Cookies браузеров',
    icon: 'cookie', count, size, selected: true, paths: finalPaths,
    warning: '⚠ Deleting cookies will log you out of all websites. Browsers will be closed automatically.',
    warningRu: '⚠ Удаление cookies разлогинит вас из всех сайтов. Браузеры будут закрыты автоматически.'
  }
}

/** Scan browser history ONLY (no bookmarks lost) */
async function scanBrowserHistory(): Promise<PrivacyCategory> {
  const foundPaths: string[] = []

  // 1. Chromium browsers: Chrome, Edge, Yandex Browser, Brave
  const chromiumDirs = [
    path.join(HOME, 'AppData/Local/Google/Chrome/User Data'),
    path.join(HOME, 'AppData/Local/Microsoft/Edge/User Data'),
    path.join(HOME, 'AppData/Local/Yandex/YandexBrowser/User Data'),
    path.join(HOME, 'AppData/Local/BraveSoftware/Brave-Browser/User Data'),
  ]

  for (const udPath of chromiumDirs) {
    const profiles = await getChromiumProfiles(udPath)
    for (const profile of profiles) {
      foundPaths.push(
        path.join(profile, 'History'),
        path.join(profile, 'History-journal'),
        path.join(profile, 'Visited Links'),
        path.join(profile, 'Top Sites'),
        path.join(profile, 'Shortcuts')
      )
    }
  }

  // 2. Opera Stable
  const operaDir = path.join(HOME, 'AppData/Roaming/Opera Software/Opera Stable')
  foundPaths.push(
    path.join(operaDir, 'History'),
    path.join(operaDir, 'History-journal'),
    path.join(operaDir, 'Visited Links'),
    path.join(operaDir, 'Top Sites'),
    path.join(operaDir, 'Shortcuts')
  )

  // 3. Firefox profiles history (safe files)
  const ffProfiles = await getFirefoxProfiles()
  for (const profile of ffProfiles) {
    foundPaths.push(
      path.join(profile, 'formhistory.sqlite'),
      path.join(profile, 'formhistory.sqlite-shm'),
      path.join(profile, 'formhistory.sqlite-wal'),
      path.join(profile, 'places.sqlite-shm'),
      path.join(profile, 'places.sqlite-wal')
    )
  }

  // Check stat and sum size
  let count = 0, size = 0
  const finalPaths: string[] = []
  for (const p of foundPaths) {
    try {
      const st = await fs.stat(p)
      count++
      size += st.size
      finalPaths.push(p)
    } catch { /* File does not exist */ }
  }

  return {
    id: 'browser_history', name: 'Browser History', nameRu: 'История браузеров',
    icon: 'history', count, size, selected: true, paths: finalPaths,
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
