/**
 * Game Mode Service
 * Kills background processes, sets max power, disables notifications
 */
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface GameModeState {
  active: boolean
  killedProcesses: string[]
  previousPowerGuid: string | null
  freedMB: number
}

/* Processes safe to kill for gaming — non-essential background apps */
const KILLABLE_PROCESSES = [
  'Teams.exe', 'ms-teams.exe', 'Slack.exe', 'Discord.exe',
  'Skype.exe', 'OneDrive.exe', 'SearchApp.exe',
  'YourPhone.exe', 'PhoneExperienceHost.exe', 'WidgetService.exe',
  'GameBar.exe', 'GameBarPresenceWriter.exe',
  'cortana.exe', 'HxTsr.exe', 'HxOutlook.exe',
  'Spotify.exe', 'iTunesHelper.exe', 'Telegram.exe',
  'TabTip.exe', 'SystemSettings.exe', 'CalculatorApp.exe',
  'Video.UI.exe', 'Music.UI.exe', 'MicrosoftEdgeUpdate.exe',
  'GoogleUpdate.exe', 'jusched.exe', 'AdobeARM.exe'
]

let savedState: GameModeState | null = null

/** Get current active power plan GUID */
async function getActivePowerGuid(): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "(powercfg /getactivescheme) -replace \'.*GUID:\\s*\',\'\' -replace \'\\s.*\',\'\'"',
      { timeout: 5000 }
    )
    const guid = stdout.trim()
    return guid.length > 10 ? guid : null
  } catch { return null }
}

/** Kill non-essential background processes */
async function killBackgroundProcesses(): Promise<{ killed: string[]; freedMB: number }> {
  const killed: string[] = []
  let freedMB = 0

  /* Get memory before */
  let memBefore = 0
  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024)"',
      { timeout: 5000 }
    )
    memBefore = parseInt(stdout.trim()) || 0
  } catch {}

  for (const proc of KILLABLE_PROCESSES) {
    try {
      await execAsync(`taskkill /IM "${proc}" /F 2>nul`, { timeout: 3000 })
      killed.push(proc.replace('.exe', ''))
    } catch {
      /* Process not running — that's fine */
    }
  }

  /* Trim working sets of remaining processes */
  try {
    await execAsync(
      'powershell -NoProfile -Command "Get-Process | Where-Object { $_.WorkingSet64 -gt 100MB } | ForEach-Object { $_.MinWorkingSet = [IntPtr]::new(1) }"',
      { timeout: 10000 }
    )
  } catch {}

  /* Get memory after */
  try {
    await new Promise(r => setTimeout(r, 1000))
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024)"',
      { timeout: 5000 }
    )
    const memAfter = parseInt(stdout.trim()) || 0
    freedMB = Math.max(0, memAfter - memBefore)
  } catch {}

  return { killed, freedMB }
}

/** Activate Game Mode */
export async function activateGameMode(): Promise<GameModeState> {
  /* Save current power plan */
  const previousGuid = await getActivePowerGuid()

  /* Switch to High Performance (or Ultimate Performance if available) */
  try {
    /* Try Ultimate Performance first (may not exist on all systems) */
    await execAsync(
      'powercfg /setactive e9a42b02-d5df-448d-aa00-03f14749eb61',
      { timeout: 5000 }
    ).catch(() =>
      /* Fallback to High Performance */
      execAsync(
        'powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
        { timeout: 5000 }
      )
    )
  } catch {}

  /* Disable Focus Assist (turn on Do Not Disturb) */
  try {
    await execAsync(
      'powershell -NoProfile -Command "New-ItemProperty -Path \'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\' -Name \'NOC_GLOBAL_SETTING_TOASTS_ENABLED\' -Value 0 -PropertyType DWORD -Force"',
      { timeout: 5000 }
    )
  } catch {}

  /* Kill background processes */
  const { killed, freedMB } = await killBackgroundProcesses()

  /* Disable Windows Game Bar overlay to reduce overhead */
  try {
    await execAsync(
      'powershell -NoProfile -Command "New-ItemProperty -Path \'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR\' -Name \'AppCaptureEnabled\' -Value 0 -PropertyType DWORD -Force"',
      { timeout: 5000 }
    )
  } catch {}

  savedState = {
    active: true,
    killedProcesses: killed,
    previousPowerGuid: previousGuid,
    freedMB
  }

  return savedState
}

/** Deactivate Game Mode — restore previous settings */
export async function deactivateGameMode(): Promise<{ success: boolean; message: string }> {
  /* Restore previous power plan */
  if (savedState?.previousPowerGuid) {
    try {
      await execAsync(
        `powercfg /setactive ${savedState.previousPowerGuid}`,
        { timeout: 5000 }
      )
    } catch {}
  }

  /* Re-enable notifications */
  try {
    await execAsync(
      'powershell -NoProfile -Command "New-ItemProperty -Path \'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\' -Name \'NOC_GLOBAL_SETTING_TOASTS_ENABLED\' -Value 1 -PropertyType DWORD -Force"',
      { timeout: 5000 }
    )
  } catch {}

  /* Re-enable Game Bar */
  try {
    await execAsync(
      'powershell -NoProfile -Command "New-ItemProperty -Path \'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR\' -Name \'AppCaptureEnabled\' -Value 1 -PropertyType DWORD -Force"',
      { timeout: 5000 }
    )
  } catch {}

  savedState = null
  return { success: true, message: 'Game Mode deactivated' }
}

/** Get current game mode state */
export function getGameModeStatus(): { active: boolean; killedProcesses: string[]; freedMB: number } {
  return {
    active: savedState?.active ?? false,
    killedProcesses: savedState?.killedProcesses ?? [],
    freedMB: savedState?.freedMB ?? 0
  }
}
