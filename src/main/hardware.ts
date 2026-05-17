/**
 * Hardware Monitoring Service
 * Uses systeminformation + nvidia-smi + TempMonitor.exe (LibreHardwareMonitor daemon)
 */
import si from 'systeminformation'
import { exec, spawn, ChildProcess } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

const execAsync = promisify(exec)

/** Whether persistent PowerShell session is active (perf optimization) */
let psSessionActive = false

/** Flag to avoid repeated PawnIO install attempts */
let pawnIOInstallAttempted = false

/** Check if PawnIO driver is installed */
function isPawnIOInstalled(): boolean {
  return fs.existsSync('C:\\Program Files\\PawnIO\\PawnIOLib.dll')
}

/** Resolve path to bundled PawnIO_setup.exe */
function getPawnIOSetupPath(): string {
  const prodPath = path.join(process.resourcesPath || '', 'bin', 'PawnIO_setup.exe')
  if (fs.existsSync(prodPath)) return prodPath
  const devPath = path.join(__dirname, '..', '..', 'resources', 'bin', 'PawnIO_setup.exe')
  if (fs.existsSync(devPath)) return devPath
  return ''
}

/** Auto-install PawnIO signed driver (replaces blocked WinRing0) */
async function ensurePawnIO(): Promise<boolean> {
  if (pawnIOInstallAttempted) return isPawnIOInstalled()
  pawnIOInstallAttempted = true

  if (isPawnIOInstalled()) {
    console.log('[PawnIO] Already installed ✓')
    return true
  }

  const setupPath = getPawnIOSetupPath()
  if (!setupPath) {
    console.warn('[PawnIO] Setup exe not found in resources')
    return false
  }

  try {
    console.log('[PawnIO] Installing signed driver from:', setupPath)
    /* PawnIO installer supports /S for silent mode */
    await execAsync(`"${setupPath}" /S`, { timeout: 30000 })
    /* Wait for driver to register */
    await new Promise(r => setTimeout(r, 2000))
    const installed = isPawnIOInstalled()
    console.log(`[PawnIO] Installation ${installed ? 'SUCCESS ✓' : 'FAILED'}`)
    return installed
  } catch (err) {
    console.error('[PawnIO] Installation error:', err)
    return false
  }
}

/** Virtual GPU adapters to filter out */
const VIRTUAL_GPU_KEYWORDS = [
  'parsec', 'sudomaker', 'microsoft basic', 'virtual', 'remote',
  'rdp', 'vnc', 'citrix', 'vmware', 'qemu', 'hyper-v'
]

function isVirtualGpu(model: string): boolean {
  const lower = (model || '').toLowerCase()
  return VIRTUAL_GPU_KEYWORDS.some(k => lower.includes(k))
}

/** Resolve path to TempMonitor.exe */
function getTempMonitorPath(): string {
  /* In production: resources/bin/TempMonitor.exe */
  const prodPath = path.join(process.resourcesPath || '', 'bin', 'TempMonitor.exe')
  if (fs.existsSync(prodPath)) return prodPath

  /* In dev: relative to source */
  const devPath = path.join(__dirname, '..', '..', 'src', 'main', 'TempMonitor', 'publish', 'TempMonitor.exe')
  if (fs.existsSync(devPath)) return devPath

  /* Fallback: try resources dir next to app */
  const altPath = path.join(__dirname, '..', '..', 'resources', 'bin', 'TempMonitor.exe')
  if (fs.existsSync(altPath)) return altPath

  return ''
}

// ════════════════════════════════════════════════════════════════
//  TempMonitor Daemon — persistent process for fan monitoring + control
// ════════════════════════════════════════════════════════════════

let daemonProcess: ChildProcess | null = null
let daemonReady = false
let daemonRestartTimer: ReturnType<typeof setTimeout> | null = null

/** Latest data snapshot from daemon */
let daemonData: any = null
let daemonDataTs = 0

/** Pending response resolvers for daemon commands */
let pendingResolvers: ((data: any) => void)[] = []

/** Buffer for partial JSON lines from stdout */
let stdoutBuffer = ''

/** Track whether PawnIO was already attempted */
let pawnIOAttempted = false

