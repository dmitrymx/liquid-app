/**
 * Utility functions for system operations
 */
import si from 'systeminformation'
import os from 'os'

export interface SystemInfo {
  os: {
    platform: string
    distro: string
    release: string
    arch: string
    hostname: string
  }
  cpu: {
    brand: string
    manufacturer: string
    speed: string
    cores: number
    physicalCores: number
  }
  memory: {
    total: number
  }
  gpu: {
    model: string
    vram: number
  }[]
  disks: {
    name: string
    size: number
    type: string
  }[]
  uptime: number
}

/** Get full system information */
export async function getFullSystemInfo(): Promise<SystemInfo> {
  const [osInfo, cpu, mem, graphics, diskLayout] = await Promise.all([
    si.osInfo().catch(() => ({ platform: os.platform(), distro: 'Unknown', release: 'Unknown', arch: os.arch(), hostname: os.hostname() })),
    si.cpu().catch(() => ({ brand: 'Unknown', manufacturer: 'Unknown', speed: '0', cores: 0, physicalCores: 0 })),
    si.mem().catch(() => ({ total: 0 })),
    si.graphics().catch(() => ({ controllers: [] })),
    si.diskLayout().catch(() => [])
  ])

  return {
    os: {
      platform: osInfo.platform,
      distro: osInfo.distro,
      release: osInfo.release,
      arch: osInfo.arch,
      hostname: osInfo.hostname
    },
    cpu: {
      brand: cpu.brand,
      manufacturer: cpu.manufacturer,
      speed: cpu.speed?.toString() || '0',
      cores: cpu.cores,
      physicalCores: (cpu as any).physicalCores || cpu.cores
    },
    memory: { total: mem.total },
    gpu: (graphics.controllers || []).map((c: any) => ({
      model: c.model || 'Unknown',
      vram: c.vram || 0
    })),
    disks: Array.isArray(diskLayout) ? diskLayout.map((d: any) => ({
      name: d.name || d.device || 'Unknown',
      size: d.size || 0,
      type: d.type || 'Unknown'
    })) : [],
    uptime: os.uptime()
  }
}
