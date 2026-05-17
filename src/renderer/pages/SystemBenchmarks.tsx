/**
 * System Benchmarks Page
 * Based on Stitch mockup: 3 gauges + live execution log + run button
 */
import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '../lib/ipc'
import CircularGauge from '../components/CircularGauge'

interface LogEntry {
  time: string
  level: 'INFO' | 'EXEC' | 'DEBUG' | 'WARN' | 'DONE'
  message: string
}

const SystemBenchmarks: React.FC = () => {
  const { t, i18n } = useTranslation()
  const isRu = i18n.language === 'ru'

  /** Score rating helper */
  const getRating = (score: number, low: number, mid: number, high: number): string => {
    if (score >= high) return isRu ? '🟢 Отлично' : '🟢 Excellent'
    if (score >= mid) return isRu ? '🟡 Хорошо' : '🟡 Good'
    if (score >= low) return isRu ? '🟠 Средне' : '🟠 Average'
    return isRu ? '🔴 Слабо' : '🔴 Weak'
  }
  const [running, setRunning] = useState(false)
  const [cpuScore, setCpuScore] = useState<number | null>(null)
  const [ramScore, setRamScore] = useState<number | null>(null)
  const [diskScore, setDiskScore] = useState<number | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  const addLog = (level: LogEntry['level'], message: string) => {
    const now = new Date()
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`
    setLogs(prev => [...prev, { time, level, message }])
  }

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  const runAll = async () => {
    setRunning(true)
    setLogs([])
    setCpuScore(null)
    setRamScore(null)
    setDiskScore(null)

    const cleanup = ipc.onBenchmarkProgress((p: any) => {
      addLog('EXEC', p.message)
    })

    /* CPU */
    addLog('INFO', isRu ? 'Инициализация CPU теста...' : 'Initializing CPU test...')
    const cpuResult = await ipc.runBenchmark('cpu')
    if (cpuResult && !cpuResult.error) {
      setCpuScore(cpuResult.score)
      addLog('DONE', `CPU Score: ${cpuResult.score} pts (${cpuResult.duration}ms)`)
    } else {
      addLog('WARN', `CPU Error: ${cpuResult?.error || 'Unknown'}`)
    }

    /* RAM */
    addLog('INFO', isRu ? 'Инициализация RAM теста...' : 'Initializing RAM test...')
    const ramResult = await ipc.runBenchmark('ram')
    if (ramResult && !ramResult.error) {
      setRamScore(ramResult.score)
      addLog('DONE', `RAM Score: ${ramResult.score} pts — R: ${ramResult.details?.readBW} W: ${ramResult.details?.writeBW}`)
    } else {
      addLog('WARN', `RAM Error: ${ramResult?.error || 'Unknown'}`)
    }

    /* Disk */
    addLog('INFO', isRu ? 'Инициализация Disk I/O теста...' : 'Initializing Disk I/O test...')
    const diskResult = await ipc.runBenchmark('disk')
    if (diskResult && !diskResult.error) {
      setDiskScore(diskResult.score)
      addLog('DONE', `Disk Score: ${diskResult.score} MB/s — R: ${diskResult.details?.seqRead} W: ${diskResult.details?.seqWrite}`)
    } else {
      addLog('WARN', `Disk Error: ${diskResult?.error || 'Unknown'}`)
    }

    addLog('DONE', isRu ? 'Все тесты завершены ✓' : 'All tests complete ✓')
    cleanup()
    setRunning(false)
  }

  const levelColors: Record<string, string> = {
    INFO: 'var(--neon-cyan)',
    EXEC: 'var(--neon-teal)',
    DEBUG: 'var(--outline)',
    WARN: 'var(--status-warning)',
    DONE: 'var(--status-normal)'
  }

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1200 }}>
      <div className="page-header">
        <h1>{t('benchmarks.title')}</h1>
        <p>{t('benchmarks.subtitle')}</p>
      </div>

      {/* 3 Gauge Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'var(--gutter)',
        marginBottom: 'var(--gutter)'
      }}>
        <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <CircularGauge
            value={cpuScore !== null ? cpuScore.toString() : '—'}
            unit={cpuScore !== null ? 'pts' : ''}
            label="CPU"
            maxValue={20000}
            size={150}
          />
          <div style={{ fontSize: 12, color: 'var(--outline)', marginTop: 8, textAlign: 'center' }}>
            {cpuScore !== null ? getRating(cpuScore, 5000, 10000, 15000) : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 4, textAlign: 'center' }}>
            {isRu ? 'Простые числа + матрица 256×256' : 'Prime sieve + matrix 256×256'}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <CircularGauge
            value={ramScore !== null ? ramScore.toString() : '—'}
            unit={ramScore !== null ? 'pts' : ''}
            label="RAM"
            maxValue={5000}
            color="var(--neon-teal)"
            size={150}
          />
          <div style={{ fontSize: 12, color: 'var(--outline)', marginTop: 8, textAlign: 'center' }}>
            {ramScore !== null ? getRating(ramScore, 500, 1500, 3000) : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 4, textAlign: 'center' }}>
            {isRu ? 'Чтение/запись 640 MB блоками' : 'Read/write 640 MB blocks'}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <CircularGauge
            value={diskScore !== null ? diskScore.toString() : '—'}
            unit={diskScore !== null ? 'MB/s' : ''}
            label="Disk I/O"
            maxValue={5000}
            color="var(--neon-blue)"
            size={150}
          />
          <div style={{ fontSize: 12, color: 'var(--outline)', marginTop: 8, textAlign: 'center' }}>
            {diskScore !== null ? getRating(diskScore, 200, 1000, 3000) : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 4, textAlign: 'center' }}>
            {isRu ? 'Последовательные чтение/запись 256 MB' : 'Sequential read/write 256 MB'}
          </div>
        </div>
      </div>

      {/* Live Execution Log */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: 'var(--gutter)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--outline)' }}>terminal</span>
            <span style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--on-surface)'
            }}>
              {t('benchmarks.executionLog')}
            </span>
          </div>
          {running && <div className="live-dot" />}
        </div>

        <div
          ref={logRef}
          style={{
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            fontSize: 13,
            lineHeight: 1.8,
            maxHeight: 240,
            overflowY: 'auto',
            padding: '16px',
            borderRadius: 'var(--radius)',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid var(--outline-variant)'
          }}
        >
          {logs.length === 0 && (
            <div style={{ color: 'var(--outline)' }}>
              {isRu ? 'Ожидание запуска теста...' : 'Waiting for test to start...'}
              <span className="animate-blink" style={{ color: 'var(--neon-cyan)' }}>█</span>
            </div>
          )}
          {logs.map((log, i) => (
            <div key={i}>
              <span style={{ color: 'var(--outline)' }}>[{log.time}]</span>
              {' '}
              <span style={{ color: levelColors[log.level], fontWeight: 600 }}>{log.level}</span>
              {' '}
              <span style={{ color: 'var(--on-surface-variant)' }}>{log.message}</span>
            </div>
          ))}
          {running && (
            <span className="animate-blink" style={{ color: 'var(--neon-cyan)' }}>█</span>
          )}
        </div>
      </div>

      {/* Run button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="glass-btn-primary" onClick={runAll} disabled={running} style={{ padding: '14px 40px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>play_arrow</span>
          {running ? t('benchmarks.running') : t('benchmarks.runBenchmark')}
        </button>
      </div>
    </div>
  )
}

export default SystemBenchmarks
