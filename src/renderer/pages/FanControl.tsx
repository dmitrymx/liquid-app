/**
 * FanControl — Fan management with grouping
 * Groups: CPU, Case/System, GPU. Hides empty headers.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '../lib/ipc'

interface FanEntry {
  id: string; name: string; hw: string; rpm: number | null
  control: number | null; mode: string; min: number; max: number; canControl: boolean
}
interface TempEntry { name: string; value: number; hw: string }
interface FanControlData {
  fans: FanEntry[]; temps: TempEntry[]
  cpu: { name?: string; package?: number; cores?: number[]; clocks?: number[]; power?: number }
  gpu: { name?: string; temp?: number; hotspot?: number; coreClock?: number; memClock?: number; load?: number; power?: number; vramUsed?: number; vramTotal?: number }
}

type FanGroup = 'cpu' | 'gpu' | 'case'

function classifyFan(fan: FanEntry): FanGroup {
  const n = (fan.name + ' ' + fan.hw).toLowerCase()
  if (n.includes('gpu') || n.includes('nvidia') || n.includes('amd') || n.includes('radeon')) return 'gpu'
  if (n.includes('cpu') || /fan\s*#?1\b/.test(n)) return 'cpu'
  return 'case'
}

function isEmptyHeader(fan: FanEntry): boolean {
  return (fan.rpm === 0 || fan.rpm === null) && (fan.control != null && fan.control > 0 && fan.control <= 35)
}

function isGpuPassive(fan: FanEntry, gpuTemp?: number): boolean {
  if (classifyFan(fan) !== 'gpu') return false
  return (fan.rpm === 0 || fan.rpm === null) && (gpuTemp == null || gpuTemp < 55)
}

const groupLabels: Record<string, Record<FanGroup, string>> = {
  ru: { cpu: '🔵 Процессор (CPU)', gpu: '🟢 Видеокарта (GPU)', case: '⚪ Корпусные / Системные' },
  en: { cpu: '🔵 CPU Fans', gpu: '🟢 GPU Fans', case: '⚪ Case / System Fans' }
}
const groupIcons: Record<FanGroup, string> = { cpu: 'memory', gpu: 'videocam', case: 'computer' }

const FanControl: React.FC = () => {
  const { t, i18n } = useTranslation()
  const isRu = i18n.language === 'ru'
  const [data, setData] = useState<FanControlData | null>(null)
  const [loading, setLoading] = useState(true)
  const [manualValues, setManualValues] = useState<Record<string, number>>({})
  const [manualModes, setManualModes] = useState<Record<string, boolean>>({})
  const [applying, setApplying] = useState<Record<string, boolean>>({})
  const [showEmpty, setShowEmpty] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const result = await ipc.getFanData()
      if (result && !result.error) { setData(result as FanControlData); setLoading(false) }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchData()
    /* PERF: Fan RPM doesn't change rapidly — 5s is sufficient (was 1.5s!) */
    intervalRef.current = setInterval(fetchData, 5000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchData])

  const handleSetSpeed = async (fan: FanEntry, value: number) => {
    setApplying(p => ({ ...p, [fan.id]: true }))
    await ipc.setFanSpeed(fan.id, value)
    setManualValues(p => ({ ...p, [fan.id]: value }))
    setManualModes(p => ({ ...p, [fan.id]: true }))
    setTimeout(() => setApplying(p => ({ ...p, [fan.id]: false })), 500)
  }
  const handleResetFan = async (fan: FanEntry) => {
    setApplying(p => ({ ...p, [fan.id]: true }))
    await ipc.resetFan(fan.id)
    setManualModes(p => ({ ...p, [fan.id]: false }))
    setManualValues(p => { const c = { ...p }; delete c[fan.id]; return c })
    setTimeout(() => setApplying(p => ({ ...p, [fan.id]: false })), 500)
  }
  const handleResetAll = async () => { await ipc.resetAllFans(); setManualModes({}); setManualValues({}) }

  const getTempColor = (temp: number | null | undefined) => {
    if (!temp) return 'var(--on-surface-variant)'
    if (temp < 50) return '#22d3ee'; if (temp < 70) return '#facc15'; if (temp < 85) return '#f97316'; return '#ef4444'
  }
  const getRpmAnimation = (rpm: number | null) => {
    if (!rpm || rpm === 0) return 'none'
    return `spin ${Math.max(0.15, 2 - rpm / 1500)}s linear infinite`
  }

  const TempCard = ({ label, value, icon }: { label: string; value: number | null | undefined; icon: string }) => (
    <div style={{ padding: '16px', borderRadius: 'var(--radius)', background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', display: 'flex', alignItems: 'center', gap: '12px', minWidth: '140px', flex: '1 1 140px' }}>
      <span className="material-symbols-outlined" style={{ fontSize: '28px', color: getTempColor(value ?? null), filter: value && value > 70 ? 'drop-shadow(0 0 6px currentColor)' : 'none' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: '22px', fontWeight: 700, color: getTempColor(value ?? null), fontFamily: 'var(--font-mono, monospace)' }}>
          {value != null ? `${Math.round(value)}°C` : '—'}
        </div>
      </div>
    </div>
  )

  const FanCard = ({ fan }: { fan: FanEntry }) => {
    const isManual = manualModes[fan.id] || fan.mode === 'software'
    const sliderValue = manualValues[fan.id] ?? fan.control ?? 50
    const isBusy = applying[fan.id]
    const isStopped = fan.rpm === 0 || fan.rpm === null
    const passive = isGpuPassive(fan, data?.gpu?.temp)
    const empty = isEmptyHeader(fan)

    const statusText = passive
      ? (isRu ? 'Пассивный режим' : 'Passive Mode')
      : empty
        ? (isRu ? 'Не подключён' : 'Not Connected')
        : isStopped
          ? t('fanControl.stopped', 'Остановлен')
          : `${fan.rpm}`

    const statusColor = passive ? '#a78bfa' : empty ? 'var(--outline)' : isStopped ? '#f97316' : 'var(--neon-cyan)'

    return (
      <div style={{
        padding: '20px', borderRadius: 'var(--radius-lg, 16px)', background: 'var(--surface-container)',
        border: `1px solid ${isManual ? 'rgba(0, 242, 255, 0.3)' : empty ? 'rgba(255,255,255,0.04)' : 'var(--outline-variant)'}`,
        boxShadow: isManual ? '0 0 20px rgba(0, 242, 255, 0.08)' : 'none',
        transition: 'all 0.3s ease', opacity: empty ? 0.5 : 1, position: 'relative' as const
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="material-symbols-outlined" style={{
              fontSize: '32px', color: isStopped ? 'var(--on-surface-variant)' : 'var(--neon-cyan)',
              animation: getRpmAnimation(fan.rpm), opacity: isStopped ? 0.4 : 1
            }}>mode_fan</span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--on-surface)' }}>{fan.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>{fan.hw}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' as const }}>
            <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', color: statusColor }}>
              {statusText}
            </div>
            {!isStopped && <div style={{ fontSize: '10px', color: 'var(--on-surface-variant)' }}>RPM</div>}
            {passive && <div style={{ fontSize: '10px', color: '#a78bfa' }}>GPU &lt; 55°C</div>}
          </div>
        </div>

        {fan.control != null && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, fan.control)}%`, borderRadius: '3px', background: `linear-gradient(90deg, #06b6d4, ${(fan.control ?? 0) > 80 ? '#ef4444' : '#22d3ee'})`, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)', marginTop: '4px' }}>
              {t('fanControl.currentDuty', 'Текущий')}: {Math.round(fan.control)}%
            </div>
          </div>
        )}

        {fan.canControl && !empty && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <button onClick={() => isManual ? handleResetFan(fan) : setManualModes(p => ({ ...p, [fan.id]: true }))} disabled={isBusy}
                style={{ flex: 1, padding: '6px 12px', borderRadius: 'var(--radius)', border: `1px solid ${!isManual ? 'rgba(0, 242, 255, 0.3)' : 'var(--outline-variant)'}`, background: !isManual ? 'rgba(0, 242, 255, 0.1)' : 'transparent', color: !isManual ? 'var(--neon-cyan)' : 'var(--on-surface-variant)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, transition: 'all 0.2s ease' }}>
                BIOS / Auto
              </button>
              <button onClick={() => setManualModes(p => ({ ...p, [fan.id]: true }))} disabled={isBusy}
                style={{ flex: 1, padding: '6px 12px', borderRadius: 'var(--radius)', border: `1px solid ${isManual ? 'rgba(0, 242, 255, 0.3)' : 'var(--outline-variant)'}`, background: isManual ? 'rgba(0, 242, 255, 0.1)' : 'transparent', color: isManual ? 'var(--neon-cyan)' : 'var(--on-surface-variant)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, transition: 'all 0.2s ease' }}>
                {t('fanControl.manual', 'Ручной')}
              </button>
            </div>
            {isManual && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)', minWidth: '30px' }}>20%</span>
                  <input type="range" min={20} max={100} value={sliderValue}
                    onChange={e => setManualValues(p => ({ ...p, [fan.id]: parseInt(e.target.value) }))}
                    onMouseUp={() => handleSetSpeed(fan, sliderValue)} onTouchEnd={() => handleSetSpeed(fan, sliderValue)}
                    style={{ flex: 1, height: '6px', accentColor: 'var(--neon-cyan)', cursor: 'pointer' }} />
                  <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)', minWidth: '36px' }}>100%</span>
                </div>
                <div style={{ textAlign: 'center', marginTop: '6px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--neon-cyan)', fontFamily: 'var(--font-mono, monospace)' }}>{sliderValue}%</span>
                </div>
                {sliderValue < 40 && (
                  <div style={{ marginTop: '8px', padding: '6px 10px', borderRadius: 'var(--radius)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', fontSize: '11px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>warning</span>
                    {t('fanControl.lowSpeedWarning', 'Низкая скорость может привести к перегреву!')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {!fan.canControl && !empty && (
          <div style={{ padding: '6px 10px', borderRadius: 'var(--radius)', background: 'rgba(255,255,255,0.03)', fontSize: '11px', color: 'var(--on-surface-variant)' }}>
            {t('fanControl.readOnly', 'Только чтение — управление BIOS')}
          </div>
        )}
      </div>
    )
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
      <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--neon-cyan)', animation: 'spin 1s linear infinite' }}>mode_fan</span>
      <div style={{ color: 'var(--on-surface-variant)' }}>{t('fanControl.loading', 'Инициализация датчиков...')}</div>
    </div>
  )

  // Group fans
  const allFans = data?.fans || []
  const activeFans = showEmpty ? allFans : allFans.filter(f => !isEmptyHeader(f))
  const hiddenCount = allFans.length - allFans.filter(f => !isEmptyHeader(f)).length

  const grouped: Record<FanGroup, FanEntry[]> = { cpu: [], gpu: [], case: [] }
  activeFans.forEach(f => grouped[classifyFan(f)].push(f))

  const mbTemps = data?.temps?.filter(t =>
    !t.hw?.toLowerCase().includes('cpu') && !t.name?.toLowerCase().includes('gpu') &&
    (t.hw?.toLowerCase().includes('it8') || t.hw?.toLowerCase().includes('nuvoton') || t.hw?.toLowerCase().includes('super'))
  ) || []

  const lang = isRu ? 'ru' : 'en'

  return (
    <div style={{ padding: '0 24px 24px', overflow: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', position: 'sticky', top: 0, background: 'var(--surface)', paddingTop: '24px', paddingBottom: '12px', zIndex: 10 }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--on-surface)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--neon-cyan)', fontSize: '28px' }}>mode_fan</span>
            {t('fanControl.title', 'Управление вентиляторами')}
          </h1>
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '13px', margin: '4px 0 0' }}>
            {t('fanControl.subtitle', 'Температуры, частоты и управление скоростью вращения')}
          </p>
        </div>
        <button onClick={handleResetAll}
          style={{ padding: '8px 16px', borderRadius: 'var(--radius)', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.08)', color: '#f87171', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>restart_alt</span>
          {t('fanControl.resetAll', 'Сброс всех в BIOS')}
        </button>
      </div>

      {/* Temperatures */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--on-surface-variant)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          {t('fanControl.temperatures', 'Температуры')}
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <TempCard label="CPU Package" value={data?.cpu?.package} icon="thermostat" />
          <TempCard label="GPU" value={data?.gpu?.temp} icon="thermostat" />
          {data?.gpu?.hotspot && <TempCard label="GPU Hotspot" value={data.gpu.hotspot} icon="local_fire_department" />}
          {mbTemps.slice(0, 3).map((t, i) => <TempCard key={i} label={t.name} value={t.value} icon="device_thermostat" />)}
        </div>
      </div>

      {/* Clocks */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--on-surface-variant)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          {t('fanControl.frequencies', 'Частоты')}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
          <div style={{ padding: '14px 16px', borderRadius: 'var(--radius)', background: 'var(--surface-container)', border: '1px solid var(--outline-variant)' }}>
            <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              CPU {t('fanControl.clocks', 'Частоты')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {(data?.cpu?.clocks || []).map((clk, i) => (
                <span key={i} style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(0, 242, 255, 0.06)', border: '1px solid rgba(0, 242, 255, 0.15)', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', color: (clk ?? 0) > 3000 ? '#22d3ee' : 'var(--on-surface-variant)' }}>
                  {clk != null ? `${Math.round(clk)}` : '—'} MHz
                </span>
              ))}
              {(data?.cpu?.clocks || []).length === 0 && <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>—</span>}
            </div>
            {data?.cpu?.power != null && <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--on-surface-variant)' }}>Power: <strong style={{ color: 'var(--on-surface)' }}>{data.cpu.power}W</strong></div>}
          </div>
          <div style={{ padding: '14px 16px', borderRadius: 'var(--radius)', background: 'var(--surface-container)', border: '1px solid var(--outline-variant)' }}>
            <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              GPU {t('fanControl.clocks', 'Частоты')} {data?.gpu?.name ? `— ${data.gpu.name}` : ''}
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div><div style={{ fontSize: '10px', color: 'var(--on-surface-variant)' }}>Core</div><div style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', color: '#22d3ee' }}>{data?.gpu?.coreClock != null ? `${Math.round(data.gpu.coreClock)} MHz` : '—'}</div></div>
              <div><div style={{ fontSize: '10px', color: 'var(--on-surface-variant)' }}>Memory</div><div style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', color: '#a78bfa' }}>{data?.gpu?.memClock != null ? `${Math.round(data.gpu.memClock)} MHz` : '—'}</div></div>
              {data?.gpu?.load != null && <div><div style={{ fontSize: '10px', color: 'var(--on-surface-variant)' }}>Load</div><div style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', color: '#facc15' }}>{Math.round(data.gpu.load)}%</div></div>}
            </div>
            {data?.gpu?.power != null && (
              <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--on-surface-variant)' }}>
                Power: <strong style={{ color: 'var(--on-surface)' }}>{data.gpu.power}W</strong>
                {data.gpu.vramUsed != null && data.gpu.vramTotal != null && <span style={{ marginLeft: '12px' }}>VRAM: <strong style={{ color: 'var(--on-surface)' }}>{Math.round(data.gpu.vramUsed)} / {Math.round(data.gpu.vramTotal)} MB</strong></span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grouped Fan Cards */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--on-surface-variant)', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>
            {t('fanControl.fans', 'Вентиляторы')} ({activeFans.length})
          </h3>
          {hiddenCount > 0 && (
            <button onClick={() => setShowEmpty(!showEmpty)} style={{
              padding: '4px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--outline-variant)',
              background: 'transparent', color: 'var(--on-surface-variant)', cursor: 'pointer', fontSize: '11px', transition: 'all 0.2s'
            }}>
              {showEmpty
                ? (isRu ? `Скрыть пустые (${hiddenCount})` : `Hide empty (${hiddenCount})`)
                : (isRu ? `Показать все (+${hiddenCount} пустых)` : `Show all (+${hiddenCount} empty)`)}
            </button>
          )}
        </div>

        {(['cpu', 'case', 'gpu'] as FanGroup[]).map(group => {
          const fans = grouped[group]
          if (fans.length === 0) return null
          return (
            <div key={group} style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--on-surface-variant)' }}>{groupIcons[group]}</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--on-surface)' }}>{groupLabels[lang][group]}</span>
                <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>({fans.length})</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
                {fans.map((fan, i) => <FanCard key={fan.id || i} fan={fan} />)}
              </div>
            </div>
          )
        })}

        {activeFans.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--on-surface-variant)', borderRadius: 'var(--radius-lg, 16px)', background: 'var(--surface-container)', border: '1px solid var(--outline-variant)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '48px', opacity: 0.3, display: 'block', marginBottom: '12px' }}>mode_fan_off</span>
            {t('fanControl.noFans', 'Вентиляторы не обнаружены. Ожидание данных от TempMonitor...')}
          </div>
        )}
      </div>

      {/* @keyframes spin is defined in animations.css */}
    </div>
  )
}

export default FanControl
