/**
 * System Backup & Restore Service
 * Windows Restore Points + Full Registry Backup + Restore
 * All commands use UTF-8 encoding for correct Cyrillic output
 */
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { app, shell } from 'electron'

const execAsync = promisify(exec)

/** Force UTF-8 encoding for PowerShell output */
function psUtf8(cmd: string): string {
  return `powershell -NoProfile -Command "[Console]::OutputEncoding = [Text.Encoding]::UTF8; ${cmd}"`
}

export interface RestorePoint {
  sequenceNumber: number
  description: string
  creationTime: string
  type: string
}

export interface BackupResult {
  success: boolean
  messageKey: string
  detail?: string
  path?: string
}

/** Get backup directory */
function getBackupDir(): string {
  const dir = path.join(app.getPath('userData'), 'backups')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Check if System Protection is enabled */
export async function isSystemProtectionEnabled(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      psUtf8("(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore' -Name RPSessionInterval -ErrorAction SilentlyContinue).RPSessionInterval"),
      { timeout: 5000, encoding: 'utf8' }
    )
    const val = parseInt(stdout.trim())
    return val !== 0
  } catch {
    return false
  }
}

/** List all system restore points */
export async function listRestorePoints(): Promise<RestorePoint[]> {
  try {
    const { stdout } = await execAsync(
      psUtf8("Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, @{N='CreationTime';E={$_.ConvertToDateTime($_.CreationTime).ToString('yyyy-MM-dd HH:mm:ss')}}, RestorePointType | ConvertTo-Json -Depth 2"),
      { timeout: 15000, encoding: 'utf8' }
    )

    const trimmed = stdout.trim()
    if (!trimmed || trimmed === '') return []

    const parsed = JSON.parse(trimmed)
    const items = Array.isArray(parsed) ? parsed : [parsed]

    return items.map((p: any) => ({
      sequenceNumber: p.SequenceNumber,
      description: p.Description || 'System Restore Point',
      creationTime: p.CreationTime || '',
      type: p.RestorePointType === 0 ? 'APPLICATION_INSTALL' :
            p.RestorePointType === 10 ? 'DEVICE_DRIVER_INSTALL' :
            p.RestorePointType === 12 ? 'MODIFY_SETTINGS' :
            p.RestorePointType === 13 ? 'CANCELLED_OPERATION' : 'OTHER'
    }))
  } catch (err) {
    console.error('Failed to list restore points:', err)
    return []
  }
}

/** Create a new system restore point */
export async function createRestorePoint(description: string): Promise<BackupResult> {
  try {
    const desc = description.replace(/'/g, "''").substring(0, 256)
    await execAsync(
      psUtf8(`Checkpoint-Computer -Description '${desc}' -RestorePointType 'MODIFY_SETTINGS'`),
      { timeout: 120000, encoding: 'utf8' }
    )
    return { success: true, messageKey: 'rp_created' }
  } catch (err: any) {
    const msg = String(err?.stderr || err?.message || err)
    if (msg.includes('frequency')) {
      return { success: false, messageKey: 'rp_frequency' }
    }
    if (msg.includes('Access') || msg.includes('administrator')) {
      return { success: false, messageKey: 'rp_access' }
    }
    return { success: false, messageKey: 'rp_error', detail: msg.substring(0, 200) }
  }
}

/** Full registry backup */
export async function backupRegistry(): Promise<BackupResult> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
    const dir = path.join(getBackupDir(), `registry-${timestamp}`)
    fs.mkdirSync(dir, { recursive: true })

    const hklmPath = path.join(dir, 'HKLM_backup.reg')
    const hkcuPath = path.join(dir, 'HKCU_backup.reg')

    await execAsync(`chcp 65001 >nul && reg export HKLM "${hklmPath}" /y`, { timeout: 120000, encoding: 'utf8' }).catch(() =>
      execAsync(`chcp 65001 >nul && reg export "HKLM\\SOFTWARE" "${hklmPath}" /y`, { timeout: 120000, encoding: 'utf8' })
    )

    await execAsync(`chcp 65001 >nul && reg export HKCU "${hkcuPath}" /y`, { timeout: 60000, encoding: 'utf8' })

    const files = fs.readdirSync(dir)
    const totalSize = files.reduce((sum, f) => sum + fs.statSync(path.join(dir, f)).size, 0)
    const sizeMB = (totalSize / 1024 / 1024).toFixed(1)

    return { success: true, messageKey: 'reg_backed_up', detail: sizeMB, path: dir }
  } catch (err) {
    return { success: false, messageKey: 'reg_backup_failed', detail: String(err).substring(0, 200) }
  }
}

/** Restore registry from a backup directory */
export async function restoreRegistryFromBackup(backupDir: string): Promise<BackupResult> {
  try {
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.reg'))
    if (files.length === 0) {
      return { success: false, messageKey: 'reg_restore_no_files' }
    }

    for (const file of files) {
      const fullPath = path.join(backupDir, file)
      await execAsync(`chcp 65001 >nul && reg import "${fullPath}"`, { timeout: 120000, encoding: 'utf8' })
    }

    return { success: true, messageKey: 'reg_restored' }
  } catch (err) {
    return { success: false, messageKey: 'reg_restore_failed', detail: String(err).substring(0, 200) }
  }
}

/** Restore system from a restore point (triggers reboot!) */
export async function restoreSystem(sequenceNumber: number): Promise<BackupResult> {
  try {
    /* This will trigger a system reboot */
    await execAsync(
      psUtf8(`Restore-Computer -RestorePoint ${sequenceNumber} -Confirm:$false`),
      { timeout: 30000, encoding: 'utf8' }
    )
    return { success: true, messageKey: 'sys_restore_started' }
  } catch (err: any) {
    const msg = String(err?.stderr || err?.message || err)
    return { success: false, messageKey: 'sys_restore_failed', detail: msg.substring(0, 200) }
  }
}

/** List existing backups */
export function listBackups(): { name: string; path: string; date: string; sizeMB: number }[] {
  try {
    const dir = getBackupDir()
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    return entries
      .filter(e => e.isDirectory() && e.name.startsWith('registry-'))
      .map(e => {
        const fullPath = path.join(dir, e.name)
        const files = fs.readdirSync(fullPath)
        const totalSize = files.reduce((sum, f) => {
          try { return sum + fs.statSync(path.join(fullPath, f)).size } catch { return sum }
        }, 0)
        const dateStr = e.name.replace('registry-', '').replace('T', ' ').substring(0, 16).replace(/-/g, (m, i) => i > 9 ? ':' : '-')
        return {
          name: e.name,
          path: fullPath,
          date: dateStr,
          sizeMB: Math.round(totalSize / 1024 / 1024 * 10) / 10
        }
      })
      .sort((a, b) => b.name.localeCompare(a.name))
  } catch {
    return []
  }
}

/** Open backup folder in Explorer */
export function openBackupFolder(dirPath: string): void {
  shell.openPath(dirPath)
}