/** Start TempMonitor daemon process */
export function startTempMonitorDaemon(): void {
  if (daemonProcess) return

  const exePath = getTempMonitorPath()
  if (!exePath) {
    console.warn('[Daemon] No TempMonitor.exe found')
    return
  }

  console.log('[Daemon] Starting TempMonitor daemon:', exePath)
  daemonProcess = spawn(exePath, ['--daemon'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  })

  stdoutBuffer = ''

  daemonProcess.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() || '' // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const msg = JSON.parse(trimmed)
        handleDaemonMessage(msg)
      } catch (e) {
        console.warn('[Daemon] Invalid JSON:', trimmed.substring(0, 100))
      }
    }
  })

  daemonProcess.stderr?.on('data', (chunk: Buffer) => {
    console.warn('[Daemon] stderr:', chunk.toString().trim())
  })

  daemonProcess.on('exit', (code) => {
    console.warn(`[Daemon] Process exited with code ${code}`)
    daemonProcess = null
    daemonReady = false
    // Auto-restart after 3 seconds (unless we're shutting down)
    if (!app.isQuitting) {
      daemonRestartTimer = setTimeout(() => {
        console.log('[Daemon] Auto-restarting...')
        startTempMonitorDaemon()
      }, 3000)
    }
  })

  daemonProcess.on('error', (err) => {
    console.error('[Daemon] Spawn error:', err)
    daemonProcess = null
    daemonReady = false
  })
}

/** Handle incoming message from daemon */
function handleDaemonMessage(msg: any): void {
  if (msg.type === 'ready') {
    daemonReady = true
    console.log(`[Daemon] Ready (admin: ${msg.isAdmin})`)
    // Attempt PawnIO install if not admin and not tried yet
    if (!msg.isAdmin && !pawnIOAttempted) {
      pawnIOAttempted = true
      ensurePawnIO().then(installed => {
        if (installed) {
          console.log('[Daemon] PawnIO installed, restarting daemon...')
          stopTempMonitorDaemon()
          setTimeout(() => startTempMonitorDaemon(), 1000)
        }
      })
    }
    return
  }

  if (msg.type === 'data') {
    daemonData = msg
    daemonDataTs = Date.now()
  }

  // Resolve any pending promises
  if (pendingResolvers.length > 0) {
    const resolver = pendingResolvers.shift()!
    resolver(msg)
  }
}

/** Send a JSON command to daemon and wait for response */
function sendDaemonCommand(cmd: object, timeoutMs = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!daemonProcess || !daemonReady) {
      reject(new Error('Daemon not ready'))
      return
    }

    const timer = setTimeout(() => {
      const idx = pendingResolvers.indexOf(resolve)
      if (idx >= 0) pendingResolvers.splice(idx, 1)
      reject(new Error('Daemon command timeout'))
    }, timeoutMs)

    pendingResolvers.push((data) => {
      clearTimeout(timer)
      resolve(data)
    })

    daemonProcess.stdin?.write(JSON.stringify(cmd) + '\n')
  })
}

/** Stop TempMonitor daemon gracefully */
export async function stopTempMonitorDaemon(): Promise<void> {
  if (daemonRestartTimer) {
    clearTimeout(daemonRestartTimer)
    daemonRestartTimer = null
  }
  if (!daemonProcess) return

  try {
    // Reset all fans to BIOS then exit
    daemonProcess.stdin?.write(JSON.stringify({ cmd: 'set-all-default' }) + '\n')
    await new Promise(r => setTimeout(r, 200))
    daemonProcess.stdin?.write(JSON.stringify({ cmd: 'exit' }) + '\n')
    await new Promise(r => setTimeout(r, 500))
  } catch { /* process might be dead */ }

  if (daemonProcess) {
    try { daemonProcess.kill() } catch { }
    daemonProcess = null
  }
  daemonReady = false
}

