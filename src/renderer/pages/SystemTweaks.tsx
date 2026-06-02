/**
 * System Tweaks Page - Windows Debloater, Telemetry, Hosts Editor, Context Menu Manager
 */
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '../lib/ipc'

type Tab = 'telemetry' | 'debloater' | 'hosts' | 'contextmenu'

export interface ContextMenuHandler {
  name: string
  keyName: string
  parentPath: string
  guid: string
  enabled: boolean
}

export interface UwpApp {
  name: string
  packageFullName: string
  publisherId: string
}

const SystemTweaks: React.FC = () => {
  const { i18n } = useTranslation()
  const isRu = i18n.language === 'ru'
  const [activeTab, setActiveTab] = useState<Tab>('telemetry')

  /* 1. Telemetry State */
  const [telemetryStates, setTelemetryStates] = useState<Record<string, boolean>>({})
  const [telemetryLoading, setTelemetryLoading] = useState(false)

  /* 2. UWP Debloater State */
  const [uwpApps, setUwpApps] = useState<UwpApp[]>([])
  const [uwpLoading, setUwpLoading] = useState(false)
  const [uwpSearch, setUwpSearch] = useState('')
  const [selectedUwp, setSelectedUwp] = useState<string[]>([])
  const [uwpActionMsg, setUwpActionMsg] = useState('')

  /* 3. Hosts State */
  const [hostsContent, setHostsContent] = useState('')
  const [hostsLoading, setHostsLoading] = useState(false)
  const [hostsSaved, setHostsSaved] = useState(false)

  /* 4. Context Menu State */
  const [contextHandlers, setContextHandlers] = useState<ContextMenuHandler[]>([])
  const [contextLoading, setContextLoading] = useState(false)
  const [contextSearch, setContextSearch] = useState('')

  useEffect(() => {
    loadTabContent(activeTab)
  }, [activeTab])

  const loadTabContent = async (tab: Tab) => {
    if (tab === 'telemetry') {
      setTelemetryLoading(true)
      const st = await ipc.getTelemetryStatus()
      setTelemetryStates(st || {})
      setTelemetryLoading(false)
    } else if (tab === 'debloater') {
      setUwpLoading(true)
      const apps = await ipc.listUwpApps()
      setUwpApps(apps || [])
      setSelectedUwp([])
      setUwpLoading(false)
    } else if (tab === 'hosts') {
      setHostsLoading(true)
      const content = await ipc.readHosts()
      setHostsContent(content || '')
      setHostsLoading(false)
    } else if (tab === 'contextmenu') {
      setContextLoading(true)
      const items = await ipc.getContextMenuItems()
      setContextHandlers(items || [])
      setContextLoading(false)
    }
  }

  /* --- Telemetry Action Handlers --- */
  const handleToggleTweak = async (id: string, active: boolean) => {
    setTelemetryStates(prev => ({ ...prev, [id]: active }))
    await ipc.setTelemetryTweak(id, active)
    const st = await ipc.getTelemetryStatus()
    setTelemetryStates(st || {})
  }

  const handleRollbackTelemetry = async () => {
    if (!confirm(isRu ? 'Вы уверены, что хотите вернуть все параметры телеметрии по умолчанию?' : 'Are you sure you want to restore all telemetry settings to defaults?')) return
    setTelemetryLoading(true)
    await ipc.rollbackTelemetry()
    const st = await ipc.getTelemetryStatus()
    setTelemetryStates(st || {})
    setTelemetryLoading(false)
  }

  /* --- Debloater Action Handlers --- */
  const toggleSelectUwp = (fullName: string) => {
    setSelectedUwp(prev =>
      prev.includes(fullName) ? prev.filter(f => f !== fullName) : [...prev, fullName]
    )
  }

  const handleUninstallUwp = async (fullName: string, name: string) => {
    if (!confirm(isRu ? `Удалить приложение "${name}"?` : `Uninstall app "${name}"?`)) return
    setUwpActionMsg(isRu ? `Удаление ${name}...` : `Uninstalling ${name}...`)
    await ipc.uninstallUwpApp(fullName)
    setUwpActionMsg('')
    loadTabContent('debloater')
  }

  const handleUninstallSelected = async () => {
    if (selectedUwp.length === 0) return
    if (!confirm(isRu ? `Удалить ${selectedUwp.length} выбранных приложений?` : `Uninstall ${selectedUwp.length} selected apps?`)) return
    setUwpActionMsg(isRu ? `Удаление выбранных приложений...` : `Uninstalling selected apps...`)
    for (const fullName of selectedUwp) {
      await ipc.uninstallUwpApp(fullName)
    }
    setUwpActionMsg('')
    loadTabContent('debloater')
  }

  const handleRestoreDefaultUwp = async () => {
    if (!confirm(isRu ? 'Восстановить все стандартные UWP-приложения Windows? Это может занять несколько минут.' : 'Restore all standard Windows UWP apps? This may take several minutes.')) return
    setUwpActionMsg(isRu ? 'Выполняется восстановление базовых UWP пакетов...' : 'Restoring base UWP packages...')
    await ipc.restoreDefaultUwpApps()
    setUwpActionMsg('')
    loadTabContent('debloater')
  }

  /* --- Hosts Action Handlers --- */
  const handleSaveHosts = async () => {
    setHostsLoading(true)
    await ipc.writeHosts(hostsContent)
    setHostsSaved(true)
    setTimeout(() => setHostsSaved(false), 2000)
    setHostsLoading(false)
  }

  const handleToggleHostsBlock = async (active: boolean) => {
    setHostsLoading(true)
    await ipc.toggleTelemetryBlock(active)
    const content = await ipc.readHosts()
    setHostsContent(content || '')
    setHostsLoading(false)
  }

  /* --- Context Menu Action Handlers --- */
  const handleToggleContextMenu = async (handler: ContextMenuHandler) => {
    await ipc.toggleContextMenuItem(handler.parentPath, handler.keyName, !handler.enabled)
    loadTabContent('contextmenu')
  }

  /* --- Filtering Helpers --- */
  const filteredUwpApps = uwpApps.filter(app =>
    app.name.toLowerCase().includes(uwpSearch.toLowerCase()) ||
    app.packageFullName.toLowerCase().includes(uwpSearch.toLowerCase())
  )

  const filteredContextHandlers = contextHandlers.filter(item =>
    item.name.toLowerCase().includes(contextSearch.toLowerCase()) ||
    item.keyName.toLowerCase().includes(contextSearch.toLowerCase()) ||
    item.parentPath.toLowerCase().includes(contextSearch.toLowerCase())
  )

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div className="page-header">
        <h1>{isRu ? 'Глубокие Твики' : 'System Tweaks'}</h1>
        <p>{isRu ? 'Деблоатер, телеметрия, редактор hosts и контекстного меню' : 'Windows debloater, telemetry toggles, hosts editor and shell extensions'}</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {([
          ['telemetry', 'bolt', isRu ? 'Телеметрия' : 'Telemetry'],
          ['debloater', 'delete_sweep', isRu ? 'Деблоатер UWP' : 'UWP Debloater'],
          ['hosts', 'dns', isRu ? 'Редактор Hosts' : 'Hosts Editor'],
          ['contextmenu', 'menu', isRu ? 'Контекстное меню' : 'Context Menu']
        ] as const).map(([tabKey, icon, label]) => (
          <button
            key={tabKey}
            onClick={() => setActiveTab(tabKey)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 12,
              background: activeTab === tabKey ? 'var(--neon-cyan)' : 'var(--surface-container)',
              color: activeTab === tabKey ? 'var(--on-primary)' : 'var(--on-surface-variant)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              transition: 'all 0.2s'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Action overlay loader */}
      {uwpActionMsg && (
        <div className="glass-panel" style={{ padding: 20, textAlign: 'center', marginBottom: 20, borderColor: 'var(--neon-cyan)', background: 'rgba(0, 242, 255, 0.05)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24, animation: 'spin 1s linear infinite', color: 'var(--neon-cyan)', verticalAlign: 'middle', marginRight: 10 }}>progress_activity</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>{uwpActionMsg}</span>
        </div>
      )}

      {/* Tab Contents */}
      {activeTab === 'telemetry' && (
        <div className="glass-panel" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
              {isRu ? 'Параметры сбора данных и телеметрии' : 'Telemetry & Telecommunication Tweaks'}
            </h3>
            <button className="glass-btn-ghost" onClick={handleRollbackTelemetry} disabled={telemetryLoading} style={{ padding: '8px 16px', fontSize: 12 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>restart_alt</span>
              {isRu ? 'Сбросить все' : 'Restore Defaults'}
            </button>
          </div>

          {telemetryLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1s linear infinite', color: 'var(--neon-cyan)' }}>progress_activity</span></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Telemetry Tweak */}
              <div className="glass-row" style={{ padding: '16px 20px', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 24, color: telemetryStates.telemetry ? 'var(--status-critical)' : 'var(--neon-teal)' }}>sensors_off</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>{isRu ? 'Отключить телеметрию Windows' : 'Disable Windows Telemetry'}</div>
                    <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 2 }}>{isRu ? 'Отключает фоновую отправку диагностических отчетов Microsoft (AllowTelemetry = 0)' : 'Disables background diagnostics report submission to Microsoft (AllowTelemetry = 0)'}</div>
                  </div>
                </div>
                <div
                  onClick={() => handleToggleTweak('telemetry', !telemetryStates.telemetry)}
                  style={{
                    width: 48, height: 24, borderRadius: 12,
                    background: telemetryStates.telemetry ? 'var(--neon-cyan)' : 'var(--surface-container-highest)',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s'
                  }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: telemetryStates.telemetry ? 27 : 3, transition: 'left 0.2s' }} />
                </div>
              </div>

              {/* Cortana Tweak */}
              <div className="glass-row" style={{ padding: '16px 20px', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 24, color: telemetryStates.cortana ? 'var(--status-critical)' : 'var(--neon-teal)' }}>mic_off</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>{isRu ? 'Отключить Cortana' : 'Disable Cortana Assistant'}</div>
                    <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 2 }}>{isRu ? 'Отключает неиспользуемый в России голосовой помощник и его сбор данных (AllowCortana = 0)' : 'Disables background voice assistant tracking policies (AllowCortana = 0)'}</div>
                  </div>
                </div>
                <div
                  onClick={() => handleToggleTweak('cortana', !telemetryStates.cortana)}
                  style={{
                    width: 48, height: 24, borderRadius: 12,
                    background: telemetryStates.cortana ? 'var(--neon-cyan)' : 'var(--surface-container-highest)',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s'
                  }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: telemetryStates.cortana ? 27 : 3, transition: 'left 0.2s' }} />
                </div>
              </div>

              {/* Advertising ID */}
              <div className="glass-row" style={{ padding: '16px 20px', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 24, color: telemetryStates.advertisingId ? 'var(--status-critical)' : 'var(--neon-teal)' }}>ads_click</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>{isRu ? 'Отключить рекламный идентификатор' : 'Disable Advertising ID'}</div>
                    <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 2 }}>{isRu ? 'Запрещает приложениям использовать уникальный ID для показа персонализированной рекламы' : 'Blocks tracking of your activities for target personalized ads'}</div>
                  </div>
                </div>
                <div
                  onClick={() => handleToggleTweak('advertisingId', !telemetryStates.advertisingId)}
                  style={{
                    width: 48, height: 24, borderRadius: 12,
                    background: telemetryStates.advertisingId ? 'var(--neon-cyan)' : 'var(--surface-container-highest)',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s'
                  }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: telemetryStates.advertisingId ? 27 : 3, transition: 'left 0.2s' }} />
                </div>
              </div>

              {/* Ink & Text personalization */}
              <div className="glass-row" style={{ padding: '16px 20px', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 24, color: telemetryStates.inkCollection ? 'var(--status-critical)' : 'var(--neon-teal)' }}>gesture</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>{isRu ? 'Отключить слежку за вводом (Ink & Text)' : 'Disable Ink & Typing Personalization'}</div>
                    <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 2 }}>{isRu ? 'Отключает сбор нажатий клавиш и почерка, отправляемый Microsoft для "улучшения ввода"' : 'Prevents sending your keystrokes and handwriting data to Microsoft'}</div>
                  </div>
                </div>
                <div
                  onClick={() => handleToggleTweak('inkCollection', !telemetryStates.inkCollection)}
                  style={{
                    width: 48, height: 24, borderRadius: 12,
                    background: telemetryStates.inkCollection ? 'var(--neon-cyan)' : 'var(--surface-container-highest)',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s'
                  }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: telemetryStates.inkCollection ? 27 : 3, transition: 'left 0.2s' }} />
                </div>
              </div>

              {/* WER (Windows Error Reporting) */}
              <div className="glass-row" style={{ padding: '16px 20px', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 24, color: telemetryStates.werDisabled ? 'var(--status-critical)' : 'var(--neon-teal)' }}>bug_report</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>{isRu ? 'Отключить отчеты об ошибках (WER)' : 'Disable Windows Error Reporting'}</div>
                    <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 2 }}>{isRu ? 'Блокирует генерацию и отправку мини-дампов памяти в Microsoft при падении приложений' : 'Disables WER crash dump generation and data uploads (Disabled = 1)'}</div>
                  </div>
                </div>
                <div
                  onClick={() => handleToggleTweak('werDisabled', !telemetryStates.werDisabled)}
                  style={{
                    width: 48, height: 24, borderRadius: 12,
                    background: telemetryStates.werDisabled ? 'var(--neon-cyan)' : 'var(--surface-container-highest)',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s'
                  }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: telemetryStates.werDisabled ? 27 : 3, transition: 'left 0.2s' }} />
                </div>
              </div>

              {/* Hosts File Tweak */}
              <div className="glass-row" style={{ padding: '16px 20px', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 24, color: telemetryStates.hostsBlocked ? 'var(--status-critical)' : 'var(--neon-teal)' }}>dns</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>{isRu ? 'Блокировать серверы слежки в Hosts' : 'Block Telemetry Servers via Hosts'}</div>
                    <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 2 }}>{isRu ? 'Перенаправляет известные серверы телеметрии Microsoft на 0.0.0.0 в файле hosts' : 'Blacklists major Microsoft telemetry endpoints in system hosts file'}</div>
                  </div>
                </div>
                <div
                  onClick={() => handleToggleTweak('hostsBlocked', !telemetryStates.hostsBlocked)}
                  style={{
                    width: 48, height: 24, borderRadius: 12,
                    background: telemetryStates.hostsBlocked ? 'var(--neon-cyan)' : 'var(--surface-container-highest)',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s'
                  }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: telemetryStates.hostsBlocked ? 27 : 3, transition: 'left 0.2s' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'debloater' && (
        <div className="glass-panel" style={{ padding: 24 }}>
          {/* Warning Banner */}
          <div style={{
            display: 'flex', gap: 12, padding: '12px 16px', borderRadius: 12,
            background: 'var(--badge-danger-bg)', border: '1px solid var(--badge-danger-border)',
            color: 'var(--badge-danger-text)', fontSize: 13, marginBottom: 20, lineHeight: 1.5
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>warning</span>
            <div>
              {isRu ? 'Внимание! Некоторые встроенные программы Microsoft (например, Xbox, Камера или Магазин) необходимы для сопутствующих системных процессов. Удаляйте только то, в чем уверены.' 
                    : 'Warning! Some built-in UWP packages are essential for system modules (like Xbox overlay, Camera or Store). Exercise caution when un-provisioning packages.'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {/* Search */}
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 12,
              background: 'var(--surface-container)', border: '1px solid var(--outline-variant)'
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--outline)' }}>search</span>
              <input
                type="text"
                placeholder={isRu ? 'Поиск UWP пакетов...' : 'Search UWP apps...'}
                value={uwpSearch}
                onChange={e => setUwpSearch(e.target.value)}
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--on-surface)', fontSize: 14 }}
              />
            </div>

            {/* Reinstall standard */}
            <button className="glass-btn-ghost" onClick={handleRestoreDefaultUwp} disabled={uwpLoading} style={{ padding: '0 20px', fontSize: 13 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>restore</span>
              {isRu ? 'Восстановить базовые' : 'Restore Default Apps'}
            </button>
          </div>

          {/* Table actions */}
          {selectedUwp.length > 0 && (
            <div className="glass-panel animate-fade-in" style={{ padding: 14, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: 'var(--status-critical)', background: 'rgba(255, 75, 75, 0.03)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {isRu ? `Выбрано для удаления: ${selectedUwp.length}` : `Selected for uninstallation: ${selectedUwp.length}`}
              </span>
              <button className="glass-btn-primary" onClick={handleUninstallSelected} style={{ background: 'var(--status-critical)', color: '#fff', border: 'none', padding: '8px 16px', fontSize: 12 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete_forever</span>
                {isRu ? 'Удалить выбранные' : 'Uninstall Selected'}
              </button>
            </div>
          )}

          {uwpLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1s linear infinite', color: 'var(--neon-cyan)' }}>progress_activity</span></div>
          ) : filteredUwpApps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--outline)', fontSize: 13 }}>
              {isRu ? 'Пакеты не найдены' : 'No packages found'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto', paddingRight: 4 }}>
              {filteredUwpApps.map(app => {
                const isSelected = selectedUwp.includes(app.packageFullName)
                return (
                  <div key={app.packageFullName} className="glass-row" style={{ padding: '12px 16px', gap: 14 }}>
                    {/* Checkbox */}
                    <div
                      onClick={() => toggleSelectUwp(app.packageFullName)}
                      style={{
                        width: 18, height: 18, borderRadius: 5, cursor: 'pointer',
                        border: `2px solid ${isSelected ? 'var(--neon-cyan)' : 'var(--outline-variant)'}`,
                        background: isSelected ? 'rgba(0, 242, 255, 0.2)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      {isSelected && <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--neon-cyan)', fontWeight: 'bold' }}>check</span>}
                    </div>

                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)' }}>{app.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--outline)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.packageFullName}</div>
                    </div>

                    <button
                      className="glass-btn-ghost"
                      onClick={() => handleUninstallUwp(app.packageFullName, app.name)}
                      style={{ padding: '6px 10px', fontSize: 11, borderColor: 'rgba(255, 75, 75, 0.2)', color: 'var(--status-critical)' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                      {isRu ? 'Удалить' : 'Uninstall'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'hosts' && (
        <div className="glass-panel" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
              {isRu ? 'Содержимое файла Hosts' : 'Hosts File Editor'}
            </h3>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="glass-btn-ghost"
                onClick={() => handleToggleHostsBlock(true)}
                disabled={hostsLoading}
                style={{ padding: '6px 12px', fontSize: 12, borderColor: 'rgba(0, 242, 255, 0.3)' }}
              >
                {isRu ? 'Блокировать телеметрию' : 'Block Telemetry'}
              </button>
              <button
                className="glass-btn-ghost"
                onClick={() => handleToggleHostsBlock(false)}
                disabled={hostsLoading}
                style={{ padding: '6px 12px', fontSize: 12 }}
              >
                {isRu ? 'Очистить блокировки' : 'Remove Blocks'}
              </button>
            </div>
          </div>

          {hostsLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1s linear infinite', color: 'var(--neon-cyan)' }}>progress_activity</span></div>
          ) : (
            <div>
              <textarea
                value={hostsContent}
                onChange={e => setHostsContent(e.target.value)}
                style={{
                  width: '100%', height: 350, borderRadius: 10,
                  background: 'var(--card-inset-bg)', border: '1px solid var(--card-inset-border)',
                  color: 'var(--on-surface)', fontFamily: 'Consolas, monospace', fontSize: 12,
                  padding: 16, outline: 'none', resize: 'none', lineHeight: 1.6
                }}
              />
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 16, alignItems: 'center' }}>
                {hostsSaved && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--neon-teal)', fontSize: 13, fontWeight: 600 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
                    {isRu ? 'Изменения сохранены!' : 'Hosts saved!'}
                  </div>
                )}
                <button className="glass-btn-primary" onClick={handleSaveHosts} disabled={hostsLoading} style={{ padding: '12px 30px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
                  {isRu ? 'Сохранить hosts' : 'Save Hosts'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'contextmenu' && (
        <div className="glass-panel" style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {/* Search */}
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 12,
              background: 'var(--surface-container)', border: '1px solid var(--outline-variant)'
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--outline)' }}>search</span>
              <input
                type="text"
                placeholder={isRu ? 'Поиск расширений контекстного меню...' : 'Search shell extensions...'}
                value={contextSearch}
                onChange={e => setContextSearch(e.target.value)}
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--on-surface)', fontSize: 14 }}
              />
            </div>
          </div>

          {contextLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1s linear infinite', color: 'var(--neon-cyan)' }}>progress_activity</span></div>
          ) : filteredContextHandlers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--outline)', fontSize: 13 }}>
              {isRu ? 'Расширения не найдены' : 'No shell extensions found'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
              {filteredContextHandlers.map((item, idx) => (
                <div key={idx} className="glass-row" style={{ padding: '12px 16px', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', overflow: 'hidden' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, color: item.enabled ? 'var(--neon-cyan)' : 'var(--outline)' }}>
                      {item.enabled ? 'check_circle' : 'do_not_disturb_on'}
                    </span>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)' }}>{item.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--outline)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.parentPath.replace('Registry::HKEY_CLASSES_ROOT', 'HKCR')}
                      </div>
                    </div>
                  </div>

                  <div
                    onClick={() => handleToggleContextMenu(item)}
                    style={{
                      width: 48, height: 24, borderRadius: 12,
                      background: item.enabled ? 'var(--neon-cyan)' : 'var(--surface-container-highest)',
                      position: 'relative', cursor: 'pointer', transition: 'background 0.2s'
                    }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: item.enabled ? 27 : 3, transition: 'left 0.2s' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SystemTweaks
