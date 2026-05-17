/**
 * Performance Optimizer Page
 * Real: Opti-Score with RECOMMENDATIONS, Memory Booster, Startup Manager, Power Profiles
 */
import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useHardwareStore } from '../store/useHardwareStore'
import { ipc } from '../lib/ipc'
import { formatBytes } from '../lib/formatters'

interface PowerProfile {
  guid: string
  name: string
  active: boolean
}

interface Recommendation {
  id: string
  icon: string
  title: string
  description: string
  severity: 'high' | 'medium' | 'low'
  action?: () => void
  actionLabel?: string
  done?: boolean
}

const PerformanceOptimizer: React.FC = () => {
  const { t, i18n } = useTranslation()
  const data = useHardwareStore(s => s.data)
  const [startupItems, setStartupItems] = useState<any[]>([])
  const [startupLoaded, setStartupLoaded] = useState(false)
  const [purging, setPurging] = useState(false)
  const [purgeResult, setPurgeResult] = useState<any>(null)
  const [powerProfiles, setPowerProfiles] = useState<PowerProfile[]>([])
  const [settingProfile, setSettingProfile] = useState(false)

  /* Game Mode */
  const [gameModeActive, setGameModeActive] = useState(false)
  const [gameModeActivating, setGameModeActivating] = useState(false)
  const [gameModeResult, setGameModeResult] = useState<any>(null)

  const isRu = i18n.language === 'ru'

  useEffect(() => {
    ipc.getStartupItems().then(items => {
      if (Array.isArray(items)) setStartupItems(items)
      setStartupLoaded(true)
    }).catch(() => setStartupLoaded(true))

    ipc.listPowerProfiles().then(profiles => {
      if (Array.isArray(profiles)) setPowerProfiles(profiles)
    }).catch(() => {})

    /* Check game mode status */
    ipc.getGameModeStatus().then((st: any) => {
      if (st?.active) setGameModeActive(true)
    }).catch(() => {})
  }, [])

  const toggleStartup = async (id: string, enabled: boolean) => {
    await ipc.toggleStartupItem(id, enabled)
    setStartupItems(prev =>
      prev.map(item => item.id === id ? { ...item, enabled } : item)
    )
  }

  const purgeRam = async () => {
    setPurging(true)
    setPurgeResult(null)
    const result = await ipc.purgeRam()
    setPurgeResult(result)
    setPurging(false)
  }

  const setProfile = async (guid: string) => {
    setSettingProfile(true)
    await ipc.setPowerProfile(guid)
    const profiles = await ipc.listPowerProfiles()
    if (Array.isArray(profiles)) setPowerProfiles(profiles)
    setSettingProfile(false)
  }

  const cpuLoad = data?.cpu?.load ?? 0
  const memTotal = data?.memory?.total ?? 0
  const memActive = data?.memory?.active ?? 0
  const memUsage = data?.memory?.usage ?? 0

  /* Detailed score breakdown */
  const cpuPenalty = Math.round(cpuLoad * 0.4)
  const memPenalty = Math.round(memUsage * 0.3)
  const startupPenalty = Math.min(20, startupItems.filter(i => i.enabled && (i.impact === 'high' || i.impact === 'medium')).length * 4)
  const optiScore = Math.max(0, Math.min(100, 100 - cpuPenalty - memPenalty - startupPenalty))

  /* Build recommendations dynamically */
  const recommendations = useMemo<Recommendation[]>(() => {
    const recs: Recommendation[] = []
    const highStartup = startupItems.filter(i => i.enabled && i.impact === 'high')
    const medStartup = startupItems.filter(i => i.enabled && i.impact === 'medium')

    if (memUsage > 60) {
      recs.push({
        id: 'ram',
        icon: 'memory',
        title: isRu ? 'Освободите оперативную память' : 'Free Up RAM',
        description: isRu
          ? `Загружено ${Math.round(memUsage)}% памяти (${formatBytes(memActive)} из ${formatBytes(memTotal)}). Нажмите для очистки кэша.`
          : `${Math.round(memUsage)}% RAM used (${formatBytes(memActive)} of ${formatBytes(memTotal)}). Click to purge cache.`,
        severity: memUsage > 80 ? 'high' : 'medium',
        action: purgeRam,
        actionLabel: isRu ? 'Освободить' : 'Free Up',
        done: purgeResult && !purgeResult.error
      })
    }

    if (cpuLoad > 60) {
      recs.push({
        id: 'cpu',
        icon: 'developer_board',
        title: isRu ? 'Высокая загрузка процессора' : 'High CPU Load',
        description: isRu
          ? `CPU загружен на ${Math.round(cpuLoad)}%. Закройте неиспользуемые приложения через Диспетчер задач (Ctrl+Shift+Esc).`
          : `CPU at ${Math.round(cpuLoad)}%. Close unused applications via Task Manager (Ctrl+Shift+Esc).`,
        severity: cpuLoad > 85 ? 'high' : 'medium',
      })
    }

    if (highStartup.length > 0) {
      recs.push({
        id: 'startup_high',
        icon: 'rocket_launch',
        title: isRu
          ? `${highStartup.length} программ с высоким влиянием в автозагрузке`
          : `${highStartup.length} high-impact startup items`,
        description: isRu
          ? `Отключите: ${highStartup.map(i => i.name).slice(0, 3).join(', ')}${highStartup.length > 3 ? '...' : ''}. Они замедляют загрузку Windows.`
          : `Disable: ${highStartup.map(i => i.name).slice(0, 3).join(', ')}${highStartup.length > 3 ? '...' : ''}. They slow down Windows boot.`,
        severity: 'high',
      })
    }

    if (medStartup.length > 2) {
      recs.push({
        id: 'startup_med',
        icon: 'speed',
        title: isRu
          ? `${medStartup.length} программ со средним влиянием в автозагрузке`
          : `${medStartup.length} medium-impact startup items`,
        description: isRu
          ? 'Рассмотрите отключение неиспользуемых программ для ускорения загрузки.'
          : 'Consider disabling unused programs to speed up boot time.',
        severity: 'low',
      })
    }

    const activeProfile = powerProfiles.find(p => p.active)
    const hasHighPerf = powerProfiles.some(p =>
      p.name.includes('Высокая') || p.name.includes('High') || p.name.includes('Ultimate') || p.name.includes('Максимальная')
    )
    if (activeProfile && !activeProfile.name.includes('Высокая') && !activeProfile.name.includes('High') && !activeProfile.name.includes('Ultimate') && !activeProfile.name.includes('Максимальная') && hasHighPerf) {
      const highPerf = powerProfiles.find(p =>
        p.name.includes('Высокая') || p.name.includes('High') || p.name.includes('Ultimate') || p.name.includes('Максимальная')
      )
      recs.push({
        id: 'power',
        icon: 'bolt',
        title: isRu ? 'Включите режим высокой производительности' : 'Enable High Performance mode',
        description: isRu
          ? `Текущий профиль: «${activeProfile.name}». Переключение на «Высокая производительность» раскроет полный потенциал CPU.`
          : `Current profile: "${activeProfile.name}". Switching to "High Performance" will unlock full CPU potential.`,
        severity: 'medium',
        action: highPerf ? () => setProfile(highPerf.guid) : undefined,
        actionLabel: isRu ? 'Переключить' : 'Switch',
      })
    }

    if (recs.length === 0) {
      recs.push({
        id: 'ok',
        icon: 'check_circle',
        title: isRu ? 'Система работает оптимально!' : 'System is running optimally!',
        description: isRu
          ? 'Все показатели в норме. Продолжайте использовать систему как обычно.'
          : 'All metrics are within normal range. Continue using your system as usual.',
        severity: 'low',
      })
    }

    return recs
  }, [cpuLoad, memUsage, startupItems, powerProfiles, purgeResult, isRu])

  const impactColors: Record<string, string> = {
    low: 'var(--neon-teal)',
    medium: 'var(--status-warning)',
    high: 'var(--status-critical)',
    unknown: 'var(--outline)'
  }

  const sevColors: Record<string, string> = {
    high: 'var(--status-critical)',
    medium: 'var(--status-warning)',
    low: 'var(--neon-teal)',
  }

  const profileIcons: Record<string, string> = {
    'Экономия энергии': 'eco',
    'Power saver': 'eco',
    'Сбалансированная': 'balance',
    'Balanced': 'balance',
    'Высокая производительность': 'bolt',
    'High performance': 'bolt',
    'Максимальная производительность': 'local_fire_department',
    'Ultimate Performance': 'local_fire_department',
  }

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1200 }}>
      <div className="page-header">
        <h1>{t('performance.title')}</h1>
        <p>{t('performance.subtitle')}</p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: 'var(--gutter)'
      }}>
        {/* ===== OPTI-SCORE ===== */}
        <div className="glass-panel" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--on-surface)' }}>
                {t('performance.optiScore')}
              </div>
              <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 4 }}>
                {t('performance.telemetry')}
              </div>
            </div>
            <div className="glass-badge cyan" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="live-dot" /> {t('performance.live')}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 24 }}>
            <span style={{
              fontSize: 72, fontWeight: 800, color: 'var(--neon-cyan)',
              textShadow: '0 0 20px rgba(0, 242, 255, 0.5)',
              lineHeight: 1, letterSpacing: '-0.04em'
            }}>
              {optiScore}
            </span>
            <span style={{ fontSize: 22, color: 'var(--outline)', fontWeight: 400 }}>/100</span>
          </div>

          <div style={{
            fontSize: 12, fontWeight: 600,
            color: optiScore >= 70 ? 'var(--neon-teal)' : optiScore >= 40 ? 'var(--status-warning)' : 'var(--status-critical)',
            marginTop: 8, display: 'flex', alignItems: 'center', gap: 6
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              {optiScore >= 70 ? 'check_circle' : optiScore >= 40 ? 'warning' : 'error'}
            </span>
            {optiScore >= 70 ? (isRu ? 'Отличная производительность' : 'Excellent Performance')
              : optiScore >= 40 ? (isRu ? 'Можно улучшить' : 'Can Be Improved')
              : (isRu ? 'Требуется оптимизация' : 'Needs Optimization')}
          </div>

          {/* Score breakdown */}
          <div style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 'var(--radius)',
            background: 'rgba(0, 242, 255, 0.04)', border: '1px solid var(--outline-variant)',
            display: 'flex', gap: 16, fontSize: 12, color: 'var(--on-surface-variant)'
          }}>
            <span>CPU: <b style={{ color: cpuPenalty > 20 ? 'var(--status-warning)' : 'var(--neon-teal)' }}>-{cpuPenalty}</b></span>
            <span>RAM: <b style={{ color: memPenalty > 15 ? 'var(--status-warning)' : 'var(--neon-teal)' }}>-{memPenalty}</b></span>
            <span>{isRu ? 'Автозагрузка' : 'Startup'}: <b style={{ color: startupPenalty > 8 ? 'var(--status-warning)' : 'var(--neon-teal)' }}>-{startupPenalty}</b></span>
          </div>
        </div>

        {/* ===== MEMORY BOOSTER ===== */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{t('performance.memoryBooster')}</div>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>memory</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{t('performance.usage')}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--neon-cyan)' }}>
              {formatBytes(memActive)} / {formatBytes(memTotal)}
            </span>
          </div>

          <div className="glass-progress-track" style={{ marginBottom: 16 }}>
            <div className="glass-progress-fill" style={{ width: `${memUsage}%` }} />
          </div>

          <div style={{ fontSize: 12, color: 'var(--outline)', marginBottom: 16 }}>
            {isRu ? `Загружено: ${Math.round(memUsage)}%` : `Used: ${Math.round(memUsage)}%`}
          </div>

          <button
            className="glass-btn-primary"
            onClick={purgeRam}
            disabled={purging}
            style={{ width: '100%', padding: '12px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {purging ? 'hourglass_top' : 'bolt'}
            </span>
            {purging
              ? (isRu ? 'Оптимизация...' : 'Optimizing...')
              : (isRu ? 'Освободить память' : 'Free Up Memory')
            }
          </button>

          {purgeResult && !purgeResult.error && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius)',
              background: 'rgba(21, 255, 209, 0.08)', border: '1px solid rgba(21, 255, 209, 0.2)',
              fontSize: 13, color: 'var(--neon-teal)', fontWeight: 500
            }}>
              ✓ {isRu ? 'Освобождено' : 'Freed'}: {purgeResult.freedMB} MB
            </div>
          )}
        </div>

        {/* ===== RECOMMENDATIONS ===== */}
        <div className="glass-panel" style={{ padding: '24px', gridColumn: '1 / -1' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--neon-cyan)' }}>lightbulb</span>
            <span style={{ fontSize: 18, fontWeight: 600 }}>
              {isRu ? 'Рекомендации' : 'Recommendations'}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, marginLeft: 'auto',
              padding: '4px 10px', borderRadius: 12,
              background: recommendations.some(r => r.severity === 'high') ? 'rgba(255, 80, 80, 0.15)' : 'rgba(21, 255, 209, 0.1)',
              color: recommendations.some(r => r.severity === 'high') ? 'var(--status-critical)' : 'var(--neon-teal)',
              border: `1px solid ${recommendations.some(r => r.severity === 'high') ? 'rgba(255, 80, 80, 0.3)' : 'rgba(21, 255, 209, 0.2)'}`
            }}>
              {recommendations.filter(r => r.severity !== 'low' || r.id === 'ok').length} {isRu ? 'пунктов' : 'items'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recommendations.map(rec => (
              <div key={rec.id} className="glass-row" style={{
                padding: '16px 20px',
                borderColor: rec.done ? 'rgba(21, 255, 209, 0.3)' : undefined,
                opacity: rec.done ? 0.7 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flex: 1 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 'var(--radius)',
                    background: `${sevColors[rec.severity]}15`,
                    border: `1px solid ${sevColors[rec.severity]}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <span className="material-symbols-outlined" style={{
                      fontSize: 20, color: sevColors[rec.severity]
                    }}>{rec.done ? 'check_circle' : rec.icon}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)', marginBottom: 4 }}>
                      {rec.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
                      {rec.description}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 12 }}>
                  {rec.action && !rec.done && (
                    <button className="glass-btn-primary" onClick={rec.action}
                      style={{ padding: '8px 16px', fontSize: 12, whiteSpace: 'nowrap' }}
                    >
                      {rec.actionLabel}
                    </button>
                  )}
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                    padding: '3px 8px', borderRadius: 6,
                    color: sevColors[rec.severity],
                    background: `${sevColors[rec.severity]}15`,
                    border: `1px solid ${sevColors[rec.severity]}30`,
                    letterSpacing: '0.05em'
                  }}>
                    {rec.severity === 'high' ? (isRu ? 'Важно' : 'High')
                      : rec.severity === 'medium' ? (isRu ? 'Средне' : 'Med')
                      : (isRu ? 'Норма' : 'OK')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ===== STARTUP MANAGER ===== */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{t('performance.startupManager')}</div>
            <span style={{
              fontSize: 11, fontWeight: 600, color: 'var(--outline)',
              textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>{t('performance.impact')}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
            {startupItems.map(item => (
              <div key={item.id} className="glass-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 'var(--radius)',
                    background: 'var(--surface-container)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--outline)' }}>apps</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--on-surface)' }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--outline)' }}>{item.publisher}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: impactColors[item.impact] || 'var(--outline)'
                  }}>
                    {t(`performance.${item.impact}Impact`)}
                  </span>
                  <div
                    className="glass-toggle"
                    data-state={item.enabled ? 'on' : 'off'}
                    onClick={() => toggleStartup(item.id, !item.enabled)}
                    style={{ transform: 'scale(0.85)' }}
                  >
                    <div className="glass-toggle-thumb" />
                  </div>
                </div>
              </div>
            ))}
            {startupItems.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--outline)', padding: 16, textAlign: 'center' }}>
                {startupLoaded ? t('performance.noStartupItems') : t('common.loading')}
              </div>
            )}
          </div>
        </div>

        {/* ===== POWER PROFILES ===== */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              {isRu ? 'Профиль питания' : 'Power Profile'}
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--neon-cyan)' }}>bolt</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {powerProfiles.map(profile => (
              <div
                key={profile.guid}
                className="glass-row"
                onClick={() => !settingProfile && setProfile(profile.guid)}
                style={{
                  cursor: settingProfile ? 'wait' : 'pointer',
                  borderColor: profile.active ? 'rgba(0, 242, 255, 0.3)' : undefined,
                  background: profile.active ? 'rgba(0, 242, 255, 0.05)' : undefined
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="material-symbols-outlined" style={{
                    fontSize: 20,
                    color: profile.active ? 'var(--neon-cyan)' : 'var(--outline)'
                  }}>
                    {profileIcons[profile.name] || 'power_settings_new'}
                  </span>
                  <span style={{
                    fontSize: 14, fontWeight: profile.active ? 600 : 400,
                    color: profile.active ? 'var(--neon-cyan)' : 'var(--on-surface)'
                  }}>
                    {profile.name}
                  </span>
                </div>
                {profile.active && (
                  <span className="material-symbols-outlined fill" style={{ fontSize: 18, color: 'var(--neon-cyan)' }}>
                    check_circle
                  </span>
                )}
              </div>
            ))}
            {powerProfiles.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--outline)', padding: 16, textAlign: 'center' }}>
                {isRu ? 'Загрузка профилей...' : 'Loading profiles...'}
              </div>
            )}
          </div>
        </div>

        {/* ═══════ GAME MODE ═══════ */}
        <div className="glass-panel liquid-glass-high" style={{ padding: 24, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="material-symbols-outlined" style={{
                fontSize: 28, color: gameModeActive ? '#ff6b35' : 'var(--neon-cyan)',
                animation: gameModeActive ? 'pulse-gm 2s ease-in-out infinite' : 'none'
              }}>sports_esports</span>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--on-surface)' }}>
                  {isRu ? 'Игровой Режим' : 'Game Mode'}
                </h3>
                <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0, marginTop: 2 }}>
                  {isRu
                    ? 'Максимум производительности: убивает фоновые процессы, макс. питание, отключает уведомления'
                    : 'Maximum performance: kills background processes, max power, disables notifications'}
                </p>
              </div>
            </div>

            {/* Big toggle */}
            <button onClick={async () => {
              setGameModeActivating(true)
              try {
                if (gameModeActive) {
                  await ipc.deactivateGameMode()
                  setGameModeActive(false)
                  setGameModeResult(null)
                } else {
                  const result = await ipc.activateGameMode()
                  setGameModeActive(true)
                  setGameModeResult(result)
                }
              } catch {}
              setGameModeActivating(false)
              /* Refresh power profiles */
              ipc.listPowerProfiles().then(p => { if (Array.isArray(p)) setPowerProfiles(p) })
            }} disabled={gameModeActivating}
              style={{
                padding: '12px 28px', borderRadius: 50,
                border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 8,
                background: gameModeActive
                  ? 'linear-gradient(135deg, #ff6b35, #ff4444)'
                  : 'linear-gradient(135deg, var(--neon-cyan), var(--neon-teal))',
                color: '#fff',
                boxShadow: gameModeActive
                  ? '0 0 25px rgba(255, 107, 53, 0.4)'
                  : '0 0 20px rgba(0, 242, 255, 0.3)',
                transition: 'all 0.3s',
              }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                {gameModeActivating ? 'progress_activity' : gameModeActive ? 'power_settings_new' : 'rocket_launch'}
              </span>
              {gameModeActivating
                ? (isRu ? 'Подождите...' : 'Please wait...')
                : gameModeActive
                  ? (isRu ? 'Выключить' : 'Deactivate')
                  : (isRu ? 'Активировать' : 'Activate')}
            </button>
          </div>

          {/* Result */}
          {gameModeResult && gameModeActive && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12
            }}>
              <div style={{
                padding: '12px 16px', borderRadius: 12,
                background: 'var(--badge-success-bg)', border: '1px solid var(--badge-success-border)'
              }}>
                <div style={{ fontSize: 10, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {isRu ? 'Освобождено RAM' : 'RAM Freed'}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--badge-success-text)', marginTop: 4 }}>
                  {gameModeResult.freedMB || 0} MB
                </div>
              </div>

              <div style={{
                padding: '12px 16px', borderRadius: 12,
                background: 'var(--badge-success-bg)', border: '1px solid var(--badge-success-border)'
              }}>
                <div style={{ fontSize: 10, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {isRu ? 'Процессов остановлено' : 'Processes Killed'}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--badge-success-text)', marginTop: 4 }}>
                  {gameModeResult.killedProcesses?.length || 0}
                </div>
              </div>

              {gameModeResult.killedProcesses?.length > 0 && (
                <div style={{
                  padding: '12px 16px', borderRadius: 12,
                  background: 'var(--card-inset-bg)', border: '1px solid var(--card-inset-border)',
                  gridColumn: '1 / -1'
                }}>
                  <div style={{ fontSize: 10, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    {isRu ? 'Остановленные процессы' : 'Stopped processes'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {gameModeResult.killedProcesses.map((p: string, i: number) => (
                      <span key={i} style={{
                        padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: 'var(--badge-danger-bg)', color: 'var(--badge-danger-text)',
                        border: '1px solid var(--badge-danger-border)'
                      }}>{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* pulse-gm animation is in animations.css */}
    </div>
  )
}

export default PerformanceOptimizer