/** Request fresh data from daemon — with retry + one-shot fallback */
async function getDaemonData(): Promise<any> {
  // If we have fresh data (< 2s old), return it
  if (daemonData && (Date.now() - daemonDataTs) < 2000) {
    return daemonData
  }

  // Ensure daemon is started
  if (!daemonProcess) {
    startTempMonitorDaemon()
  }

  // Wait for daemon to become ready (up to 10 seconds, polling every 500ms)
  if (!daemonReady) {
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500))
      if (daemonReady) break
    }
  }

  // If daemon IS ready, get data from it
  if (daemonReady) {
    try {
      const data = await sendDaemonCommand({ cmd: 'get-data' }, 8000)
      return data
    } catch (err) {
      console.warn('[Daemon] get-data failed:', err)
      if (daemonData) return daemonData // Return stale if available
    }
  }

  // Fallback: one-shot exec (same as old behavior) while daemon is still booting
  console.log('[Daemon] Not ready yet, using one-shot fallback')
  return getOneShotData()
}

/** One-shot fallback — run TempMonitor.exe without daemon flag for immediate data */
async function getOneShotData(): Promise<any> {
  const exePath = getTempMonitorPath()
  if (!exePath) return null

  try {
    const { stdout } = await execAsync(`"${exePath}"`, { timeout: 15000 })
    const data = JSON.parse(stdout.trim())
    // Convert one-shot format to daemon format for compatibility
    const pkg = data.package != null ? Math.round(data.package) : null
    const cores = (data.cores || []).filter((c: any) => c != null).map((c: number) => Math.round(c))
    const fans = (data.fans || []).map((f: any) => ({
      name: f.name || 'Fan',
      hw: f.hardware || '',
      rpm: Math.round(f.rpm || 0),
      id: '',
      control: null,
      mode: 'default',
      min: 0,
      max: 100,
      canControl: false
    }))

    return {
      type: 'data',
      cpu: { name: data.name, package: pkg, cores, clocks: [], power: null },
      gpu: {},
      fans,
      temps: []
    }
  } catch (err) {
    console.error('[OneShot] TempMonitor error:', err)
    return null
  }
}

// ─── Fan Control API (exported for IPC handlers) ───────────────

/** Set a specific fan to manual speed (0-100%) */
export async function setFanSpeed(id: string, value: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await sendDaemonCommand({ cmd: 'set-fan', id, value: Math.max(20, Math.min(100, value)) })
    return { ok: result.type === 'ok' }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

/** Reset a specific fan to BIOS/Auto control */
export async function resetFan(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await sendDaemonCommand({ cmd: 'set-fan-default', id })
    return { ok: result.type === 'ok' }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

/** Reset ALL fans to BIOS/Auto control */
export async function resetAllFans(): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await sendDaemonCommand({ cmd: 'set-all-default' })
    return { ok: result.type === 'ok' }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

/** Get fan control data (fans + temps + clocks) from daemon */
export async function getFanControlData(): Promise<any> {
  const data = await getDaemonData()
  if (!data) return { fans: [], temps: [], cpu: {}, gpu: {} }
  return {
    fans: data.fans || [],
    temps: data.temps || [],
    cpu: data.cpu || {},
    gpu: data.gpu || {}
  }
}

// Register cleanup on app quit
app.on('before-quit', () => {
  (app as any).isQuitting = true
  stopTempMonitorDaemon()
})
app.on('will-quit', () => {
  stopTempMonitorDaemon()
})

/** Fallback CPU temp via PowerShell WMI — tries multiple methods */
async function getCpuTempWmi(): Promise<number | null> {
  /* Method 1: MSAcpi_ThermalZoneTemperature */
  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "Get-CimInstance MSAcpi_ThermalZoneTemperature -Namespace root/wmi -ErrorAction Stop | Select-Object -First 1 -ExpandProperty CurrentTemperature"',
      { timeout: 4000 }
    )
    const raw = parseInt(stdout.trim(), 10)
    if (!isNaN(raw) && raw > 0) {
      const temp = Math.round((raw - 2732) / 10)
      if (temp > 0 && temp < 120) return temp
    }
  } catch { /* Not available */ }

  /* Method 2: OpenHardwareMonitor WMI */
  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "Get-CimInstance -Namespace root/OpenHardwareMonitor -ClassName Sensor -ErrorAction Stop | Where-Object { $_.SensorType -eq \'Temperature\' -and $_.Name -like \'*CPU*Package*\' } | Select-Object -First 1 -ExpandProperty Value"',
      { timeout: 4000 }
    )
    const val = parseFloat(stdout.trim())
    if (!isNaN(val) && val > 0 && val < 120) return Math.round(val)
  } catch { /* OHM not running */ }

  /* Method 3: LibreHardwareMonitor WMI namespace */
  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "Get-CimInstance -Namespace root/LibreHardwareMonitor -ClassName Sensor -ErrorAction Stop | Where-Object { $_.SensorType -eq \'Temperature\' -and $_.Name -like \'*CPU*Package*\' } | Select-Object -First 1 -ExpandProperty Value"',
      { timeout: 4000 }
    )
    const val = parseFloat(stdout.trim())
    if (!isNaN(val) && val > 0 && val < 120) return Math.round(val)
  } catch { /* LibreHWM not running */ }

  return null
}

