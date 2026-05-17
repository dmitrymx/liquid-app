/**
 * Logger — Intercepts all console output and stores in memory ring buffer.
 * Provides IPC handler for renderer to fetch/save logs.
 */
import { ipcMain, app, dialog, shell } from 'electron'
import fs from 'fs'
import path from 'path'

interface LogEntry {
  ts: string
  level: 'log' | 'warn' | 'error' | 'info'
  msg: string
}

const MAX_LOG_ENTRIES = 2000
const logBuffer: LogEntry[] = []

/** Original console methods — we wrap them */
const origLog = console.log.bind(console)
const origWarn = console.warn.bind(console)
const origError = console.error.bind(console)
const origInfo = console.info.bind(console)

function formatArgs(args: any[]): string {
  return args.map(a => {
    if (typeof a === 'string') return a
    try { return JSON.stringify(a) } catch { return String(a) }
  }).join(' ')
}

function pushEntry(level: LogEntry['level'], args: any[]) {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    msg: formatArgs(args)
  }
  logBuffer.push(entry)
  /* Use shift() instead of splice() — O(1) per removal vs O(n) bulk shift */
  while (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.shift()
  }
}

/** Install console hooks — call once at app start */
export function installLogger(): void {
  console.log = (...args: any[]) => {
    pushEntry('log', args)
    origLog(...args)
  }
  console.warn = (...args: any[]) => {
    pushEntry('warn', args)
    origWarn(...args)
  }
  console.error = (...args: any[]) => {
    pushEntry('error', args)
    origError(...args)
  }
  console.info = (...args: any[]) => {
    pushEntry('info', args)
    origInfo(...args)
  }

  // Catch uncaught exceptions
  process.on('uncaughtException', (err) => {
    pushEntry('error', [`[UNCAUGHT] ${err.stack || err.message}`])
    origError('[UNCAUGHT]', err)
  })
  process.on('unhandledRejection', (reason) => {
    pushEntry('error', [`[UNHANDLED_REJECTION] ${reason}`])
    origError('[UNHANDLED_REJECTION]', reason)
  })

  origLog('[Logger] Installed — capturing all console output')
}

/** Get all log entries */
export function getLogs(): LogEntry[] {
  return [...logBuffer]
}

/** Save logs to file and return the path */
export async function saveLogsToFile(): Promise<string> {
  const logsDir = path.join(app.getPath('userData'), 'logs')
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
  const filePath = path.join(logsDir, `liquid-app-${timestamp}.log`)

  const content = logBuffer.map(e =>
    `[${e.ts}] [${e.level.toUpperCase().padEnd(5)}] ${e.msg}`
  ).join('\n')

  fs.writeFileSync(filePath, content, 'utf-8')
  return filePath
}

/** Register IPC handlers for logs */
export function registerLoggerIPC(): void {
  ipcMain.handle('logs:get', () => getLogs())

  ipcMain.handle('logs:save', async () => {
    try {
      const filePath = await saveLogsToFile()
      return { ok: true, path: filePath }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('logs:openFolder', async () => {
    const logsDir = path.join(app.getPath('userData'), 'logs')
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true })
    shell.openPath(logsDir)
  })
}
