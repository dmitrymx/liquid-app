/** Formatting utilities */

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`
}

export function formatTemp(temp: number | null): string {
  if (temp === null || temp === undefined || isNaN(temp)) return 'N/A'
  return `${Math.round(temp)}°C`
}

export function formatFreq(ghz: number): string {
  return `${ghz.toFixed(1)} GHz`
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}д ${h}ч ${m}м`
  if (h > 0) return `${h}ч ${m}м`
  return `${m}м`
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

export function getTempColor(temp: number | null): string {
  if (temp === null) return 'var(--outline)'
  if (temp < 50) return 'var(--status-normal)'
  if (temp < 75) return 'var(--status-warning)'
  return 'var(--status-critical)'
}

export function getLoadColor(percent: number): string {
  if (percent < 50) return 'var(--status-normal)'
  if (percent < 80) return 'var(--status-warning)'
  return 'var(--status-critical)'
}