export interface HardwareData {
  cpu: {
    temperature: number | null
    temperatureMax: number | null
    cores: number[]
    chipset: number | null
    load: number
    speed: number
    speedMin: number
    speedMax: number
    brand: string
    cores_count: number
    threads: number
  }
  gpu: {
    model: string
    vendor: string
    temperature: number | null
    temperatureMemory: number | null
    utilizationGpu: number | null
    utilizationMemory: number | null
    memoryTotal: number | null
    memoryUsed: number | null
    memoryFree: number | null
    fanSpeed: number | null
    clockCore: number | null
    clockMemory: number | null
    powerDraw: number | null
    vram: number
  }[]
  memory: {
    total: number
    used: number
    free: number
    active: number
    available: number
    swapTotal: number
    swapUsed: number
    usage: number
  }
  disks: {
    name: string
    type: string
    size: number
    used: number
    available: number
    usage: number
    mount: string
    temperature: number | null
  }[]
  fans: {
    name: string
    rpm: number
  }[]
  battery: {
    hasBattery: boolean
    percent: number
    isCharging: boolean
    timeRemaining: number | null
  } | null
  network: {
    rx_sec: number
    tx_sec: number
  }
  uptime: number
  timestamp: number
}

let pollingInterval: ReturnType<typeof setInterval> | null = null

// ═══════════════════════════════════════════════════════════════
//  PERFORMANCE: Static & slow-changing data caches
//  Static data (CPU brand, GPU model) queried once at startup.
//  Slow data (disks, battery) refreshed every 30s, not every 2s.
// ═══════════════════════════════════════════════════════════════

/** Static CPU info — brand, cores, threads never change */
let cachedCpuInfo: { brand: string; cores: number; physicalCores: number } | null = null

/** Static GPU controllers list — model/vendor never change */
let cachedGpuControllers: any[] | null = null

/** Whether device has a battery (checked once) */
let cachedHasBattery: boolean | null = null

/** Slow-tick data: fsSize, diskLayout, diskTemps, battery — refreshed every 30s */
let slowCache: {
  fsData: any[]
  diskTemps: Map<string, number>
  battery: any | null
  lastUpdate: number
} = { fsData: [], diskTemps: new Map(), battery: null, lastUpdate: 0 }

const SLOW_TICK_INTERVAL = 30000 /* 30 seconds */

/** Refresh slow-tick data if stale */
async function refreshSlowCache(): Promise<void> {
  const now = Date.now()
  if (now - slowCache.lastUpdate < SLOW_TICK_INTERVAL) return

  const [fsData, battery, diskLayout] = await Promise.all([
    si.fsSize().catch(() => []),
    cachedHasBattery !== false ? si.battery().catch(() => null) : Promise.resolve(null),
    si.diskLayout().catch(() => [])
  ])

  /* Build disk temperature map from diskLayout SMART data (no duplicate call!) */
  const diskTemps = new Map<string, number>()
  for (const disk of diskLayout) {
    if (disk.temperature !== null && disk.temperature > 0) {
      diskTemps.set(disk.name || disk.device, disk.temperature)
    }
  }

  /* Cache battery presence for future ticks */
  if (cachedHasBattery === null && battery) {
    cachedHasBattery = (battery as any).hasBattery === true
  }

  slowCache = { fsData, diskTemps, battery, lastUpdate: now }
}

