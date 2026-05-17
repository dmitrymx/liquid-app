/**
 * Smart Cleaner Page
 * Based on Stitch mockup: scan summary + category cards + confirmation modal
 */
import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '../lib/ipc'
import { formatBytes } from '../lib/formatters'

interface Category {
  id: string
  name: string
  nameRu: string
  icon: string
  totalSize: number
  selected: boolean
  files: any[]
  count?: number
}

/** Folder paths for "Open in Explorer" per category */
const CATEGORY_FOLDERS: Record<string, string> = {
  temp: '%TEMP%',
  browser_cache: '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Cache',
  junk: '%LOCALAPPDATA%\\CrashDumps',
  recycle_bin: 'shell:RecycleBinFolder',
  windows_update: 'C:\\Windows\\SoftwareDistribution\\Download',
}

interface RegIssue {
  id: string
  key: string
  valueName: string
  type: string
  description: string
  severity: 'low' | 'medium' | 'high'
  selected: boolean
}

const ISSUE_TYPE_LABELS: Record<string, { ru: string; en: string; icon: string }> = {
  orphaned_uninstall: { ru: 'Остатки после удаления программ', en: 'Orphaned uninstall entries', icon: 'delete_forever' },
  broken_path: { ru: 'Несуществующие пути', en: 'Broken paths', icon: 'link_off' },
  obsolete_startup: { ru: 'Автозагрузка: файл не найден', en: 'Obsolete startup entries', icon: 'play_disabled' },
  stale_mru: { ru: 'Устаревший MUI кэш', en: 'Stale MUI cache', icon: 'cached' },
  stale_shared_dll: { ru: 'Устаревшие SharedDLLs', en: 'Stale SharedDLLs', icon: 'broken_image' },
}

const SEVERITY_COLORS = { high: '#ff5555', medium: '#ffaa00', low: '#88cc88' }
const SEVERITY_LABELS = { high: { ru: 'Высокий', en: 'High' }, medium: { ru: 'Средний', en: 'Medium' }, low: { ru: 'Низкий', en: 'Low' } }

/* Scan step labels for progress animation */
const SCAN_STEPS_RU = ['Временные файлы...', 'Кэш браузеров...', 'Мусорные файлы...', 'Корзина...', 'Обновления Windows...', 'Реестр: Uninstall...', 'Реестр: App Paths...', 'Реестр: MUI Cache...', 'Реестр: автозагрузка...', 'Реестр: SharedDLLs...']
const SCAN_STEPS_EN = ['Temp files...', 'Browser cache...', 'Junk files...', 'Recycle Bin...', 'Windows Update...', 'Registry: Uninstall...', 'Registry: App Paths...', 'Registry: MUI Cache...', 'Registry: Startup...', 'Registry: SharedDLLs...']

