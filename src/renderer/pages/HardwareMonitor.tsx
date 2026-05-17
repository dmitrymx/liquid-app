/**
 * Hardware Monitor Page
 * NEW PAGE — real-time sensor data with sparklines and color indicators
 * CPU cores are collapsible with a heatmap summary bar
 */
import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useHardwareStore } from '../store/useHardwareStore'
import { formatTemp, formatPercent, formatFreq, formatBytes, getTempColor, getLoadColor } from '../lib/formatters'

const HardwareMonitor: React.FC = () => {
  const { t, i18n } = useTranslation()
  const data = useHardwareStore(s => s.data)
  const history = useHardwareStore(s => s.history)
  const isRu = i18n.language === 'ru'

  const cpu = data?.cpu
  const gpu = data?.gpu?.[0]
  const mem = data?.memory
  const disks = data?.disks || []

  /* Cores collapsed state */
  const [coresExpanded, setCoresExpanded] = useState(false)

  /* Core temperature stats */
  const coreStats = useMemo(() => {
    const cores: number[] = cpu?.cores || []
    if (cores.length === 0) return null
    const validCores = cores.filter(c => c !== null && c !== undefined && !isNaN(c))
    if (validCores.length === 0) return null
    return {
      min: Math.min(...validCores),
      max: Math.max(...validCores),
      avg: Math.round(validCores.reduce((s, c) => s + c, 0) / validCores.length),
      count: validCores.length,
      cores: validCores
    }
  }, [cpu?.cores])

  /* Mini sparkline from history */
  const Sparkline: React.FC<{ values: number[]; color?: string; height?: number }> = ({ values, color = 'var(--neon-cyan)', height = 32 }) => {
    if (values.length < 2) return null
    const max = Math.max(...values, 1)
    const min = Math.min(...values, 0)
    const range = max - min || 1
    const w = 120
    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = height - ((v - min) / range) * (height - 4) - 2
      return `${x},${y}`
    }).join(' ')

    return (
      <svg width={w} height={height} style={{ overflow: 'visible' }}>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 3px ${color})` }}
        />
      </svg>
    )
  }

  /* Sensor row component */
  const SensorRow: React.FC<{ label: string; value: string; color?: string; sparkValues?: number[] }> = ({ label, value, color, sparkValues }) => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 0',
      borderBottom: '1px solid var(--outline-variant)'
    }}>
      <span style={{ fontSize: 13, color: 'var(--on-surface-variant)', fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {sparkValues && <Sparkline values={sparkValues} color={color} />}
        <span style={{ fontSize: 15, fontWeight: 700, color: color || 'var(--on-surface)', minWidth: 60, textAlign: 'right' }}>
          {value}
        </span>
      </div>
    </div>
  )

  /* Heatmap bar for core temperatures */
  const CoreHeatmap: React.FC<{ cores: number[] }> = ({ cores }) => {
    const getHeatColor = (temp: number): string => {
      if (temp < 40) return '#22c55e'
      if (temp < 50) return '#15ffd1'
      if (temp < 60) return '#00f2ff'
      if (temp < 70) return '#ffbe3c'
      if (temp < 80) return '#ff8c00'
      return '#ff4444'
    }

    return (
      <div style={{
        display: 'flex',
        gap: 2,
        borderRadius: 6,
        overflow: 'hidden',
        height: 20,
      }}>
        {cores.map((temp, i) => (
          <div
            key={i}
            title={`${isRu ? 'Ядро' : 'Core'} ${i}: ${temp}°C`}
            style={{
              flex: 1,
              background: getHeatColor(temp),
              opacity: 0.85,
              transition: 'background 0.5s ease',
              position: 'relative',
              minWidth: 6,
              borderRadius: cores.length <= 8 ? 3 : 1,
            }}
          />
        ))}
      </div>
    )
  }

  /* PERF: Memoize sparkline data to avoid re-creating arrays every render */
  const cpuTempHistory = useMemo(() => history.map(h => h?.cpu?.temperature ?? 0), [history])
  const cpuLoadHistory = useMemo(() => history.map(h => h?.cpu?.load ?? 0), [history])
  const gpuTempHistory = useMemo(() => history.map(h => h?.gpu?.[0]?.temperature ?? 0), [history])
  const memUsageHistory = useMemo(() => history.map(h => h?.memory?.usage ?? 0), [history])

  const getStatusLabel = (temp: number | null) => {
    if (temp === null) return t('hardware.naMessage')
    if (temp < 50) return t('hardware.normal')
    if (temp < 75) return t('hardware.elevated')
    return t('hardware.critical')
  }

  const getStatusBadgeClass = (temp: number | null) => {
    if (temp === null) return 'glass-badge'
    if (temp < 50) return 'glass-badge cyan'
    if (temp < 75) return 'glass-badge teal'
    return 'glass-badge'
  }

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1200 }}>
      <div className="page-header">
        <h1>{t('hardware.title')}</h1>
        <p>{t('hardware.subtitle')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gutter)' }}>
        {/* ===== CPU SECTION ===== */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--neon-cyan)' }}>memory</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{t('hardware.cpuTemps')}</span>
            <span className={getStatusBadgeClass(cpu?.temperature)} style={{ marginLeft: 'auto', fontSize: 10 }}>
              {getStatusLabel(cpu?.temperature)}
            </span>
          </div>

          {cpu?.temperature === null && (
            <div style={{
              fontSize: 11,
              color: 'var(--status-warning)',
              padding: '8px 12px',
              marginBottom: 12,
              borderRadius: 'var(--radius)',
              background: 'rgba(255, 190, 60, 0.08)',
              border: '1px solid rgba(255, 190, 60, 0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>info</span>
              {t('hardware.naHint')}
            </div>
          )}

          {/* Main package temperature */}
          <SensorRow
            label={`${t('hardware.package')}`}
            value={formatTemp(cpu?.temperature)}
            color={getTempColor(cpu?.temperature)}
            sparkValues={cpuTempHistory}
          />

          {/* ===== CORES SECTION — Collapsible with heatmap ===== */}
          {coreStats && (
            <div style={{ marginTop: 4 }}>
              {/* Cores summary bar — always visible */}
              <div
                onClick={() => setCoresExpanded(!coresExpanded)}
                style={{
                  padding: '12px 0',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--outline-variant)',
                  userSelect: 'none',
                }}
              >
                {/* Label row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--on-surface-variant)', fontWeight: 500 }}>
                      {isRu ? 'Ядра' : 'Cores'} ({coreStats.count})
                    </span>
                    <span className="material-symbols-outlined" style={{
                      fontSize: 16,
                      color: 'var(--outline)',
                      transition: 'transform 0.3s ease',
                      transform: coresExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}>
                      expand_more
                    </span>
                  </div>
                  {/* Min / Avg / Max summary chips */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 600,
                      padding: '3px 8px', borderRadius: 6,
                      background: 'rgba(21, 255, 209, 0.08)',
                      color: getTempColor(coreStats.min),
                      border: `1px solid ${getTempColor(coreStats.min)}30`,
                    }}>
                      Min {coreStats.min}°
                    </div>
                    <div style={{
                      fontSize: 11, fontWeight: 600,
                      padding: '3px 8px', borderRadius: 6,
                      background: 'rgba(0, 242, 255, 0.08)',
                      color: getTempColor(coreStats.avg),
                      border: `1px solid ${getTempColor(coreStats.avg)}30`,
                    }}>
                      Avg {coreStats.avg}°
                    </div>
                    <div style={{
                      fontSize: 11, fontWeight: 600,
                      padding: '3px 8px', borderRadius: 6,
                      background: 'rgba(255, 190, 60, 0.08)',
                      color: getTempColor(coreStats.max),
                      border: `1px solid ${getTempColor(coreStats.max)}30`,
                    }}>
                      Max {coreStats.max}°
                    </div>
                  </div>
                </div>

                {/* Heatmap bar */}
                <CoreHeatmap cores={coreStats.cores} />
              </div>

              {/* Expanded core list */}
              <div style={{
                maxHeight: coresExpanded ? `${(cpu?.cores?.length || 0) * 42 + 8}px` : '0px',
                overflow: 'hidden',
                transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>
                <div style={{ paddingTop: 4 }}>
                  {(cpu?.cores || []).map((coreTemp: number, i: number) => (
                    <SensorRow
                      key={i}
                      label={`${t('hardware.core')} ${i}`}
                      value={formatTemp(coreTemp)}
                      color={getTempColor(coreTemp)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Load, Clock, Brand */}
          <SensorRow label={t('hardware.load')} value={formatPercent(cpu?.load ?? 0)} color={getLoadColor(cpu?.load ?? 0)} sparkValues={cpuLoadHistory} />
          <SensorRow label={t('hardware.clock')} value={formatFreq(cpu?.speed ?? 0)} color="var(--neon-cyan)" />
          <SensorRow label="Brand" value={cpu?.brand?.split(' ').slice(0, 4).join(' ') || 'N/A'} />
          {cpu?.cores_count && (
            <SensorRow
              label={isRu ? 'Ядра / Потоки' : 'Cores / Threads'}
              value={`${cpu.cores_count}C / ${cpu.threads || cpu.cores_count}T`}
            />
          )}
        </div>

        {/* ===== GPU SECTION ===== */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--neon-teal)' }}>videocam</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{t('hardware.gpuTemps')}</span>
            <span className={getStatusBadgeClass(gpu?.temperature)} style={{ marginLeft: 'auto', fontSize: 10 }}>
              {getStatusLabel(gpu?.temperature)}
            </span>
          </div>

          {gpu ? (
            <>
              <SensorRow label="Model" value={gpu.model?.split(' ').slice(0, 4).join(' ') || 'N/A'} />
              <SensorRow label="Core" value={formatTemp(gpu.temperature)} color={getTempColor(gpu.temperature)} sparkValues={gpuTempHistory} />
              {gpu.temperatureMemory && <SensorRow label={t('hardware.memory')} value={formatTemp(gpu.temperatureMemory)} color={getTempColor(gpu.temperatureMemory)} />}
              <SensorRow label={t('hardware.load')} value={gpu.utilizationGpu !== null ? formatPercent(gpu.utilizationGpu) : 'N/A'} color={getLoadColor(gpu.utilizationGpu ?? 0)} />
              {gpu.clockCore && <SensorRow label={t('hardware.clock')} value={`${gpu.clockCore} MHz`} color="var(--neon-cyan)" />}
              {gpu.fanSpeed !== null && <SensorRow label={t('hardware.fans')} value={`${gpu.fanSpeed}%`} />}
              {gpu.powerDraw !== null && <SensorRow label={t('hardware.power')} value={`${gpu.powerDraw} W`} color="var(--status-warning)" />}
              <SensorRow label="VRAM" value={gpu.memoryUsed !== null && gpu.memoryTotal !== null ? `${Math.round(gpu.memoryUsed)} / ${Math.round(gpu.memoryTotal)} MB` : `${gpu.vram} MB`} />
            </>
          ) : (
            <div style={{ color: 'var(--outline)', fontSize: 13, padding: 16, textAlign: 'center' }}>
              {t('hardware.naMessage')}
            </div>
          )}
        </div>

        {/* ===== MEMORY ===== */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--neon-blue)' }}>dynamic_form</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{t('dashboard.memory')}</span>
          </div>
          <SensorRow label="Total" value={formatBytes(mem?.total ?? 0)} />
          <SensorRow label="Active" value={formatBytes(mem?.active ?? 0)} color={getLoadColor(mem?.usage ?? 0)} sparkValues={memUsageHistory} />
          <SensorRow label="Available" value={formatBytes(mem?.available ?? 0)} color="var(--neon-teal)" />
          <SensorRow label={t('performance.usage')} value={formatPercent(mem?.usage ?? 0)} color={getLoadColor(mem?.usage ?? 0)} />
          {(mem?.swapTotal ?? 0) > 0 && (
            <SensorRow label="Swap" value={`${formatBytes(mem?.swapUsed ?? 0)} / ${formatBytes(mem?.swapTotal ?? 0)}`} />
          )}
        </div>

        {/* ===== DISKS ===== */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--neon-cyan)' }}>hard_drive</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{t('hardware.diskTemps')}</span>
          </div>
          {disks.map((disk: any, i: number) => (
            <React.Fragment key={i}>
              <SensorRow label={disk.mount || disk.name} value={`${formatPercent(disk.usage)} used`} color={getLoadColor(disk.usage)} />
              <SensorRow label={`  Size`} value={formatBytes(disk.size)} />
              {disk.temperature !== null && (
                <SensorRow label={`  Temp`} value={formatTemp(disk.temperature)} color={getTempColor(disk.temperature)} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}

export default HardwareMonitor