/** Try to get NVIDIA GPU data via nvidia-smi */
async function getNvidiaSmiData(): Promise<{
  temperature: number | null
  memoryTemp: number | null
  fanSpeed: number | null
  powerDraw: number | null
  clockCore: number | null
  clockMemory: number | null
  utilizationGpu: number | null
  utilizationMemory: number | null
  memoryUsed: number | null
  memoryTotal: number | null
} | null> {
  try {
    const { stdout } = await execAsync(
      'nvidia-smi --query-gpu=temperature.gpu,temperature.memory,fan.speed,power.draw,clocks.current.graphics,clocks.current.memory,utilization.gpu,utilization.memory,memory.used,memory.total --format=csv,noheader,nounits',
      { timeout: 5000 }
    )
    const parts = stdout.trim().split(',').map(s => s.trim())
    if (parts.length >= 10) {
      return {
        temperature: parseFloat(parts[0]) || null,
        memoryTemp: parseFloat(parts[1]) || null,
        fanSpeed: parseFloat(parts[2]) || null,
        powerDraw: parseFloat(parts[3]) || null,
        clockCore: parseFloat(parts[4]) || null,
        clockMemory: parseFloat(parts[5]) || null,
        utilizationGpu: parseFloat(parts[6]) || null,
        utilizationMemory: parseFloat(parts[7]) || null,
        memoryUsed: parseFloat(parts[8]) || null,
        memoryTotal: parseFloat(parts[9]) || null
      }
    }
  } catch {
    /* nvidia-smi not available */
  }
  return null
}

/** Get disk temperatures — now uses slowCache, no separate si.diskLayout() call */
function getCachedDiskTemperatures(): Map<string, number> {
  return slowCache.diskTemps
}

