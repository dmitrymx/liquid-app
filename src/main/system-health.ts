/**
 * System Health Check Service
 * SFC, DISM, CHKDSK — elevated Windows integrity checks
 * All commands use chcp 65001 for correct UTF-8 output
 */
import { exec } from 'child_process'

export interface HealthCheckResult {
  type: string
  status: 'ok' | 'warning' | 'error' | 'running'
  messageKey: string
  details: string
  duration: number
}

type ProgressCb = (data: { type: string; percent: number; line: string }) => void

/** Wrap command with UTF-8 codepage */
function utf8Cmd(cmd: string): string {
  return `chcp 65001 >nul && ${cmd}`
}

/** Run a command with real-time line output */
function runElevated(cmd: string, type: string, onLine: ProgressCb, timeoutMs = 300000): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    let stdout = ''
    let lastPercent = 0

    const proc = exec(utf8Cmd(cmd), {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
      encoding: 'utf8'
    })

    proc.stdout?.on('data', (chunk: string) => {
      stdout += chunk
      const lines = chunk.split(/\r?\n/).filter(l => l.trim())
      for (const line of lines) {
        const pctMatch = line.match(/(\d+(?:\.\d+)?)\s*%/)
        if (pctMatch) {
          lastPercent = Math.min(parseFloat(pctMatch[1]), 99)
        }
        onLine({ type, percent: lastPercent, line: line.trim() })
      }
    })

    proc.stderr?.on('data', (chunk: string) => {
      stdout += chunk
      const lines = chunk.split(/\r?\n/).filter(l => l.trim())
      for (const line of lines) {
        onLine({ type, percent: lastPercent, line: `[ERR] ${line.trim()}` })
      }
    })

    proc.on('close', (code) => {
      const dur = Math.round((Date.now() - startTime) / 1000)
      onLine({ type, percent: 100, line: `✓ Done (exit ${code ?? 0}, ${dur}s)` })
      resolve({ stdout, code: code ?? 0 })
    })

    proc.on('error', (err) => {
      onLine({ type, percent: 100, line: `✗ Error: ${err.message}` })
      resolve({ stdout, code: 1 })
    })
  })
}

/** SFC /scannow — System File Checker */
export async function runSfc(onLine: ProgressCb): Promise<HealthCheckResult> {
  const start = Date.now()
  onLine({ type: 'sfc', percent: 0, line: 'Starting SFC /scannow ...' })

  const { stdout, code } = await runElevated(
    'powershell -NoProfile -Command "[Console]::OutputEncoding = [Text.Encoding]::UTF8; sfc /scannow"',
    'sfc', onLine, 600000
  )

  const lower = stdout.toLowerCase()
  let messageKey = 'sfc_ok'

  if (lower.includes('found corrupt') && lower.includes('successfully repaired')) {
    messageKey = 'sfc_repaired'
  } else if (lower.includes('found corrupt') && !lower.includes('successfully repaired')) {
    messageKey = 'sfc_corrupt'
  } else if (lower.includes('could not perform')) {
    messageKey = 'sfc_failed'
  } else if (code !== 0) {
    messageKey = 'sfc_error'
  }

  const status = messageKey === 'sfc_ok' ? 'ok' : messageKey === 'sfc_repaired' ? 'warning' : 'error'
  return { type: 'sfc', status, messageKey, details: stdout.trim(), duration: Date.now() - start }
}

/** DISM ScanHealth */
export async function runDismCheck(onLine: ProgressCb): Promise<HealthCheckResult> {
  const start = Date.now()
  onLine({ type: 'dism', percent: 0, line: 'Starting DISM ScanHealth ...' })

  const { stdout, code } = await runElevated(
    'powershell -NoProfile -Command "[Console]::OutputEncoding = [Text.Encoding]::UTF8; DISM /Online /Cleanup-Image /ScanHealth"',
    'dism', onLine, 300000
  )

  const lower = stdout.toLowerCase()
  let messageKey = 'dism_ok'

  if (lower.includes('repairable')) {
    messageKey = 'dism_repairable'
  } else if (lower.includes('not repairable') || lower.includes('corrupted')) {
    messageKey = 'dism_corrupt'
  } else if (code !== 0) {
    messageKey = 'dism_error'
  }

  const status = messageKey === 'dism_ok' ? 'ok' : messageKey === 'dism_repairable' ? 'warning' : 'error'
  return { type: 'dism', status, messageKey, details: stdout.trim(), duration: Date.now() - start }
}

/** DISM RestoreHealth */
export async function runDismRepair(onLine: ProgressCb): Promise<HealthCheckResult> {
  const start = Date.now()
  onLine({ type: 'dism_repair', percent: 0, line: 'Starting DISM RestoreHealth ...' })

  const { stdout, code } = await runElevated(
    'powershell -NoProfile -Command "[Console]::OutputEncoding = [Text.Encoding]::UTF8; DISM /Online /Cleanup-Image /RestoreHealth"',
    'dism_repair', onLine, 600000
  )

  let messageKey = 'dism_repair_ok'
  if (stdout.toLowerCase().includes('error') || code !== 0) {
    messageKey = 'dism_repair_failed'
  }

  const status = messageKey === 'dism_repair_ok' ? 'ok' : 'error'
  return { type: 'dism_repair', status, messageKey, details: stdout.trim(), duration: Date.now() - start }
}

/** CHKDSK online scan */
export async function runChkdsk(onLine: ProgressCb): Promise<HealthCheckResult> {
  const start = Date.now()
  onLine({ type: 'chkdsk', percent: 0, line: 'Starting CHKDSK /scan ...' })

  const { stdout, code } = await runElevated(
    'powershell -NoProfile -Command "[Console]::OutputEncoding = [Text.Encoding]::UTF8; chkdsk C: /scan"',
    'chkdsk', onLine, 600000
  )

  const lower = stdout.toLowerCase()
  let messageKey = 'chkdsk_ok'

  if (lower.includes('found errors') || lower.includes('problems found')) {
    messageKey = 'chkdsk_errors'
  } else if (code !== 0 && !lower.includes('no problems')) {
    messageKey = 'chkdsk_warning'
  }

  const status = messageKey === 'chkdsk_ok' ? 'ok' : 'warning'
  return { type: 'chkdsk', status, messageKey, details: stdout.trim(), duration: Date.now() - start }
}