const SmartCleaner: React.FC = () => {
  const { t, i18n } = useTranslation()
  const isRu = i18n.language === 'ru'
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanStep, setScanStep] = useState('')
  const [scanDuration, setScanDuration] = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [totalSize, setTotalSize] = useState(0)
  const [showConfirm, setShowConfirm] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [cleanStep, setCleanStep] = useState('')
  const [cleanProgress, setCleanProgress] = useState(0)
  const [cleanResult, setCleanResult] = useState<any>(null)
  const [scanDone, setScanDone] = useState(false)
  const [expandedCat, setExpandedCat] = useState<string | null>(null)

  /* Registry issues with individual selection */
  const [regIssues, setRegIssues] = useState<RegIssue[]>([])
  const [showRegDetail, setShowRegDetail] = useState(false)
  const [regCleaning, setRegCleaning] = useState(false)
  const [regResult, setRegResult] = useState<any>(null)

  const [scanError, setScanError] = useState<string | null>(null)

  const scan = async () => {
    setScanning(true)
    setScanDone(false)
    setCleanResult(null)
    setRegResult(null)
    setScanError(null)
    setScanProgress(0)
    setScanStep(isRu ? 'Подготовка...' : 'Preparing...')
    const startTime = Date.now()

    /* Animate scan progress with step labels */
    const steps = isRu ? SCAN_STEPS_RU : SCAN_STEPS_EN
    let stepIdx = 0
    const progressTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, steps.length - 1)
      setScanStep(steps[stepIdx])
      setScanProgress(prev => Math.min(prev + (90 - prev) * 0.15, 90))
    }, 800)

    try {
      const result = await ipc.scanSystem()
      clearInterval(progressTimer)
      setScanProgress(100)
      setScanStep(isRu ? 'Готово!' : 'Done!')
      setScanDuration(Date.now() - startTime)
      if (result && !result.error) {
        setCategories(result.categories || [])
        setTotalSize(result.totalSize || 0)
        const issues: RegIssue[] = (result.registryIssues || []).map((r: any, i: number) => ({
          ...r,
          id: r.id || `reg_${i}`,
          selected: true
        }))
        setRegIssues(issues)
        setScanDone(true)
      } else {
        setScanError(result?.error || (isRu ? 'Ошибка сканирования' : 'Scan failed'))
      }
    } catch (err) {
      clearInterval(progressTimer)
      setScanError(String(err))
    }
    setScanning(false)
  }

  const toggleCategory = (id: string) => {
    setCategories(prev => prev.map(c =>
      c.id === id ? { ...c, selected: !c.selected } : c
    ))
  }

  const toggleRegIssue = (id: string) => {
    setRegIssues(prev => prev.map(r =>
      r.id === id ? { ...r, selected: !r.selected } : r
    ))
  }

  const toggleAllRegIssues = (selected: boolean) => {
    setRegIssues(prev => prev.map(r => ({ ...r, selected })))
  }

  /** Backup registry + clean only selected issues */
  const executeRegClean = async () => {
    const selected = regIssues.filter(r => r.selected)
    if (selected.length === 0) return
    setRegCleaning(true)
    /* Step 1: Backup */
    const backup = await ipc.backupRegistry(selected)
    /* Step 2: Clean */
    const result = await ipc.cleanRegistry(selected)
    setRegResult({ ...result, backupPath: (backup as any)?.backupPath })
    setRegCleaning(false)
    /* Re-scan */
    scan()
  }


  /** Open category folder in Explorer */
  const openCategoryFolder = async (catId: string) => {
    const folder = CATEGORY_FOLDERS[catId]
    if (!folder) return
    try { await ipc.openFolder(folder) } catch { /* ignore */ }
  }

  const executeClean = async () => {
    setShowConfirm(false)
    setCleaning(true)
    setCleanProgress(0)
    setCleanStep(isRu ? 'Подготовка...' : 'Preparing...')
    /* Only clean categories that have actual data — skip empty ones like Recycle Bin 0B */
    const targets = categories
      .filter(c => c.selected && c.id !== 'registry' && (c.totalSize > 0 || (c as any).count > 0))
      .map(c => c.id)

    if (targets.length === 0) {
      setCleaning(false)
      return
    }

    const result = await ipc.cleanFiles(targets)
    setCleanProgress(100)
    setCleanStep(isRu ? 'Завершено!' : 'Complete!')
    setCleanResult(result)
    setCleaning(false)
    /* Re-scan after cleaning to show actual remaining items */
    setTimeout(() => scan(), 1200)
  }

  const categoryMeta: Record<string, { icon: string; nameKey: string; descKey: string }> = {
    temp: { icon: 'folder_open', nameKey: 'cleaner.tempFiles', descKey: 'cleaner.tempDesc' },
    browser_cache: { icon: 'language', nameKey: 'cleaner.browserCache', descKey: 'cleaner.browserDesc' },
    junk: { icon: 'delete_sweep', nameKey: 'cleaner.junkFiles', descKey: 'cleaner.junkDesc' },
    recycle_bin: { icon: 'delete', nameKey: 'cleaner.recycleBin', descKey: 'cleaner.recycleBinDesc' },
    windows_update: { icon: 'system_update', nameKey: 'cleaner.windowsUpdate', descKey: 'cleaner.windowsUpdateDesc' },
    registry: { icon: 'settings_suggest', nameKey: 'cleaner.registry', descKey: 'cleaner.registryDesc' },
  }

  /* Real-time progress from backend */
  const categoryMetaRef = useRef(categoryMeta)
  categoryMetaRef.current = categoryMeta
  const [cleanDetail, setCleanDetail] = useState('')

  useEffect(() => {
    const cleanup = ipc.onCleanerProgress((data: any) => {
      if (data.status === 'start') {
        const meta = categoryMetaRef.current[data.categoryId]
        setCleanStep(meta ? t(meta.nameKey) : data.categoryId)
        setCleanDetail('')
      } else if (data.status === 'progress') {
        /* Intra-category updates with file counts */
        const detail = data.deleted != null
          ? `${data.deleted} ${isRu ? 'файлов удалено' : 'files deleted'}${data.freedBytes ? ` · ${formatBytes(data.freedBytes)}` : ''}`
          : ''
        setCleanDetail(detail)
      } else if (data.status === 'done') {
        setCleanDetail('')
      }
      setCleanProgress(data.percent ?? 0)
    })
    return cleanup
  }, [t, isRu])

  const selectedSize = categories.filter(c => c.selected).reduce((sum, c) => sum + c.totalSize, 0)
  const hasSelectedItems = selectedSize > 0 || categories.some(c => c.selected && (c as any).count > 0)

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1200 }}>
      <div className="page-header">
        <h1>{t('cleaner.title')}</h1>
        <p>{t('cleaner.subtitle')}</p>
      </div>

      {/* Summary Card */}
      <div className="glass-panel" style={{
        padding: '32px',
        marginBottom: 'var(--gutter)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--neon-cyan)',
            marginBottom: 8
          }}>
            {scanDone ? t('cleaner.scanComplete') : t('cleaner.estimatedRecovery')}
          </div>
          <div style={{
            fontSize: 48,
            fontWeight: 800,
            color: 'var(--on-surface)',
            lineHeight: 1,
            letterSpacing: '-0.03em'
          }}>
            {scanDone ? formatBytes(totalSize) : '—'}
          </div>
          {scanDone && (
            <div style={{ fontSize: 12, color: 'var(--outline)', marginTop: 8 }}>
              {categories.filter(c => c.totalSize > 0).length} {t('cleaner.scanProgress')}
              {scanDuration > 0 && <span style={{ marginLeft: 8, color: 'var(--neon-teal)' }}>({(scanDuration / 1000).toFixed(1)}s)</span>}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="glass-btn-ghost" onClick={scan} disabled={scanning || cleaning}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>radar</span>
            {scanning ? t('cleaner.scanning') : 'Scan'}
          </button>
          {scanDone && hasSelectedItems && (
            <button className="glass-btn-primary" onClick={() => setShowConfirm(true)} disabled={cleaning}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>cleaning_services</span>
              {cleaning ? t('cleaner.scanning') : t('cleaner.executePurge')}
            </button>
          )}
        </div>
      </div>

      {/* Scan error toast */}
      {scanError && (
        <div className="glass-panel" style={{
          padding: '16px 24px',
          marginBottom: 'var(--gutter)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderColor: 'rgba(255, 80, 80, 0.3)'
        }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--status-critical)', fontSize: 20 }}>error</span>
          <span style={{ color: 'var(--status-critical)', fontWeight: 600, fontSize: 13 }}>
            {isRu ? 'Ошибка сканирования' : 'Scan Error'}: {scanError}
          </span>
        </div>
      )}

      {/* Scanning progress */}
      {scanning && (
        <div className="glass-panel" style={{ padding: '20px 24px', marginBottom: 'var(--gutter)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--neon-cyan)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--neon-cyan)' }}>
                {isRu ? 'Сканирование системы...' : 'Scanning system...'}
              </span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--outline)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(scanProgress)}%</span>
          </div>
          <div className="glass-progress-track" style={{ marginBottom: 8 }}>
            <div className="glass-progress-fill" style={{ width: `${scanProgress}%`, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--outline)' }}>search</span>
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
                {isRu ? 'Очистка в процессе...' : 'Cleaning in progress...'}
              </span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--outline)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(cleanProgress)}%</span>
          </div>
          <div className="glass-progress-track" style={{ marginBottom: 8 }}>
            <div className="glass-progress-fill" style={{ width: `${cleanProgress}%`, transition: 'width 0.5s ease', background: 'linear-gradient(90deg, var(--neon-teal), #15ffd1)' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--outline)' }}>delete_sweep</span>
            {cleanStep}
          </div>
          {cleanDetail && (
            <div style={{ fontSize: 11, color: 'var(--outline)', marginTop: 4, paddingLeft: 20, fontVariantNumeric: 'tabular-nums' }}>
              {cleanDetail}
            </div>
          )}
        </div>
      )}

      {/* Clean result toast */}
      {cleanResult && (
        <div className="glass-panel" style={{
          padding: '20px 24px',
          marginBottom: 'var(--gutter)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          borderColor: 'rgba(21, 255, 209, 0.3)'
        }}>
          {/* Main result line */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="material-symbols-outlined fill" style={{ color: 'var(--neon-teal)', fontSize: 24 }}>check_circle</span>
            <div>
              <div style={{ color: 'var(--neon-teal)', fontWeight: 700, fontSize: 16 }}>
                {isRu ? 'Очистка завершена' : 'Cleaning Complete'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 2 }}>
                {isRu ? 'Освобождено' : 'Freed'}: <strong style={{ color: 'var(--neon-cyan)' }}>{formatBytes(cleanResult.freedSpace)}</strong>
                {' · '}{isRu ? 'Удалено' : 'Deleted'}: <strong>{cleanResult.cleaned}</strong> {isRu ? 'объектов' : 'items'}
              </div>
            </div>
          </div>

          {/* Skipped / locked files explanation */}
          {(cleanResult.failed > 0 || cleanResult.lockedCount > 0) && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius)',
              background: 'rgba(255, 190, 60, 0.06)',
              border: '1px solid rgba(255, 190, 60, 0.15)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--status-warning)', flexShrink: 0, marginTop: 1 }}>lock</span>
              <div>
                <div style={{ fontSize: 12, color: 'var(--on-surface)', fontWeight: 600 }}>
                  {cleanResult.failed + (cleanResult.lockedCount || 0)} {isRu ? 'файлов пропущено' : 'files skipped'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--outline)', marginTop: 3, lineHeight: 1.5 }}>
                  {isRu
                    ? 'Эти файлы заняты Windows или активными программами. Они будут удалены при следующей очистке после закрытия использующих их процессов.'
                    : 'These files are locked by Windows or running apps. They will be removed on next cleanup after the processes using them are closed.'}
                </div>
              </div>
            </div>
          )}

          {/* Browser notice */}
          {cleanResult.browsersWereRunning && (
            <div style={{ fontSize: 12, color: 'var(--outline)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--neon-cyan)' }}>info</span>
              {isRu ? 'Браузеры были закрыты для очистки кэша' : 'Browsers were closed to clean cache'}
            </div>
          )}
        </div>
      )}

      {/* Category Grid */}
      {scanDone && (
        <div className="stagger-children" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 'var(--layer-gap)'
        }}>
          {categories.map(cat => {
            const meta = categoryMeta[cat.id]
            return (
              <div
                key={cat.id}
                className="glass-panel glass-card-interactive"
                onClick={() => toggleCategory(cat.id)}
                style={{
                  padding: '20px 24px',
                  cursor: 'pointer',
                  borderColor: cat.selected ? 'rgba(0, 242, 255, 0.3)' : undefined,
                  opacity: (cat.totalSize === 0 && !cat.count) ? 0.5 : 1
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 'var(--radius)',
                      background: 'rgba(0, 242, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <span className="material-symbols-outlined" style={{
                        color: 'var(--neon-cyan)',
                        fontSize: 20
                      }}>{meta?.icon || 'folder'}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--on-surface)' }}>
                        {meta ? t(meta.nameKey) : cat.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--outline)', marginTop: 2 }}>
                        {meta ? t(meta.descKey) : ''}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: (cat.totalSize > 0 || cat.count) ? 'var(--neon-cyan)' : 'var(--outline)'
                    }}>
                      {cat.id === 'registry'
                        ? `${cat.count || 0} ${i18n.language === 'ru' ? 'ошибок' : 'issues'}`
                        : formatBytes(cat.totalSize)
                      }
                    </div>
                    {/* Toggle checkbox */}
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      border: `2px solid ${cat.selected ? 'var(--neon-cyan)' : 'var(--outline-variant)'}`,
                      background: cat.selected ? 'rgba(0, 242, 255, 0.2)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s'
                    }}>
                      {cat.selected && (
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--neon-cyan)' }}>check</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                {cat.totalSize > 0 && totalSize > 0 && (
                  <div className="glass-progress-track" style={{ marginTop: 12 }}>
                    <div className="glass-progress-fill" style={{
                      width: `${Math.min((cat.totalSize / totalSize) * 100, 100)}%`
                    }} />
                  </div>
                )}

                {/* System-locked files hint — shows after cleaning when files remain */}
                {cleanResult && cat.id !== 'registry' && cat.totalSize > 0 && cat.files && cat.files.length > 0 && (
                  <div style={{
                    marginTop: 8,
                    padding: '6px 10px',
                    borderRadius: 'var(--radius)',
                    background: 'rgba(255, 190, 60, 0.05)',
                    border: '1px solid rgba(255, 190, 60, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    color: 'var(--status-warning)'
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14, flexShrink: 0 }}>lock</span>
                    {isRu
                      ? `Остались только файлы, занятые системой (${cat.files.length})`
                      : `Only system-locked files remain (${cat.files.length})`}
                  </div>
                )}

                {cat.id !== 'registry' && (
                  <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    {/* Open folder in Explorer */}
                    {CATEGORY_FOLDERS[cat.id] && (
                      <button
                        className="glass-btn-ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          openCategoryFolder(cat.id)
                        }}
                        style={{ padding: '4px 10px', fontSize: 11 }}
                        title={isRu ? 'Открыть папку в Проводнике' : 'Open folder in Explorer'}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>folder_open</span>
                        {isRu ? 'Открыть' : 'Open'}
                      </button>
                    )}
                    {/* View file list */}
                    {cat.files && cat.files.length > 0 && (
                      <button
                        className="glass-btn-ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedCat(expandedCat === cat.id ? null : cat.id)
                        }}
                        style={{ padding: '4px 10px', fontSize: 11 }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                          {expandedCat === cat.id ? 'expand_less' : 'expand_more'}
                        </span>
                        {expandedCat === cat.id
                          ? (isRu ? 'Скрыть' : 'Hide')
                          : (isRu ? 'Просмотр файлов' : 'View Files')
                        } ({cat.files.length})
                      </button>
                    )}
                  </div>
                )}

                {/* Registry: View Issues button */}
                {cat.id === 'registry' && regIssues.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="glass-btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowRegDetail(true)
                      }}
                      style={{ padding: '4px 12px', fontSize: 11, color: 'var(--neon-cyan)' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>visibility</span>
                      {isRu ? 'Просмотр ошибок' : 'View Issues'} ({regIssues.length})
                    </button>
                  </div>
                )}

                {/* Expandable file list (not for registry) */}
                {expandedCat === cat.id && cat.id !== 'registry' && cat.files && (
                  <div style={{
                    marginTop: 8,
                    maxHeight: 200,
                    overflowY: 'auto',
                    borderRadius: 'var(--radius)',
                    background: 'rgba(0,0,0,0.2)',
                    padding: '8px 10px',
                    fontSize: 11,
                    fontFamily: 'monospace'
                  }}>
                    {cat.files.slice(0, 50).map((file: any, idx: number) => (
                      <div key={idx} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '3px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        color: 'var(--on-surface-variant)',
                        gap: 12
                      }}>
                        <span style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                          direction: 'rtl',
                          textAlign: 'left'
                        }}>
                          {file.path}
                        </span>
                        <span style={{ flexShrink: 0, color: 'var(--outline)' }}>
                          {formatBytes(file.size)}
                        </span>
                      </div>
                    ))}
                    {cat.files.length > 50 && (
                      <div style={{ padding: '6px 0', color: 'var(--outline)', textAlign: 'center' }}>
                        ...{isRu ? 'и ещё' : 'and'} {cat.files.length - 50} {isRu ? 'файлов' : 'more files'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Registry Detail Modal */}
      {showRegDetail && (
        <>
          <div className="modal-backdrop" onClick={() => setShowRegDetail(false)} />
          <div className="modal-content" style={{ maxWidth: 700, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="glass-panel liquid-glass-high" style={{ padding: '28px', display: 'flex', flexDirection: 'column', maxHeight: '75vh' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, verticalAlign: 'middle', marginRight: 8, color: 'var(--neon-cyan)' }}>settings_suggest</span>
                    {isRu ? 'Ошибки реестра' : 'Registry Issues'}
                  </h2>
                  <p style={{ fontSize: 12, color: 'var(--outline)', margin: '4px 0 0 30px' }}>
                    {isRu ? 'Выберите записи для удаления. Бэкап будет создан автоматически.' : 'Select entries to remove. Backup will be created automatically.'}
                  </p>
                </div>
                <button className="glass-btn-ghost" onClick={() => setShowRegDetail(false)} style={{ padding: 6 }}>
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Select all / none */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
                <button className="glass-btn-ghost" onClick={() => toggleAllRegIssues(true)} style={{ padding: '4px 10px', fontSize: 11 }}>
                  {isRu ? 'Выбрать все' : 'Select All'}
                </button>
                <button className="glass-btn-ghost" onClick={() => toggleAllRegIssues(false)} style={{ padding: '4px 10px', fontSize: 11 }}>
                  {isRu ? 'Снять все' : 'Deselect All'}
                </button>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--neon-cyan)', fontWeight: 600 }}>
                  {regIssues.filter(r => r.selected).length} / {regIssues.length} {isRu ? 'выбрано' : 'selected'}
                </span>
              </div>

              {/* Issues list grouped by type */}
              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
                {Object.entries(ISSUE_TYPE_LABELS).map(([type, meta]) => {
                  const typeIssues = regIssues.filter(r => r.type === type)
                  if (typeIssues.length === 0) return null
                  return (
                    <div key={type} style={{ marginBottom: 16 }}>
                      {/* Category header */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 8,
                        padding: '6px 0',
                        borderBottom: '1px solid var(--outline-variant)'
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--neon-cyan)' }}>{meta.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)' }}>
                          {isRu ? meta.ru : meta.en}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--outline)', marginLeft: 4 }}>
                          ({typeIssues.length})
                        </span>
                      </div>
                      {/* Issues */}
                      {typeIssues.map(issue => (
                        <div
                          key={issue.id}
                          onClick={() => toggleRegIssue(issue.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 10px',
                            borderRadius: 'var(--radius)',
                            cursor: 'pointer',
                            background: issue.selected ? 'rgba(0, 242, 255, 0.05)' : 'transparent',
                            marginBottom: 2,
                            transition: 'background 0.15s'
                          }}
                        >
                          {/* Checkbox */}
                          <div style={{
                            width: 18,
                            height: 18,
                            borderRadius: 5,
                            border: `2px solid ${issue.selected ? 'var(--neon-cyan)' : 'var(--outline-variant)'}`,
                            background: issue.selected ? 'rgba(0, 242, 255, 0.2)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'all 0.15s'
                          }}>
                            {issue.selected && (
                              <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--neon-cyan)' }}>check</span>
                            )}
                          </div>
                          {/* Issue info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 12,
                              color: 'var(--on-surface)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {issue.description}
                            </div>
                            <div style={{
                              fontSize: 10,
                              color: 'var(--outline)',
                              fontFamily: 'monospace',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              marginTop: 2
                            }}>
                              {issue.key}
                            </div>
                          </div>
                          {/* Severity badge */}
                          <span style={{
                            fontSize: 9,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            color: SEVERITY_COLORS[issue.severity],
                            border: `1px solid ${SEVERITY_COLORS[issue.severity]}40`,
                            borderRadius: 4,
                            padding: '2px 6px',
                            flexShrink: 0
                          }}>
                            {isRu ? SEVERITY_LABELS[issue.severity].ru : SEVERITY_LABELS[issue.severity].en}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>

              {/* Registry cleaning animation — step-by-step */}
              {regCleaning && (
                <div style={{
                  margin: '16px 0', padding: '16px',
                  borderRadius: 'var(--radius)', background: 'rgba(0, 242, 255, 0.04)',
                  border: '1px solid rgba(0, 242, 255, 0.1)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <span className="material-symbols-outlined animate-spin" style={{ fontSize: 20, color: 'var(--neon-cyan)' }}>progress_activity</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{isRu ? 'Очистка реестра...' : 'Cleaning registry...'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { icon: 'backup', label: isRu ? '1. Бэкап' : '1. Backup' },
                      { icon: 'cleaning_services', label: isRu ? '2. Очистка' : '2. Clean' },
                      { icon: 'check_circle', label: isRu ? '3. Готово' : '3. Done' },
                    ].map((step, i) => (
                      <div key={i} style={{
                        flex: 1, padding: '8px', borderRadius: 8,
                        background: 'rgba(0,0,0,0.15)', textAlign: 'center',
                        fontSize: 10, color: 'var(--outline)'
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, display: 'block', marginBottom: 2, color: 'var(--neon-cyan)' }}>{step.icon}</span>
                        {step.label}
                      </div>
                    ))}
                  </div>
                  <div style={{ width: '100%', height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.05)', marginTop: 10, overflow: 'hidden' }}>
                    <div className="animate-progress-indeterminate" style={{ height: '100%', borderRadius: 1, background: 'linear-gradient(90deg, var(--neon-cyan), #15ffd1)', width: '40%' }} />
                  </div>
                </div>
              )}

              {/* Registry result */}
              {regResult && !regCleaning && (
                <div style={{
                  margin: '12px 0', padding: '16px',
                  borderRadius: 'var(--radius)',
                  background: regResult.cleaned > 0 ? 'rgba(0, 200, 100, 0.08)' : 'rgba(255, 80, 80, 0.08)',
                  border: `1px solid ${regResult.cleaned > 0 ? 'rgba(0, 200, 100, 0.2)' : 'rgba(255, 80, 80, 0.2)'}`
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)', marginBottom: 6 }}>
                    ✅ {isRu ? 'Очищено' : 'Cleaned'}: {regResult.cleaned} {isRu ? 'записей' : 'entries'}
                    {regResult.failed > 0 && <span style={{ color: '#ff5555' }}> | ❌ {isRu ? 'Ошибок' : 'Failed'}: {regResult.failed}</span>}
                  </div>
                  {regResult.backupPath && (
                    <>
                      <div style={{ fontSize: 11, color: 'var(--outline)', marginBottom: 8 }}>
                        💾 {isRu ? 'Бэкап сохранён:' : 'Backup saved:'} <code style={{ fontSize: 10, color: 'var(--neon-cyan)' }}>{regResult.backupPath}</code>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="glass-btn-ghost" style={{ padding: '4px 10px', fontSize: 10 }}
                          onClick={async () => {
                            const dir = regResult.backupPath.substring(0, regResult.backupPath.lastIndexOf('\\'))
                            await ipc.openFolder(dir)
                          }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>folder_open</span>
                          {isRu ? 'Открыть папку' : 'Open Folder'}
                        </button>
                        <button className="glass-btn-ghost" style={{ padding: '4px 10px', fontSize: 10, color: '#ffbe3c' }}
                          onClick={async () => {
                            if (confirm(isRu ? 'Восстановить реестр из бэкапа? Это вернёт удалённые записи.' : 'Restore registry from backup? This will re-add deleted entries.')) {
                              const res = await ipc.restoreRegistry(regResult.backupPath)
                              if (res?.success) {
                                alert(isRu ? '✅ Реестр восстановлен' : '✅ Registry restored')
                                scan()
                              } else {
                                alert(`❌ ${res?.error || 'Error'}`)
                              }
                            }
                          }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>settings_backup_restore</span>
                          {isRu ? 'Восстановить' : 'Restore'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Backup notice + action buttons */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginTop: 12, paddingTop: 12,
                borderTop: '1px solid var(--outline-variant)', gap: 12, flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--status-warning)', flexShrink: 0 }}>shield</span>
                  <span style={{ fontSize: 11, color: 'var(--outline)' }}>
                    {isRu ? 'Бэкап .reg создаётся автоматически → можно откатить' : 'Backup .reg is created automatically → can be rolled back'}
                  </span>
                </div>
                <button
                  className="glass-btn-primary"
                  onClick={executeRegClean}
                  disabled={regCleaning || regIssues.filter(r => r.selected).length === 0}
                  style={{ padding: '8px 20px', fontSize: 13, flexShrink: 0 }}
                >
                  {regCleaning ? (
                    <><span className="material-symbols-outlined animate-spin" style={{ fontSize: 16 }}>progress_activity</span> {isRu ? 'Очистка...' : 'Cleaning...'}</>
                  ) : (
                    <>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>cleaning_services</span>
                      {isRu ? 'Очистить выбранные' : 'Clean Selected'} ({regIssues.filter(r => r.selected).length})
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <>
          <div className="modal-backdrop" onClick={() => setShowConfirm(false)} />
          <div className="modal-content">
            <div className="glass-panel liquid-glass-high" style={{ padding: '32px' }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: 'var(--on-surface)' }}>
                {t('cleaner.confirmTitle')}
              </h2>
              <p style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginBottom: 16 }}>
                {t('cleaner.confirmMessage')}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: 24 }}>
                {categories.filter(c => c.selected && (c.totalSize > 0 || c.count)).map(c => (
                  <li key={c.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--outline-variant)',
                    fontSize: 14,
                    color: 'var(--on-surface)'
                  }}>
                    <span>{categoryMeta[c.id] ? t(categoryMeta[c.id].nameKey) : c.name}</span>
                    <span style={{ color: 'var(--neon-cyan)', fontWeight: 600 }}>
                      {c.id === 'registry'
                        ? `${(c as any).count || 0} ${isRu ? 'ошибок' : 'issues'}`
                        : formatBytes(c.totalSize)
                      }
                    </span>
                  </li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button className="glass-btn-ghost" onClick={() => setShowConfirm(false)}>
                  {t('cleaner.cancel')}
                </button>
                <button className="glass-btn-primary" onClick={executeClean}>
                  {t('cleaner.confirm')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default SmartCleaner