/** Collect detailed disk info — CrystalDiskInfo-style */
export async function getDetailedDiskInfo(): Promise<any[]> {
  try {
    /* Gather all data sources in parallel */
    const [layout, fsData, blockDevs, reliabilityRaw, physicalDiskRaw] = await Promise.all([
      si.diskLayout().catch(() => []),
      si.fsSize().catch(() => []),
      si.blockDevices().catch(() => []),
      /* PowerShell: StorageReliabilityCounter for PowerOnHours, Wear, errors */
      execAsync(
        'powershell -NoProfile -Command "Get-PhysicalDisk | ForEach-Object { $r = $_ | Get-StorageReliabilityCounter; [PSCustomObject]@{ FriendlyName=$_.FriendlyName; Temperature=$r.Temperature; PowerOnHours=$r.PowerOnHours; Wear=$r.Wear; ReadErrorsTotal=$r.ReadErrorsTotal; WriteErrorsTotal=$r.WriteErrorsTotal; ReadLatencyMax=$r.ReadLatencyMax; WriteLatencyMax=$r.WriteLatencyMax } } | ConvertTo-Json -Compress"',
        { timeout: 15000 }
      ).then(r => {
        try {
          const parsed = JSON.parse(r.stdout.trim())
          return Array.isArray(parsed) ? parsed : [parsed]
        } catch { return [] }
      }).catch(() => []),
      /* PowerShell: PhysicalDisk for MediaType, BusType, HealthStatus */
      execAsync(
        'powershell -NoProfile -Command "Get-PhysicalDisk | Select-Object FriendlyName, MediaType, BusType, HealthStatus, OperationalStatus, Size, FirmwareVersion, SerialNumber, Model | ConvertTo-Json -Compress"',
        { timeout: 10000 }
      ).then(r => {
        try {
          const parsed = JSON.parse(r.stdout.trim())
          return Array.isArray(parsed) ? parsed : [parsed]
        } catch { return [] }
      }).catch(() => [])
    ])

    /* Build result for each physical disk from diskLayout */
    const result = layout.map((disk: any, idx: number) => {
      /* Match with PowerShell data by name similarity */
      const diskName = (disk.name || disk.device || '').toLowerCase()
      const reliability = reliabilityRaw.find((r: any) =>
        diskName.includes((r.FriendlyName || '').toLowerCase()) ||
        (r.FriendlyName || '').toLowerCase().includes(diskName.split(' ').slice(0, 2).join(' '))
      ) || reliabilityRaw[idx] || {}
      const physical = physicalDiskRaw.find((p: any) =>
        diskName.includes((p.FriendlyName || '').toLowerCase()) ||
        (p.FriendlyName || '').toLowerCase().includes(diskName.split(' ').slice(0, 2).join(' '))
      ) || physicalDiskRaw[idx] || {}

      /* Match partitions from fsSize */
      const partitions = Array.isArray(fsData)
        ? fsData.filter((fs: any) => {
            /* Match by disk device index — heuristic: disk index maps to partition set */
            return true /* Include all partitions, we'll filter later */
          }).map((fs: any) => ({
            mount: fs.mount,
            type: fs.type,
            size: fs.size,
            used: fs.used,
            available: fs.available,
            usage: fs.use || 0
          }))
        : []

      /* Determine health score based on available data */
      const wear = reliability.Wear ?? null
      const powerOnHours = reliability.PowerOnHours ?? null
      const readErrors = reliability.ReadErrorsTotal ?? 0
      const writeErrors = reliability.WriteErrorsTotal ?? 0
      const smartStatus = disk.smartStatus || physical.HealthStatus || 'Unknown'
      const temperature = disk.temperature || reliability.Temperature || null

      let healthPct = 100
      if (wear !== null && wear !== undefined) {
        healthPct = Math.max(0, 100 - wear)
      }
      if (readErrors > 0 || writeErrors > 0) {
        healthPct = Math.min(healthPct, 70)
      }
      if (smartStatus && typeof smartStatus === 'string' &&
          !['ok', 'healthy', 'good'].includes(smartStatus.toLowerCase())) {
        healthPct = Math.min(healthPct, 50)
      }

      return {
        /* Identity */
        name: disk.name || physical.FriendlyName || `Disk ${idx}`,
        model: disk.name || physical.Model || 'Unknown',
        vendor: disk.vendor || '',
        serialNumber: disk.serialNum || physical.SerialNumber || '',
        firmwareRevision: disk.firmwareRevision || physical.FirmwareVersion || '',

        /* Type & Interface */
        type: disk.type || physical.MediaType || 'Unknown', /* SSD, NVMe, HD */
        interfaceType: disk.interfaceType || physical.BusType || '', /* SATA, PCIe, NVMe */
        size: disk.size || physical.Size || 0,

        /* Health */
        smartStatus: smartStatus,
        healthPct: healthPct,
        temperature: temperature,

        /* SMART / Reliability */
        powerOnHours: powerOnHours,
        wear: wear,
        readErrors: readErrors,
        writeErrors: writeErrors,
        readLatencyMax: reliability.ReadLatencyMax ?? null,
        writeLatencyMax: reliability.WriteLatencyMax ?? null,

        /* Partitions */
        partitions: partitions,

        /* Extra geometry (Windows) */
        bytesPerSector: disk.bytesPerSector || null,
        totalSectors: disk.totalSectors || null,
        smartData: disk.smartData || null
      }
    })

    /* If diskLayout is empty, build from PowerShell physicalDisk only */
    if (result.length === 0 && physicalDiskRaw.length > 0) {
      for (const p of physicalDiskRaw) {
        const rel = reliabilityRaw.find((r: any) => r.FriendlyName === p.FriendlyName) || {}
        const wear = rel.Wear ?? null
        let healthPct = 100
        if (wear !== null) healthPct = Math.max(0, 100 - wear)

        result.push({
          name: p.FriendlyName || p.Model || 'Unknown',
          model: p.Model || p.FriendlyName || 'Unknown',
          vendor: '',
          serialNumber: p.SerialNumber || '',
          firmwareRevision: p.FirmwareVersion || '',
          type: p.MediaType || 'Unknown',
          interfaceType: p.BusType || '',
          size: p.Size || 0,
          smartStatus: p.HealthStatus || 'Unknown',
          healthPct,
          temperature: rel.Temperature ?? null,
          powerOnHours: rel.PowerOnHours ?? null,
          wear,
          readErrors: rel.ReadErrorsTotal ?? 0,
          writeErrors: rel.WriteErrorsTotal ?? 0,
          readLatencyMax: rel.ReadLatencyMax ?? null,
          writeLatencyMax: rel.WriteLatencyMax ?? null,
          partitions: Array.isArray(fsData)
            ? fsData.map((fs: any) => ({ mount: fs.mount, type: fs.type, size: fs.size, used: fs.used, available: fs.available, usage: fs.use || 0 }))
            : [],
          bytesPerSector: null,
          totalSectors: null,
          smartData: null
        })
      }
    }

    return result
  } catch (err) {
    console.error('[DiskInfo] Error:', err)
    return []
  }
}

