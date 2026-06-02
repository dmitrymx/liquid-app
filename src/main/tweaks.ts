/**
 * System Tweaks Service - Telemetry, Hosts, Context Menu, UWP Debloater
 */
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const execAsync = promisify(exec)

async function runPowerShell(cmd: string): Promise<string> {
  const escapedCmd = cmd.replace(/"/g, '\\"')
  const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -Command "${escapedCmd}"`, {
    maxBuffer: 10 * 1024 * 1024
  })
  return stdout
}

async function getRegValue(key: string, valueName: string): Promise<number | string | null> {
  try {
    const { stdout } = await execAsync(`reg query "${key}" /v "${valueName}"`)
    const lines = stdout.split('\n')
    for (const line of lines) {
      if (line.trim().startsWith(valueName)) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 3) {
          const type = parts[1]
          const val = parts.slice(2).join(' ')
          if (type === 'REG_DWORD') {
            return parseInt(val, 16)
          }
          return val
        }
      }
    }
  } catch {
    // Key or value doesn't exist
  }
  return null
}

async function setRegValue(key: string, valueName: string, type: string, value: string | number): Promise<void> {
  await execAsync(`reg add "${key}" /f`)
  await execAsync(`reg add "${key}" /v "${valueName}" /t ${type} /d "${value}" /f`)
}

async function deleteRegValue(key: string, valueName: string): Promise<void> {
  try {
    await execAsync(`reg delete "${key}" /v "${valueName}" /f`)
  } catch {
    // Already deleted or doesn't exist
  }
}

/* ==================== TELEMETRY & PRIVACY ==================== */

const TELEMETRY_HOSTS = [
  'v10.events.data.microsoft.com',
  'settings-win.data.microsoft.com',
  'diagnostics.support.microsoft.com',
  'telemetry.microsoft.com',
  'telemetry.urs.microsoft.com',
  'watson.telemetry.microsoft.com',
  'sqm.telemetry.microsoft.com',
  'sqm.microsoft.com',
  'survey.watson.microsoft.com',
  'statsfe1.ws.microsoft.com',
  'statsfe2.ws.microsoft.com',
  'v20.events.data.microsoft.com',
  'telecommand.telemetry.microsoft.com',
  'sxt.cdn.skype.com',
  'i1.services.social.microsoft.com'
]

function getHostsFilePath(): string {
  return 'C:\\Windows\\System32\\drivers\\etc\\hosts'
}

export async function readHosts(): Promise<string> {
  const filePath = getHostsFilePath()
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8')
  }
  return ''
}

export async function writeHosts(content: string): Promise<void> {
  const filePath = getHostsFilePath()
  fs.writeFileSync(filePath, content, 'utf8')
}

export async function toggleTelemetryBlock(active: boolean): Promise<void> {
  let content = await readHosts()
  
  // Strip existing block
  const blockRegex = /#\s*\[LiquidApp Telemetry Block Start\][\s\S]*?#\s*\[LiquidApp Telemetry Block End\]\r?\n?/g
  content = content.replace(blockRegex, '')
  
  if (active) {
    const blockLines = [
      '',
      '# [LiquidApp Telemetry Block Start]',
      ...TELEMETRY_HOSTS.map(host => `0.0.0.0 ${host}`),
      '# [LiquidApp Telemetry Block End]',
      ''
    ].join('\r\n')
    content = content.trimEnd() + blockLines
  }
  
  await writeHosts(content)
}

export async function isTelemetryBlocked(): Promise<boolean> {
  const content = await readHosts()
  return content.includes('# [LiquidApp Telemetry Block Start]')
}

export async function getTelemetryStatus(): Promise<Record<string, boolean>> {
  const status: Record<string, boolean> = {}

  // 1. Telemetry
  const telemetryVal = await getRegValue('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry')
  status.telemetry = telemetryVal === 0

  // 2. Cortana
  const cortanaVal = await getRegValue('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'AllowCortana')
  status.cortana = cortanaVal === 0

  // 3. Advertising ID
  const advVal = await getRegValue('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', 'Enabled')
  status.advertisingId = advVal === 0

  // 4. Ink & Text Collection
  const inkVal = await getRegValue('HKCU\\Software\\Microsoft\\InputPersonalization', 'RestrictImplicitInkCollection')
  const textVal = await getRegValue('HKCU\\Software\\Microsoft\\InputPersonalization', 'RestrictImplicitTextCollection')
  status.inkCollection = inkVal === 1 && textVal === 1

  // 5. WER (Error Reporting)
  const werVal = await getRegValue('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', 'Disabled')
  status.werDisabled = werVal === 1

  // 6. Hosts file
  status.hostsBlocked = await isTelemetryBlocked()

  return status
}

export async function setTelemetryTweak(id: string, active: boolean): Promise<void> {
  switch (id) {
    case 'telemetry':
      if (active) {
        await setRegValue('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry', 'REG_DWORD', 0)
      } else {
        await deleteRegValue('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry')
      }
      break
    case 'cortana':
      if (active) {
        await setRegValue('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'AllowCortana', 'REG_DWORD', 0)
      } else {
        await deleteRegValue('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'AllowCortana')
      }
      break
    case 'advertisingId':
      if (active) {
        await setRegValue('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', 'Enabled', 'REG_DWORD', 0)
      } else {
        await deleteRegValue('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', 'Enabled')
      }
      break
    case 'inkCollection':
      if (active) {
        await setRegValue('HKCU\\Software\\Microsoft\\InputPersonalization', 'RestrictImplicitInkCollection', 'REG_DWORD', 1)
        await setRegValue('HKCU\\Software\\Microsoft\\InputPersonalization', 'RestrictImplicitTextCollection', 'REG_DWORD', 1)
      } else {
        await deleteRegValue('HKCU\\Software\\Microsoft\\InputPersonalization', 'RestrictImplicitInkCollection')
        await deleteRegValue('HKCU\\Software\\Microsoft\\InputPersonalization', 'RestrictImplicitTextCollection')
      }
      break
    case 'werDisabled':
      if (active) {
        await setRegValue('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', 'Disabled', 'REG_DWORD', 1)
      } else {
        await deleteRegValue('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', 'Disabled')
      }
      break
    case 'hostsBlocked':
      await toggleTelemetryBlock(active)
      break
  }
}

export async function rollbackTelemetry(): Promise<void> {
  await deleteRegValue('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry')
  await deleteRegValue('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'AllowCortana')
  await deleteRegValue('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', 'Enabled')
  await deleteRegValue('HKCU\\Software\\Microsoft\\InputPersonalization', 'RestrictImplicitInkCollection')
  await deleteRegValue('HKCU\\Software\\Microsoft\\InputPersonalization', 'RestrictImplicitTextCollection')
  await deleteRegValue('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', 'Disabled')
  await toggleTelemetryBlock(false)
}

/* ==================== CONTEXT MENU HANDLERS ==================== */

export interface ContextMenuItem {
  name: string
  keyName: string
  parentPath: string
  guid: string
  enabled: boolean
}

export async function getContextMenuItems(): Promise<ContextMenuItem[]> {
  const psScript = `
    $paths = @(
      "Registry::HKEY_CLASSES_ROOT\\*\\shellex\\ContextMenuHandlers",
      "Registry::HKEY_CLASSES_ROOT\\Directory\\Background\\shellex\\ContextMenuHandlers",
      "Registry::HKEY_CLASSES_ROOT\\Directory\\shellex\\ContextMenuHandlers",
      "Registry::HKEY_CLASSES_ROOT\\Folder\\shellex\\ContextMenuHandlers"
    )
    $results = @()
    foreach ($p in $paths) {
      if (Test-Path $p) {
        Get-ChildItem $p | ForEach-Object {
          $name = $_.PsChildName
          $enabled = $true
          if ($name.StartsWith("-")) {
            $enabled = $false
          }
          $val = (Get-ItemProperty $_.PsPath)."(default)"
          $friendlyName = $name
          $guid = $val
          if ($name -match '\\{[0-9a-fA-F-]+\\}') {
            $guid = $name
          }
          if ($guid -and $guid -match '\\{([0-9a-fA-F-]+)\\}') {
            $clsidKey = "Registry::HKEY_CLASSES_ROOT\\CLSID\\$guid"
            if (Test-Path $clsidKey) {
              $clsidVal = (Get-ItemProperty $clsidKey)."(default)"
              if ($clsidVal) {
                $friendlyName = "$clsidVal ($name)"
              }
            }
          }
          $results += [PSCustomObject]@{
            name = $friendlyName
            keyName = $name
            parentPath = $p
            guid = $guid
            enabled = $enabled
          }
        }
      }
    }
    $results | ConvertTo-Json -Compress
  `
  try {
    const raw = await runPowerShell(psScript)
    if (!raw.trim()) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch (err) {
    console.error('[Tweaks] getContextMenuItems error:', err)
    return []
  }
}

export async function toggleContextMenuItem(parentPath: string, keyName: string, enabled: boolean): Promise<void> {
  const isCurrentlyDisabled = keyName.startsWith('-')
  if (enabled === !isCurrentlyDisabled) return // already in desired state

  const currentPath = `${parentPath}\\${keyName}`
  const newName = enabled 
    ? (keyName.startsWith('-') ? keyName.slice(1) : keyName) 
    : (keyName.startsWith('-') ? keyName : `-${keyName}`)

  const psScript = `Rename-Item -Path "${currentPath}" -NewName "${newName}" -Force`
  await runPowerShell(psScript)
}

/* ==================== WINDOWS DEBLOATER (UWP APPS) ==================== */

export interface UwpApp {
  name: string
  packageFullName: string
  publisherId: string
}

export async function listUwpApps(): Promise<UwpApp[]> {
  const psScript = `
    Get-AppxPackage | Where-Object { -not $_.IsFramework -and $_.NonRemovable -ne $true -and $_.InstallLocation -ne $null } | 
    Select-Object Name, PackageFullName, PublisherId | 
    ConvertTo-Json -Compress
  `
  try {
    const raw = await runPowerShell(psScript)
    if (!raw.trim()) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch (err) {
    console.error('[Tweaks] listUwpApps error:', err)
    return []
  }
}

export async function uninstallUwpApp(packageFullName: string): Promise<void> {
  const psScript = `Remove-AppxPackage -Package "${packageFullName}"`
  await runPowerShell(psScript)
}

export async function restoreDefaultUwpApps(): Promise<void> {
  const psScript = `Get-AppxPackage -AllUsers | Foreach {Add-AppxPackage -DisableDevelopmentMode -Register "$($_.InstallLocation)\\AppXManifest.xml" -ErrorAction SilentlyContinue}`
  await runPowerShell(psScript)
}
