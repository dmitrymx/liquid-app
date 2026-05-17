/**
 * Tools Page — Uninstaller, Disk Analyzer, Scheduled Cleaning
 */
import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '../lib/ipc'

/* ============ UNINSTALLER ============ */
interface InstalledApp {
  DisplayName: string
  Publisher: string
  InstallDate: string
  Size: number
  UninstallString: string
  DisplayVersion: string
}

const Uninstaller: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { i18n } = useTranslation()
  const isRu = i18n.language === 'ru'
  const [apps, setApps] = useState<InstalledApp[]>([])
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'size'>('name')
  const [uninstalling, setUninstalling] = useState<string | null>(null)
  const [confirmApp, setConfirmApp] = useState<InstalledApp | null>(null)

  useEffect(() => {
    ipc.listApps().then((data: any) => {
      if (Array.isArray(data)) {
        setApps(data.filter((a: any) => a.DisplayName))
      }
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const filteredApps = useMemo(() => {
    let list = apps.filter(a =>
      a.DisplayName?.toLowerCase().includes(search.toLowerCase()) ||
      a.Publisher?.toLowerCase().includes(search.toLowerCase())
    )
    if (sortBy === 'size') {
      list.sort((a, b) => (b.Size || 0) - (a.Size || 0))
    } else {
      list.sort((a, b) => (a.DisplayName || '').localeCompare(b.DisplayName || ''))
    }
    return list
  }, [apps, search, sortBy])

  const handleUninstall = async (app: InstalledApp) => {
    if (!app.UninstallString) return
    setConfirmApp(null)
    setUninstalling(app.DisplayName)
    await ipc.uninstallApp(app.UninstallString)
    setUninstalling(null)
    // Refresh list
    const data = await ipc.listApps()
    if (Array.isArray(data)) setApps(data.filter((a: any) => a.DisplayName))
  }

  const formatSize = (kb: number) => {
    if (!kb) return '—'
    if (kb > 1048576) return `${(kb / 1048576).toFixed(1)} GB`
    if (kb > 1024) return `${(kb / 1024).toFixed(1)} MB`
    return `${kb} KB`
  }

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="glass-btn-ghost" onClick={onBack} style={{ padding: '8px 12px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
        </button>
        <h2 style={{ fontSize: 28, fontWeight: 600, flex: 1 }}>
          {isRu ? 'Деинсталлятор' : 'Uninstaller'}
        </h2>
        <span style={{ fontSize: 13, color: 'var(--outline)' }}>
          {apps.length} {isRu ? 'программ' : 'apps'}
        </span>
      </div>

      {/* Search + Sort */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 'var(--gutter)' }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px', borderRadius: 'var(--radius)',
          background: 'var(--surface-container)', border: '1px solid var(--outline-variant)'
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--outline)' }}>search</span>
          <input
            type="text"
            placeholder={isRu ? 'Поиск программ...' : 'Search apps...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--on-surface)', fontSize: 14
            }}
          />
        </div>
        <button
          className={`glass-btn-ghost ${sortBy === 'size' ? '' : ''}`}
          onClick={() => setSortBy(s => s === 'name' ? 'size' : 'name')}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>sort</span>
          {sortBy === 'size' ? (isRu ? 'По размеру' : 'By Size') : (isRu ? 'По имени' : 'By Name')}
        </button>
      </div>

      {/* App list */}
      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {!loaded ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 14, color: 'var(--outline)' }}>
            {isRu ? 'Загрузка списка программ...' : 'Loading programs...'}
          </div>
        ) : (
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {filteredApps.map((app, i) => (
              <div
                key={`${app.DisplayName}-${i}`}
                className="glass-row"
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--outline-variant)',
                  borderRadius: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--on-surface)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {app.DisplayName}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--outline)', marginTop: 2 }}>
                    {app.Publisher || '—'} {app.DisplayVersion ? `· v${app.DisplayVersion}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--neon-cyan)', minWidth: 60, textAlign: 'right' }}>
                    {formatSize(app.Size)}
                  </span>
                  <button
                    className="glass-btn-ghost"
                    onClick={() => setConfirmApp(app)}
                    disabled={!!uninstalling || !app.UninstallString}
                    style={{ padding: '6px 12px', fontSize: 12 }}
                  >
                    {uninstalling === app.DisplayName
                      ? (isRu ? '...' : '...')
                      : (isRu ? 'Удалить' : 'Remove')
                    }
                  </button>
                </div>
              </div>
            ))}
            {filteredApps.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', fontSize: 14, color: 'var(--outline)' }}>
                {isRu ? 'Ничего не найдено' : 'Nothing found'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Uninstall Confirmation Modal */}
      {confirmApp && (
        <>
          <div className="modal-backdrop" onClick={() => setConfirmApp(null)} />
          <div className="modal-content">
            <div className="glass-panel liquid-glass-high" style={{ padding: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--status-warning)' }}>warning</span>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>
                  {isRu ? 'Подтвердите удаление' : 'Confirm Uninstall'}
                </h2>
              </div>
              <p style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginBottom: 8 }}>
                {isRu ? 'Вы уверены, что хотите удалить:' : 'Are you sure you want to remove:'}
              </p>
              <div style={{
                fontSize: 16, fontWeight: 600, color: 'var(--on-surface)',
                padding: '12px 16px', borderRadius: 'var(--radius)',
                background: 'var(--surface-container)', marginBottom: 24
              }}>
                {confirmApp.DisplayName}
                {confirmApp.Publisher && (
                  <div style={{ fontSize: 12, color: 'var(--outline)', marginTop: 4 }}>
                    {confirmApp.Publisher} {confirmApp.DisplayVersion ? `· v${confirmApp.DisplayVersion}` : ''}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button className="glass-btn-ghost" onClick={() => setConfirmApp(null)}>
                  {isRu ? 'Отмена' : 'Cancel'}
                </button>
                <button className="glass-btn-primary" onClick={() => handleUninstall(confirmApp)}
                  style={{ background: 'rgba(255, 80, 80, 0.2)', borderColor: 'rgba(255, 80, 80, 0.4)' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete_forever</span>
                  {isRu ? 'Удалить' : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ============ DISK ANALYZER — CrystalDiskInfo-style ============ */
const DiskAnalyzer: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { i18n } = useTranslation()
  const isRu = i18n.language === 'ru'
  const [disks, setDisks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDisk, setSelectedDisk] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError(null)
    ipc.getDiskDetails().then((data: any) => {
      if (data && !data.error && Array.isArray(data)) {
        setDisks(data)
      } else if (data?.error) {
        setError(data.error)
      } else {
        setError(isRu ? 'Не удалось получить данные' : 'Failed to get disk data')
      }
      setLoading(false)
    }).catch(err => {
      setError(String(err))
      setLoading(false)
    })
  }, [])

  const disk = disks[selectedDisk]

  const getHealthColor = (pct: number) =>
    pct >= 80 ? '#15ffd1' : pct >= 50 ? '#ffbe3c' : '#ff5555'

  const getHealthLabel = (pct: number) =>
    pct >= 80 ? (isRu ? 'Отличное' : 'Good')
    : pct >= 50 ? (isRu ? 'Внимание' : 'Caution')
    : (isRu ? 'Критическое' : 'Bad')

  const getTempColor = (t: number | null) => {
    if (t === null) return 'var(--outline)'
    if (t <= 40) return '#15ffd1'
    if (t <= 55) return '#ffbe3c'
    return '#ff5555'
  }

  const getDiskIcon = (type: string) => {
    const t = (type || '').toLowerCase()
    if (t.includes('nvme')) return 'developer_board'
    if (t.includes('ssd')) return 'sd_storage'
    return 'hard_drive'
  }

  const formatPowerOnHours = (hours: number | null) => {
    if (hours === null || hours === undefined) return '—'
    const days = Math.floor(hours / 24)
    const yrs = Math.floor(days / 365)
    const remDays = days % 365
    if (yrs > 0) return `${yrs} ${isRu ? 'г' : 'y'} ${remDays} ${isRu ? 'д' : 'd'} (${hours.toLocaleString()} ${isRu ? 'ч' : 'h'})`
    return `${days} ${isRu ? 'дней' : 'days'} (${hours.toLocaleString()} ${isRu ? 'ч' : 'h'})`
  }

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="glass-btn-ghost" onClick={onBack} style={{ padding: '8px 12px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
        </button>
        <h2 style={{ fontSize: 28, fontWeight: 600 }}>{isRu ? 'Анализ дисков' : 'Disk Analyzer'}</h2>
        <span style={{ fontSize: 12, color: 'var(--outline)', marginLeft: 'auto' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle' }}>developer_board</span>
          {' '}CrystalDiskInfo-style
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--neon-cyan)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
          <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginTop: 16 }}>
            {isRu ? 'Сбор SMART данных...' : 'Collecting SMART data...'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--outline)', marginTop: 6 }}>
            {isRu ? 'Запрос к контроллерам дисков (требуется Admin)' : 'Querying disk controllers (Admin required)'}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="glass-panel" style={{ padding: '24px', borderColor: 'rgba(255,80,80,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#ff5555' }}>
            <span className="material-symbols-outlined">error</span>
            <span style={{ fontWeight: 600 }}>{error}</span>
          </div>
        </div>
      )}

      {!loading && !error && disks.length > 0 && (
        <>
          {/* Disk Selector Tabs */}
          {disks.length > 1 && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              {disks.map((d, i) => (
                <button
                  key={i}
                  className={`glass-panel glass-card-interactive ${selectedDisk === i ? '' : ''}`}
                  onClick={() => setSelectedDisk(i)}
                  style={{
                    padding: '14px 24px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    borderColor: selectedDisk === i ? 'rgba(0, 242, 255, 0.4)' : undefined,
                    background: selectedDisk === i ? 'rgba(0, 242, 255, 0.06)' : undefined,
                    flex: 1,
                    minWidth: 200
                  }}
                >
                  <span className="material-symbols-outlined" style={{
                    fontSize: 22,
                    color: selectedDisk === i ? 'var(--neon-cyan)' : 'var(--outline)'
                  }}>{getDiskIcon(d.type)}</span>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{
                      fontSize: 14, fontWeight: 600,
                      color: selectedDisk === i ? 'var(--neon-cyan)' : 'var(--on-surface)'
                    }}>
                      {d.name || `Disk ${i}`}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--outline)' }}>
                      {d.type} · {d.interfaceType} · {formatSize(d.size)}
                    </div>
                  </div>
                  {/* Mini health dot */}
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', marginLeft: 'auto',
                    background: getHealthColor(d.healthPct),
                    boxShadow: `0 0 8px ${getHealthColor(d.healthPct)}60`
                  }} />
                </button>
              ))}
            </div>
          )}

          {disk && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gutter)' }}>

              {/* ===== HEALTH STATUS CARD ===== */}
              <div className="glass-panel" style={{
                padding: '32px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {/* Health Ring */}
                <div style={{ position: 'relative', width: 160, height: 160, marginBottom: 20 }}>
                  <svg viewBox="0 0 160 160" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                    <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                    <circle
                      cx="80" cy="80" r="70"
                      fill="none"
                      stroke={getHealthColor(disk.healthPct)}
                      strokeWidth="8"
                      strokeDasharray={`${(disk.healthPct / 100) * 440} 440`}
                      strokeLinecap="round"
                      style={{ filter: `drop-shadow(0 0 6px ${getHealthColor(disk.healthPct)}60)` }}
                    />
                  </svg>
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center'
                  }}>
                    <div style={{ fontSize: 36, fontWeight: 800, color: getHealthColor(disk.healthPct) }}>
                      {disk.healthPct}%
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: getHealthColor(disk.healthPct), textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {getHealthLabel(disk.healthPct)}
                    </div>
                  </div>
                </div>

                {/* SMART Status Badge */}
                <div style={{
                  padding: '6px 16px',
                  borderRadius: 'var(--radius-full)',
                  background: `${getHealthColor(disk.healthPct)}15`,
                  border: `1px solid ${getHealthColor(disk.healthPct)}30`,
                  fontSize: 12,
                  fontWeight: 600,
                  color: getHealthColor(disk.healthPct),
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    {disk.healthPct >= 80 ? 'verified' : disk.healthPct >= 50 ? 'warning' : 'dangerous'}
                  </span>
                  S.M.A.R.T.: {disk.smartStatus || 'N/A'}
                </div>

                {/* Temperature */}
                {disk.temperature !== null && (
                  <div style={{
                    marginTop: 20,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 20px',
                    borderRadius: 'var(--radius)',
                    background: 'rgba(0,0,0,0.15)'
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: getTempColor(disk.temperature) }}>thermostat</span>
                    <span style={{ fontSize: 22, fontWeight: 700, color: getTempColor(disk.temperature) }}>
                      {disk.temperature}°C
                    </span>
                  </div>
                )}
              </div>

              {/* ===== DISK INFO GRID ===== */}
              <div className="glass-panel" style={{ padding: '28px' }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: 'var(--neon-cyan)', marginBottom: 16,
                  display: 'flex', alignItems: 'center', gap: 6
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{getDiskIcon(disk.type)}</span>
                  {isRu ? 'Информация о диске' : 'Drive Information'}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <InfoRow label={isRu ? 'Модель' : 'Model'} value={disk.model} />
                  <InfoRow label={isRu ? 'Производитель' : 'Vendor'} value={disk.vendor || '—'} />
                  <InfoRow label={isRu ? 'Серийный номер' : 'Serial Number'} value={disk.serialNumber || '—'} mono />
                  <InfoRow label="Firmware" value={disk.firmwareRevision || '—'} mono />
                  <InfoRow label={isRu ? 'Тип' : 'Type'} value={disk.type || '—'} highlight />
                  <InfoRow label={isRu ? 'Интерфейс' : 'Interface'} value={disk.interfaceType || '—'} highlight />
                  <InfoRow label={isRu ? 'Объём' : 'Capacity'} value={formatSize(disk.size)} highlight />
                </div>
              </div>

              {/* ===== SMART METRICS ===== */}
              <div className="glass-panel" style={{ padding: '28px', gridColumn: '1 / -1' }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: 'var(--neon-cyan)', marginBottom: 20,
                  display: 'flex', alignItems: 'center', gap: 6
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>monitoring</span>
                  S.M.A.R.T. {isRu ? 'Мониторинг' : 'Monitoring'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                  {/* Power On Hours */}
                  <MetricCard
                    icon="schedule"
                    label={isRu ? 'Время работы' : 'Power On Hours'}
                    value={formatPowerOnHours(disk.powerOnHours)}
                    color="var(--neon-cyan)"
                  />

                  {/* Temperature */}
                  <MetricCard
                    icon="thermostat"
                    label={isRu ? 'Температура' : 'Temperature'}
                    value={disk.temperature !== null ? `${disk.temperature}°C` : '—'}
                    color={getTempColor(disk.temperature)}
                  />

                  {/* Wear Level */}
                  <MetricCard
                    icon="battery_horiz_075"
                    label={isRu ? 'Износ' : 'Wear Level'}
                    value={disk.wear !== null ? `${disk.wear}%` : '—'}
                    color={disk.wear !== null ? (disk.wear <= 10 ? '#15ffd1' : disk.wear <= 50 ? '#ffbe3c' : '#ff5555') : 'var(--outline)'}
                    bar={disk.wear !== null ? disk.wear : undefined}
                    barColor={disk.wear !== null ? (disk.wear <= 10 ? '#15ffd1' : disk.wear <= 50 ? '#ffbe3c' : '#ff5555') : undefined}
                  />

                  {/* Health */}
                  <MetricCard
                    icon="health_and_safety"
                    label={isRu ? 'Здоровье' : 'Health'}
                    value={`${disk.healthPct}%`}
                    color={getHealthColor(disk.healthPct)}
                    bar={disk.healthPct}
                    barColor={getHealthColor(disk.healthPct)}
                  />

                  {/* Read Errors */}
                  <MetricCard
                    icon="error_outline"
                    label={isRu ? 'Ошибки чтения' : 'Read Errors'}
                    value={disk.readErrors?.toString() ?? '—'}
                    color={disk.readErrors > 0 ? '#ff5555' : '#15ffd1'}
                  />

                  {/* Write Errors */}
                  <MetricCard
                    icon="edit_off"
                    label={isRu ? 'Ошибки записи' : 'Write Errors'}
                    value={disk.writeErrors?.toString() ?? '—'}
                    color={disk.writeErrors > 0 ? '#ff5555' : '#15ffd1'}
                  />
                </div>
              </div>

              {/* ===== PARTITIONS ===== */}
              {disk.partitions && disk.partitions.length > 0 && (
                <div className="glass-panel" style={{ padding: '28px', gridColumn: '1 / -1' }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                    color: 'var(--neon-cyan)', marginBottom: 16,
                    display: 'flex', alignItems: 'center', gap: 6
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>pie_chart</span>
                    {isRu ? 'Разделы' : 'Partitions'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                    {disk.partitions.map((p: any, i: number) => (
                      <div key={i} style={{
                        padding: '16px',
                        borderRadius: 'var(--radius)',
                        background: 'rgba(0,0,0,0.15)',
                        border: '1px solid rgba(255,255,255,0.04)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-surface)' }}>{p.mount}</span>
                          <span style={{
                            fontSize: 13, fontWeight: 600,
                            color: p.usage > 80 ? '#ff5555' : p.usage > 60 ? '#ffbe3c' : 'var(--neon-cyan)'
                          }}>
                            {Math.round(p.usage)}%
                          </span>
                        </div>
                        <div className="glass-progress-track" style={{ marginBottom: 8 }}>
                          <div className="glass-progress-fill" style={{
                            width: `${p.usage}%`,
                            background: p.usage > 80 ? '#ff5555' : p.usage > 60 ? '#ffbe3c' : undefined
                          }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--outline)' }}>
                          <span>{isRu ? 'Использовано' : 'Used'}: {formatSize(p.used)}</span>
                          <span>{isRu ? 'Свободно' : 'Free'}: {formatSize(p.available)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* No disks */}
      {!loading && !error && disks.length === 0 && (
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--outline)' }}>hard_drive</span>
          <div style={{ fontSize: 14, color: 'var(--outline)', marginTop: 16 }}>
            {isRu ? 'Диски не обнаружены' : 'No disks found'}
          </div>
        </div>
      )}
    </div>
  )
}

/* Metric Card for SMART data */
const MetricCard: React.FC<{
  icon: string; label: string; value: string; color: string;
  bar?: number; barColor?: string
}> = ({ icon, label, value, color, bar, barColor }) => (
  <div style={{
    padding: '16px',
    borderRadius: 'var(--radius)',
    background: 'rgba(0,0,0,0.15)',
    border: '1px solid rgba(255,255,255,0.04)'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 18, color }}>{icon}</span>
      <span style={{ fontSize: 11, color: 'var(--outline)', fontWeight: 500 }}>{label}</span>
    </div>
    <div style={{ fontSize: 18, fontWeight: 700, color, marginBottom: bar !== undefined ? 8 : 0 }}>
      {value}
    </div>
    {bar !== undefined && (
      <div style={{
        width: '100%', height: 4, borderRadius: 2,
        background: 'rgba(255,255,255,0.06)', overflow: 'hidden'
      }}>
        <div style={{
          width: `${Math.min(bar, 100)}%`, height: '100%', borderRadius: 2,
          background: barColor || color,
          transition: 'width 0.6s ease'
        }} />
      </div>
    )}
  </div>
)

/* Info Row for disk details */
const InfoRow: React.FC<{
  label: string; value: string; mono?: boolean; highlight?: boolean
}> = ({ label, value, mono, highlight }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '9px 0',
    borderBottom: '1px solid rgba(255,255,255,0.04)'
  }}>
    <span style={{ fontSize: 12, color: 'var(--outline)' }}>{label}</span>
    <span style={{
      fontSize: 13,
      fontWeight: highlight ? 600 : 500,
      color: highlight ? 'var(--neon-cyan)' : 'var(--on-surface)',
      fontFamily: mono ? 'monospace' : 'inherit',
      textAlign: 'right',
      maxWidth: '60%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }}>
      {value}
    </span>
  </div>
)

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

/* ============ SCHEDULED CLEANING ============ */
const ScheduledCleaning: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { i18n } = useTranslation()
  const isRu = i18n.language === 'ru'
  const [interval, setInterval_] = useState('weekly')
  const [categories, setCategories] = useState({
    temp: true,
    browser_cache: true,
    junk: true,
    recycle_bin: false,
    registry: false
  })
  const [saved, setSaved] = useState(false)

  const save = () => {
    // Save to localStorage (or could use electron-store)
    localStorage.setItem('scheduledCleaning', JSON.stringify({ interval, categories, enabled: true }))
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const intervals = [
    { id: 'daily', label: isRu ? 'Ежедневно' : 'Daily', icon: 'today' },
    { id: 'weekly', label: isRu ? 'Еженедельно' : 'Weekly', icon: 'date_range' },
    { id: 'monthly', label: isRu ? 'Ежемесячно' : 'Monthly', icon: 'calendar_month' },
  ]

  const catNames: Record<string, string> = {
    temp: isRu ? 'Временные файлы' : 'Temp files',
    browser_cache: isRu ? 'Кэш браузеров' : 'Browser cache',
    junk: isRu ? 'Мусорные файлы' : 'Junk files',
    recycle_bin: isRu ? 'Корзина' : 'Recycle bin',
    registry: isRu ? 'Ошибки реестра' : 'Registry issues',
  }

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="glass-btn-ghost" onClick={onBack} style={{ padding: '8px 12px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
        </button>
        <h2 style={{ fontSize: 28, fontWeight: 600 }}>{isRu ? 'Плановая очистка' : 'Scheduled Cleaning'}</h2>
      </div>

      {/* Interval selector */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: 'var(--gutter)' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--on-surface)' }}>
          {isRu ? 'Интервал очистки' : 'Cleaning Interval'}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {intervals.map(iv => (
            <div
              key={iv.id}
              className="glass-panel glass-card-interactive"
              onClick={() => setInterval_(iv.id)}
              style={{
                flex: 1, padding: '20px', textAlign: 'center', cursor: 'pointer',
                borderColor: interval === iv.id ? 'rgba(0, 242, 255, 0.3)' : undefined,
                background: interval === iv.id ? 'rgba(0, 242, 255, 0.05)' : undefined
              }}
            >
              <span className="material-symbols-outlined" style={{
                fontSize: 28, display: 'block', marginBottom: 8,
                color: interval === iv.id ? 'var(--neon-cyan)' : 'var(--outline)'
              }}>{iv.icon}</span>
              <div style={{
                fontSize: 14, fontWeight: interval === iv.id ? 600 : 400,
                color: interval === iv.id ? 'var(--neon-cyan)' : 'var(--on-surface)'
              }}>{iv.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Category checkboxes */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: 'var(--gutter)' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--on-surface)' }}>
          {isRu ? 'Что очищать' : 'What to clean'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Object.entries(categories).map(([key, enabled]) => (
            <div
              key={key}
              className="glass-row"
              onClick={() => setCategories(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
              style={{ cursor: 'pointer', padding: '12px 16px' }}
            >
              <span style={{ fontSize: 14, color: 'var(--on-surface)' }}>{catNames[key]}</span>
              <div style={{
                width: 20, height: 20, borderRadius: 6,
                border: `2px solid ${enabled ? 'var(--neon-cyan)' : 'var(--outline-variant)'}`,
                background: enabled ? 'rgba(0, 242, 255, 0.2)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {enabled && <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--neon-cyan)' }}>check</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        {saved && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--neon-teal)', fontSize: 14, fontWeight: 500 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
            {isRu ? 'Сохранено!' : 'Saved!'}
          </div>
        )}
        <button className="glass-btn-primary" onClick={save} style={{ padding: '14px 40px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
          {isRu ? 'Сохранить настройки' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

/* ============ TOOLS HUB ============ */
const toolCards = [
  { icon: 'delete_forever', key: 'uninstaller', descKey: 'uninstallerDesc', color: 'var(--neon-cyan)', id: 'uninstaller' },
  { icon: 'pie_chart', key: 'diskAnalyzer', descKey: 'diskAnalyzerDesc', color: 'var(--neon-teal)', id: 'disk' },
  { icon: 'event_repeat', key: 'scheduledCleaning', descKey: 'scheduledDesc', color: 'var(--neon-blue)', id: 'scheduled' },
]

const Tools: React.FC = () => {
  const { t } = useTranslation()
  const [activeTool, setActiveTool] = useState<string | null>(null)

  if (activeTool === 'uninstaller') return <Uninstaller onBack={() => setActiveTool(null)} />
  if (activeTool === 'disk') return <DiskAnalyzer onBack={() => setActiveTool(null)} />
  if (activeTool === 'scheduled') return <ScheduledCleaning onBack={() => setActiveTool(null)} />

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1200 }}>
      <div className="page-header">
        <h1>{t('tools.title')}</h1>
        <p>{t('tools.subtitle')}</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 'var(--gutter)' }}>
        {toolCards.map(tool => (
          <div key={tool.key} className="glass-panel glass-card-interactive hover-lift"
            style={{ padding: '32px', cursor: 'pointer' }}
            onClick={() => setActiveTool(tool.id)}
          >
            <div style={{
              width: 56, height: 56, borderRadius: 'var(--radius-md)',
              background: 'rgba(0, 242, 255, 0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20, border: '1px solid rgba(0, 242, 255, 0.1)'
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: tool.color }}>{tool.icon}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--on-surface)' }}>
              {t(`tools.${tool.key}`)}
            </div>
            <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
              {t(`tools.${tool.descKey}`)}
            </div>
            <div style={{
              marginTop: 20, display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 600, color: tool.color
            }}>
              <span>{t('common.open') || 'Открыть'}</span>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Tools
