/**
 * Startup Manager Service
 * Reads and manages autorun entries from Windows Registry
 */
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface StartupItem {
  id: string
  name: string
  command: string
  location: string
  publisher: string
  impact: 'low' | 'medium' | 'high' | 'unknown'
  enabled: boolean
  isSystem: boolean
}

/** Read startup items from registry */
async function readRegistryStartup(hive: string, key: string): Promise<StartupItem[]> {
  const items: StartupItem[] = []
  try {
    const { stdout } = await execAsync(
      `reg query "${hive}\\${key}"`,
      { timeout: 10000 }
    )
    const lines = stdout.split('\n').filter(l => l.trim())
    for (const line of lines) {
      /* Match: leading whitespace, then NAME (may have spaces), then REG_SZ, then value */
      const match = line.match(/^\s{4}(.+?)\s{4}REG_SZ\s{4}(.+)/i)
      if (match) {
        const name = match[1].trim()
        const command = match[2].trim()
        items.push({
          id: `${hive}:${key}:${name}`,
          name,
          command,
          location: `${hive}\\${key}`,
          publisher: extractPublisher(command),
          impact: estimateImpact(name, command),
          enabled: true,
          isSystem: hive === 'HKLM'
        })
      }
    }
  } catch {
    /* Registry key not found or access denied */
  }
  return items
}

/** Extract likely publisher from command path */
function extractPublisher(command: string): string {
  const cleaned = command.replace(/"/g, '')
  const parts = cleaned.split('\\')
  const progIndex = parts.findIndex(p =>
    p.toLowerCase() === 'program files' || p.toLowerCase() === 'program files (x86)'
  )
  if (progIndex >= 0 && parts.length > progIndex + 1) {
    return parts[progIndex + 1]
  }
  return parts[parts.length - 1]?.replace(/\.exe.*/i, '') || 'Unknown'
}

/** Estimate startup impact */
function estimateImpact(name: string, command: string): 'low' | 'medium' | 'high' | 'unknown' {
  const cmd = (name + command).toLowerCase()
  const highImpact = ['steam', 'discord', 'spotify', 'teams', 'onedrive', 'dropbox', 'adobe', 'skype', 'epic', 'ea ', 'edge']
  if (highImpact.some(h => cmd.includes(h))) return 'high'
  const lowImpact = ['security', 'defender', 'realtek', 'nvidia', 'intel', 'synaptics', 'razer']
  if (lowImpact.some(l => cmd.includes(l))) return 'low'
  return 'medium'
}

/** Get all startup items */
export async function getStartupItems(): Promise<StartupItem[]> {
  const keys = [
    { hive: 'HKCU', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\Run' },
    { hive: 'HKLM', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\Run' },
  ]

  const allItems: StartupItem[] = []
  for (const { hive, key } of keys) {
    const items = await readRegistryStartup(hive, key)
    allItems.push(...items)
  }

  /* Check disabled items via StartupApproved */
  const approvedKeys = [
    { hive: 'HKCU', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run' },
    { hive: 'HKLM', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run' },
  ]
  for (const { hive, key } of approvedKeys) {
    try {
      const { stdout } = await execAsync(
        `reg query "${hive}\\${key}"`,
        { timeout: 10000 }
      )
      const lines = stdout.split('\n')
      for (const line of lines) {
        const match = line.match(/^\s{4}(.+?)\s{4}REG_BINARY\s{4}(.+)/i)
        if (match) {
          const itemName = match[1].trim()
          const binaryData = match[2].trim()
          const isDisabled = binaryData.startsWith('03')
          const existing = allItems.find(i => i.name === itemName && i.isSystem === (hive === 'HKLM'))
          if (existing && isDisabled) {
            existing.enabled = false
          }
        }
      }
    } catch { /* Not available */ }
  }

  /* Check scheduled tasks */
  try {
    const psScript = `Get-ScheduledTask | Where-Object { $_.TaskPath -notlike '\\\\Microsoft*' -and $_.Actions.Execute } | ForEach-Object { [PSCustomObject]@{ TaskName = $_.TaskName; TaskPath = $_.TaskPath; State = $_.State.ToString(); Execute = $_.Actions.Execute } } | ConvertTo-Json -Compress`
    const escapedCmd = psScript.replace(/"/g, '\\"')
    const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -Command "${escapedCmd}"`, { timeout: 15000 })
    if (stdout.trim()) {
      const parsed = JSON.parse(stdout)
      const tasks = Array.isArray(parsed) ? parsed : [parsed]
      for (const t of tasks) {
        if (!t.TaskName) continue
        const executeStr = Array.isArray(t.Execute) ? t.Execute.join('; ') : t.Execute
        allItems.push({
          id: `schtask:${t.TaskPath || '\\'}:${t.TaskName}`,
          name: t.TaskName,
          command: executeStr || '',
          location: `Task Scheduler (${t.TaskPath || '\\'})`,
          publisher: extractPublisher(executeStr || ''),
          impact: estimateImpact(t.TaskName, executeStr || ''),
          enabled: t.State !== 'Disabled',
          isSystem: false
        })
      }
    }
  } catch (err) {
    console.error('[Startup] Failed to fetch scheduled tasks:', err)
  }

  return allItems
}

/** Toggle a startup item on/off */
export async function toggleStartupItem(id: string, enabled: boolean): Promise<{ success: boolean }> {
  if (id.startsWith('schtask:')) {
    const parts = id.split(':')
    if (parts.length < 3) return { success: false }
    const taskPath = parts[1]
    const taskName = parts.slice(2).join(':')

    try {
      const action = enabled ? 'Enable-ScheduledTask' : 'Disable-ScheduledTask'
      const cmd = `${action} -TaskName "${taskName}" -TaskPath "${taskPath}"`
      const escapedCmd = cmd.replace(/"/g, '\\"')
      await execAsync(`powershell -NoProfile -NonInteractive -Command "${escapedCmd}"`, { timeout: 10000 })
      return { success: true }
    } catch (err) {
      console.error('[Startup] Failed to toggle scheduled task:', err)
      return { success: false }
    }
  }

  const parts = id.split(':')
  if (parts.length < 3) return { success: false }

  const hive = parts[0] /* HKCU or HKLM */
  const name = parts.slice(2).join(':')

  /* Write to the correct StartupApproved path matching the item's hive.
     HKLM items are managed by HKLM\...\StartupApproved\Run (requires admin).
     HKCU items are managed by HKCU\...\StartupApproved\Run. */
  const approvedPath = `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run`

  try {
    if (enabled) {
      await execAsync(
        `reg add "${approvedPath}" /v "${name}" /t REG_BINARY /d 020000000000000000000000 /f`,
        { timeout: 10000 }
      )
    } else {
      await execAsync(
        `reg add "${approvedPath}" /v "${name}" /t REG_BINARY /d 030000000000000000000000 /f`,
        { timeout: 10000 }
      )
    }
    return { success: true }
  } catch {
    return { success: false }
  }
}
