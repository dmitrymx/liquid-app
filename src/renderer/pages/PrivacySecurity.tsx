/**
 * Privacy & Security Page — Real browser data scanning & cleaning
 * 4 granular categories with warnings
 */
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '../lib/ipc'
import { formatBytes } from '../lib/formatters'

interface PrivacyCategory {
  id: string
  name: string
  nameRu: string
  icon: string
  count: number
  size: number
  selected: boolean
  warning?: string
  warningRu?: string
}

const PrivacySecurity: React.FC = () => {
  const { t, i18n } = useTranslation()
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanStep, setScanStep] = useState('')
  const [scanned, setScanned] = useState(false)
  const [categories, setCategories] = useState<PrivacyCategory[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [totalSize, setTotalSize] = useState(0)
  const [cleaning, setCleaning] = useState(false)
  const [cleanProgress, setCleanProgress] = useState(0)
  const [cleanStep, setCleanStep] = useState('')
  const [cleanResult, setCleanResult] = useState<any>(null)

  const scan = async () => {
    setScanning(true)
    setScanned(false)
    setCleanResult(null)
    setScanProgress(0)

    const steps = isRu
      ? ['Cookies браузеров...', 'История посещений...', 'Недавние файлы...', 'Диагностика...']
      : ['Browser cookies...', 'Browser history...', 'Recent files...', 'Diagnostics...']
    let si = 0
    setScanStep(steps[0])
    const timer = setInterval(() => {
      si = Math.min(si + 1, steps.length - 1)
      setScanStep(steps[si])
      setScanProgress(prev => Math.min(prev + (90 - prev) * 0.2, 90))
    }, 600)

    const result = await ipc.scanPrivacy()
    clearInterval(timer)
    setScanProgress(100)
    setScanStep(isRu ? 'Готово!' : 'Done!')
    if (result && !result.error) {
      setCategories(result.categories || [])
      setTotalCount(result.totalCount || 0)
      setTotalSize(result.totalSize || 0)
      setScanned(true)
    }
    setScanning(false)
  }

  const toggleCategory = (id: string) => {
    setCategories(prev => prev.map(c =>
      c.id === id ? { ...c, selected: !c.selected } : c
    ))
  }

  const clean = async () => {
    setCleaning(true)
    setCleanProgress(0)
    const targets = categories.filter(c => c.selected).map(c => c.id)
    const names = targets.map(id => catMeta[id]?.name || id)
    let ni = 0
    setCleanStep(names[0] || '')
    const timer = setInterval(() => {
      ni = Math.min(ni + 1, names.length - 1)
      setCleanStep(names[ni])
      setCleanProgress(prev => Math.min(prev + (85 - prev) * 0.25, 85))
    }, 1000)

    const result = await ipc.cleanPrivacy(targets)
    clearInterval(timer)
    setCleanProgress(100)
    setCleanStep(isRu ? 'Завершено!' : 'Complete!')
    setCleanResult(result)
    setCleaning(false)
    setTimeout(() => scan(), 800)
  }

  const isRu = i18n.language === 'ru'
  const catMeta: Record<string, { name: string; desc: string }> = {
    cookies: {
      name: isRu ? 'Cookies браузеров' : 'Browser Cookies',
      desc: isRu ? 'Cookie-файлы Chrome, Edge, Firefox' : 'Cookie files from Chrome, Edge, Firefox'
    },
    browser_history: {
      name: isRu ? 'История браузеров' : 'Browser History',
      desc: isRu ? 'История посещений, ярлыки поиска, часто посещаемые' : 'Browsing history, search shortcuts, top sites'
    },
    recent_files: {
      name: isRu ? 'Недавние файлы Windows' : 'Windows Recent Files',
      desc: isRu ? 'Список недавних файлов в Проводнике' : 'Recent files list in File Explorer'
    },
    sensitive: {
      name: isRu ? 'Диагностика и трекинг' : 'Diagnostics & Tracking',
      desc: isRu ? 'Дампы, диагностика, данные отслеживания' : 'Crash dumps, diagnostics, tracking data'
    }
  }

  const selectedCategories = categories.filter(c => c.selected && c.count > 0)

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1200 }}>
      <div className="page-header">
        <h1>{t('privacy.title')}</h1>
        <p>{t('privacy.subtitle')}</p>
      </div>

      {/* Summary */}
      <div className="glass-panel" style={{
        padding: '32px',
        marginBottom: 'var(--gutter)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--neon-cyan)', marginBottom: 8
          }}>
            {scanned ? (isRu ? 'Найдено элементов' : 'Items Found') : (isRu ? 'Приватность' : 'Privacy')}
          </div>
          <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--on-surface)', lineHeight: 1 }}>
            {scanned ? totalCount : '—'}
          </div>
          {scanned && (
            <div style={{ fontSize: 12, color: 'var(--outline)', marginTop: 8 }}>
              {isRu ? 'Размер:' : 'Size:'} {formatBytes(totalSize)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="glass-btn-ghost" onClick={scan} disabled={scanning || cleaning}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span>
            {scanning ? (isRu ? 'Сканирование...' : 'Scanning...') : (isRu ? 'Сканировать' : 'Scan')}
          </button>
          {scanned && selectedCategories.length > 0 && (
            <button className="glass-btn-primary" onClick={clean} disabled={cleaning}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>shield</span>
              {cleaning ? (isRu ? 'Очистка...' : 'Cleaning...') : (isRu ? 'Очистить выбранное' : 'Clean Selected')}
            </button>
          )}
        </div>
      </div>

      {/* Scanning progress */}
      {scanning && (
        <div className="glass-panel" style={{ padding: '20px 24px', marginBottom: 'var(--gutter)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--neon-cyan)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--neon-cyan)' }}>
                {isRu ? 'Сканирование...' : 'Scanning...'}
              </span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--outline)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(scanProgress)}%</span>
          </div>
          <div className="glass-progress-track" style={{ marginBottom: 8 }}>
            <div className="glass-progress-fill" style={{ width: `${scanProgress}%`, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--outline)' }}>fingerprint</span>
            {scanStep}
          </div>
        </div>
      )}

      {/* Cleaning progress */}
      {cleaning && (
        <div className="glass-panel" style={{ padding: '20px 24px', marginBottom: 'var(--gutter)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--neon-teal)', animation: 'spin 1s linear infinite' }}>cleaning_services</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--neon-teal)' }}>
                {isRu ? 'Очистка...' : 'Cleaning...'}
              </span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--outline)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(cleanProgress)}%</span>
          </div>
          <div className="glass-progress-track" style={{ marginBottom: 8 }}>
            <div className="glass-progress-fill" style={{ width: `${cleanProgress}%`, transition: 'width 0.5s ease', background: 'linear-gradient(90deg, var(--neon-teal), #15ffd1)' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--outline)' }}>shield</span>
            {cleanStep}
          </div>
        </div>
      )}

      {/* Clean result */}
      {cleanResult && (
        <div className="glass-panel" style={{
          padding: '16px 24px', marginBottom: 'var(--gutter)',
          display: 'flex', flexDirection: 'column', gap: 8,
          borderColor: 'rgba(21, 255, 209, 0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="material-symbols-outlined fill" style={{ color: 'var(--neon-teal)', fontSize: 20 }}>check_circle</span>
            <span style={{ color: 'var(--neon-teal)', fontWeight: 600 }}>
              {isRu ? 'Очищено' : 'Cleaned'}: {cleanResult.cleaned} {isRu ? 'элементов' : 'items'}
              {cleanResult.freedSize > 0 && ` — ${formatBytes(cleanResult.freedSize)}`}
            </span>
            {cleanResult.failed > 0 && (
              <span style={{ color: 'var(--status-warning)', fontSize: 13 }}>
                ({isRu ? 'ошибок' : 'failed'}: {cleanResult.failed})
              </span>
            )}
          </div>
          {cleanResult.browsersKilled && cleanResult.browsersKilled.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--outline)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--neon-cyan)' }}>info</span>
              {isRu ? `Закрыты браузеры: ${cleanResult.browsersKilled.join(', ')}` : `Closed browsers: ${cleanResult.browsersKilled.join(', ')}`}
            </div>
          )}
        </div>
      )}

      {/* Warnings for selected categories */}
      {scanned && categories.some(c => c.selected && (c.warning || c.warningRu)) && (
        <div style={{
          marginBottom: 'var(--gutter)', display: 'flex', flexDirection: 'column', gap: 8
        }}>
          {categories.filter(c => c.selected && (c.warning || c.warningRu)).map(c => (
            <div key={`warn-${c.id}`} style={{
              padding: '10px 16px', borderRadius: 'var(--radius)',
              background: 'rgba(255, 190, 60, 0.06)',
              border: '1px solid rgba(255, 190, 60, 0.15)',
              fontSize: 12, color: 'var(--status-warning)',
              display: 'flex', alignItems: 'center', gap: 8,
              fontWeight: 500
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
              {isRu ? c.warningRu : c.warning}
            </div>
          ))}
        </div>
      )}

      {/* Category Cards — 4 cards in 2x2 grid */}
      {scanned && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 'var(--gutter)'
        }}>
          {categories.map(cat => {
            const meta = catMeta[cat.id]
            return (
              <div
                key={cat.id}
                className="glass-panel glass-card-interactive"
                onClick={() => toggleCategory(cat.id)}
                style={{
                  padding: '28px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  borderColor: cat.selected ? 'rgba(0, 242, 255, 0.3)' : undefined,
                  opacity: cat.count === 0 ? 0.5 : 1
                }}
              >
                <span className="material-symbols-outlined" style={{
                  fontSize: 36, color: 'var(--neon-cyan)', marginBottom: 14, display: 'block'
                }}>{cat.icon}</span>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: 'var(--on-surface)' }}>
                  {meta?.name || cat.name}
                </div>
                <div style={{
                  fontSize: 32, fontWeight: 800, color: 'var(--neon-cyan)',
                  textShadow: '0 0 15px rgba(0, 242, 255, 0.3)'
                }}>
                  {cat.count}
                </div>
                <div style={{ fontSize: 11, color: 'var(--outline)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {isRu ? 'элементов' : 'items'} · {formatBytes(cat.size)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 8 }}>
                  {meta?.desc || ''}
                </div>
                {/* Checkbox */}
                <div style={{
                  marginTop: 14, display: 'flex', justifyContent: 'center', gap: 6, alignItems: 'center'
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 6,
                    border: `2px solid ${cat.selected ? 'var(--neon-cyan)' : 'var(--outline-variant)'}`,
                    background: cat.selected ? 'rgba(0, 242, 255, 0.2)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s'
                  }}>
                    {cat.selected && (
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--neon-cyan)' }}>check</span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: cat.selected ? 'var(--neon-cyan)' : 'var(--outline)' }}>
                    {cat.selected ? (isRu ? 'Выбрано' : 'Selected') : (isRu ? 'Не выбрано' : 'Not selected')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default PrivacySecurity