/** Collect full hardware snapshot
 *  PERFORMANCE OPTIMIZED:
 *  - Static data (CPU brand, GPU model) cached once at startup
 *  - Slow data (disks, battery) refreshed every 30s via slowCache
 *  - Fast data (temps, load, RAM, network) refreshed every tick (2s)
 */
export async function getHardwareSnapshot(): Promise<HardwareData> {
  /* ── Static data: query once, cache forever ── */
  if (!cachedCpuInfo) {
    cachedCpuInfo = await si.cpu().catch(() => ({ brand: 'N/A', cores: 0, physicalCores: 0 })) as any
  }
  if (!cachedGpuControllers) {
    const gfx = await si.graphics().catch(() => ({ controllers: [] }))
    cachedGpuControllers = gfx.controllers.filter((ctrl: any) => !isVirtualGpu(ctrl.model))
  }

  /* ── Slow data: refresh every 30s ── */
  await refreshSlowCache()

  /* ── Fast data: query every tick (2s) ── */
  const [cpuTemp, cpuLoad, cpuSpeed, mem, networkStats] =
    await Promise.all([
      si.cpuTemperature().catch(() => ({ main: null, max: null, cores: [], chipset: null })),
      si.currentLoad().catch(() => ({ currentLoad: 0 })),
      si.cpuCurrentSpeed().catch(() => ({ avg: 0, min: 0, max: 0 })),
      si.mem().catch(() => ({ total: 0, used: 0, free: 0, active: 0, available: 0, swaptotal: 0, swapused: 0 })),
      si.networkStats().catch(() => [])
    ])

  /* GPU dynamic data via nvidia-smi (fast, single exec) */
  const nvidiaSmi = await getNvidiaSmiData()
  const diskTemps = getCachedDiskTemperatures()

  /* Use cached static GPU controllers, enrich with dynamic nvidia-smi data */
  const gpuData = (cachedGpuControllers || []).map((ctrl: any) => {
    const isNvidia = (ctrl.vendor || '').toLowerCase().includes('nvidia')
    return {
      model: ctrl.model || 'Unknown GPU',
      vendor: ctrl.vendor || 'Unknown',
      temperature: ctrl.temperatureGpu ?? (isNvidia ? nvidiaSmi?.temperature : null) ?? null,
      temperatureMemory: (isNvidia ? nvidiaSmi?.memoryTemp : null) ?? null,
      utilizationGpu: ctrl.utilizationGpu ?? (isNvidia ? nvidiaSmi?.utilizationGpu : null) ?? null,
      utilizationMemory: (isNvidia ? nvidiaSmi?.utilizationMemory : null) ?? null,
      memoryTotal: ctrl.memoryTotal ?? (isNvidia ? nvidiaSmi?.memoryTotal : null) ?? null,
      memoryUsed: ctrl.memoryUsed ?? (isNvidia ? nvidiaSmi?.memoryUsed : null) ?? null,
      memoryFree: ctrl.memoryFree ?? null,
      fanSpeed: ctrl.fanSpeed ?? (isNvidia ? nvidiaSmi?.fanSpeed : null) ?? null,
      clockCore: ctrl.clockCore ?? (isNvidia ? nvidiaSmi?.clockCore : null) ?? null,
      clockMemory: ctrl.clockMemory ?? (isNvidia ? nvidiaSmi?.clockMemory : null) ?? null,
      powerDraw: (isNvidia ? nvidiaSmi?.powerDraw : null) ?? null,
      vram: ctrl.vram || 0
    }
  })

  /* Aggregate network stats */
  let rxSec = 0
  let txSec = 0
  if (Array.isArray(networkStats)) {
    for (const net of networkStats as any[]) {
      rxSec += net.rx_sec || 0
      txSec += net.tx_sec || 0
    }
  }

  /* CPU temperature fallback chain:
     1. systeminformation (built-in)
     2. TempMonitor daemon (LibreHardwareMonitorLib — needs admin)
     3. PowerShell WMI (MSAcpi / OHM / LibreHWM WMI namespaces) */
  let cpuTempMain = cpuTemp.main
  let cpuCores = cpuTemp.cores || []

  /* Always get data from daemon — needed for fans + CPU temp fallback */
  const daemonSnap = await getDaemonData()

  if (cpuTempMain === null || cpuTempMain === undefined) {
    if (daemonSnap?.cpu?.package != null) {
      cpuTempMain = Math.round(daemonSnap.cpu.package)
      if (daemonSnap.cpu.cores?.length > 0) {
        cpuCores = daemonSnap.cpu.cores.filter((c: any) => c != null).map((c: number) => Math.round(c))
      }
    } else {
      /* Last resort: WMI */
      cpuTempMain = await getCpuTempWmi()
    }
  }

  /* Build fans array from daemon data */
  const fansResult: { name: string; rpm: number }[] = (daemonSnap?.fans || []).map((f: any) => ({
    name: (f.name || 'Fan') + (f.hw ? ` (${f.hw})` : ''),
    rpm: f.rpm ?? 0
  }))

  /* Fallback: Add GPU fan speed from nvidia-smi if daemon has no fan data */
  if (fansResult.length === 0) {
    for (const gpu of gpuData) {
      if (gpu.fanSpeed !== null) {
        fansResult.push({ name: `GPU Fan (${gpu.model})`, rpm: gpu.fanSpeed })
      }
    }
  }

  /* Use cached static CPU info */
  const cpuInfo = cachedCpuInfo!

  /* Use slow-cached data */
  const fsData = slowCache.fsData
  const battery = slowCache.battery

  return {
    cpu: {
      temperature: cpuTempMain,
      temperatureMax: cpuTemp.max ?? null,
      cores: cpuCores,
      chipset: cpuTemp.chipset ?? null,
      load: (cpuLoad as any).currentLoad || 0,
      speed: cpuSpeed.avg || 0,
      speedMin: cpuSpeed.min || 0,
      speedMax: cpuSpeed.max || 0,
      brand: cpuInfo.brand || 'N/A',
      cores_count: (cpuInfo as any).physicalCores || cpuInfo.cores || 0,
      threads: cpuInfo.cores || 0
    },
    gpu: gpuData,
    memory: {
      total: mem.total,
      used: mem.used,
      free: mem.free,
      active: mem.active,
      available: mem.available,
      swapTotal: mem.swaptotal,
      swapUsed: mem.swapused,
      usage: mem.total > 0 ? Math.round((mem.active / mem.total) * 100) : 0
    },
    disks: Array.isArray(fsData) ? fsData.map((fs: any) => ({
      name: fs.fs || fs.mount,
      type: fs.type || 'unknown',
      size: fs.size,
      used: fs.used,
      available: fs.available,
      usage: fs.use || 0,
      mount: fs.mount,
      temperature: diskTemps.get(fs.fs) ?? null
    })) : [],
    fans: fansResult,
    battery: battery ? {
      hasBattery: (battery as any).hasBattery,
      percent: (battery as any).percent,
      isCharging: (battery as any).isCharging,
      timeRemaining: (battery as any).timeRemaining ?? null
    } : null,
    network: { rx_sec: rxSec, tx_sec: txSec },
    uptime: si.time().uptime || 0,
    timestamp: Date.now()
  }
}

/** Start polling hardware data at given interval */
export function startHardwarePolling(
  intervalMs: number,
  callback: (data: HardwareData) => void
): void {
  stopHardwarePolling()

  /* PERF: Start persistent PowerShell session (from SI docs).
     All subsequent si.* calls reuse this single session instead of
     spawning a new powershell.exe each time. */
  if (!psSessionActive) {
    try {
      si.powerShellStart()
      psSessionActive = true
      console.log('[Hardware] Persistent PowerShell session started ✓')
    } catch (err) {
      console.warn('[Hardware] Failed to start PS session:', err)
    }
  }

  const poll = async (): Promise<void> => {
    try {
      const data = await getHardwareSnapshot()
      callback(data)
    } catch {
      /* Silently skip failed polls */
    }
  }
  poll() /* Immediate first poll */
  pollingInterval = setInterval(poll, intervalMs)
}

/** Stop hardware polling */
export function stopHardwarePolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
  /* Release persistent PowerShell session */
  if (psSessionActive) {
    try {
      si.powerShellRelease()
      psSessionActive = false
      console.log('[Hardware] PowerShell session released')
    } catch { /* already released */ }
  }
}
