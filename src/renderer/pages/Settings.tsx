import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/useAppStore'
import { ipc } from '../lib/ipc'

interface WidgetCfg {
  id: string
  type: string
  title: string
  titleRu: string
  enabled: boolean
}

const Settings: React.FC = () => {
  const { t, i18n } = useTranslation()
  const store = useAppStore()
  const [widgetsEnabled, setWidgetsEnabled] = useState(false)
  const [widgetAlwaysOnTop, setWidgetAlwaysOnTop] = useState(true)
  const [widgetOpacity, setWidgetOpacity] = useState(92)
  const [widgetConfigs, setWidgetConfigs] = useState<WidgetCfg[]>([])

  const isRu = i18n.language === 'ru'

  useEffect(() => {
    if (i18n.language !== store.language) i18n.changeLanguage(store.language)
    ipc.getWidgetState().then((state: any) => {
      if (state) {
        setWidgetsEnabled(state.globalEnabled ?? false)
        setWidgetAlwaysOnTop(state.alwaysOnTop ?? true)
        setWidgetOpacity(Math.round((state.opacity ?? 0.92) * 100))
        setWidgetConfigs((state.configs || []).map((c: any) => ({
          id: c.id, type: c.type, title: c.title, titleRu: c.titleRu, enabled: c.enabled
        })))
      }
    })
  }, [])

  const handleLang = (l: 'ru' | 'en') => { store.setLanguage(l); i18n.changeLanguage(l); ipc.setWidgetLang(l) }
  const handleAutostart = async (enabled: boolean) => { store.setAutostart(enabled); await ipc.setAutostart(enabled) }

  const handleWidgetsToggle = async () => {
    const v = !widgetsEnabled
    setWidgetsEnabled(v)
    await ipc.toggleWidgets(v)
  }

  const handleAlwaysOnTop = async () => {
    const v = !widgetAlwaysOnTop
    setWidgetAlwaysOnTop(v)
    await ipc.setWidgetAlwaysOnTop(v)
  }

  const handleWidgetOpacity = async (value: number) => {
    setWidgetOpacity(value)
    await ipc.setWidgetOpacity(value / 100)
  }

  const handleToggleSingleWidget = async (widgetId: string) => {
    const cfg = widgetConfigs.find(c => c.id === widgetId)
    if (!cfg) return
    const v = !cfg.enabled
    setWidgetConfigs(prev => prev.map(c => c.id === widgetId ? { ...c, enabled: v } : c))
    await ipc.toggleSingleWidget(widgetId, v)
  }

  const Row: React.FC<{ icon: string; label: string; children: React.ReactNode; desc?: string }> = ({ icon, label, children, desc }) => (
    <div className="glass-panel" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--neon-cyan)', flexShrink: 0 }}>{icon}</span>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
            {desc && <div style={{ fontSize: 11, color: 'var(--outline)', marginTop: 2 }}>{desc}</div>}
          </div>
        </div>
        <div style={{ flexShrink: 0, marginLeft: 12 }}>{children}</div>
      </div>
    </div>
  )

  const SectionTitle: React.FC<{ icon: string; text: string }> = ({ icon, text }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'var(--neon-cyan)', marginTop: 12, marginBottom: -4
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
      {text}
    </div>
  )

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 800 }}>
      <div className="page-header"><h1>{t('settings.title')}</h1><p>{t('settings.subtitle')}</p></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        <SectionTitle icon="tune" text={isRu ? 'Общие' : 'General'} />

        <Row icon="translate" label={t('settings.language')}>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['ru', 'en'] as const).map(l => (
              <button key={l} className={store.language === l ? 'glass-btn-primary' : 'glass-btn-ghost'} onClick={() => handleLang(l)} style={{ padding: '8px 16px', fontSize: 13 }}>
                {l === 'ru' ? '🇷🇺 Русский' : '🇬🇧 English'}
              </button>
            ))}
          </div>
        </Row>
        <Row icon="palette" label={t('settings.theme')}>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['dark', 'light'] as const).map(th => (
              <button key={th} className={store.theme === th ? 'glass-btn-primary' : 'glass-btn-ghost'} onClick={() => store.setTheme(th)} style={{ padding: '8px 16px', fontSize: 13 }}>
                {th === 'dark' ? '🌙' : '☀️'} {t(`settings.${th}`)}
              </button>
            ))}
          </div>
        </Row>
        <Row icon="timer" label={t('settings.updateInterval')}>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1000, 2000, 5000].map(ms => (
              <button key={ms} className={store.sensorInterval === ms ? 'glass-btn-primary' : 'glass-btn-ghost'} onClick={() => store.setSensorInterval(ms)} style={{ padding: '8px 16px', fontSize: 13 }}>
                {ms / 1000} {t('settings.seconds')}
              </button>
            ))}
          </div>
        </Row>
        <Row icon="power_settings_new" label={t('settings.autostart')}>
          <div className="glass-toggle" data-state={store.autostart ? 'on' : 'off'} onClick={() => handleAutostart(!store.autostart)}>
            <div className="glass-toggle-thumb" />
          </div>
        </Row>
        <Row icon="cleaning_services" label={t('settings.autoClean')}>
          <div className="glass-toggle" data-state={store.autoClean ? 'on' : 'off'} onClick={() => store.setAutoClean(!store.autoClean)}>
            <div className="glass-toggle-thumb" />
          </div>
        </Row>

        {/* ── WIDGETS SECTION ── */}
        <SectionTitle icon="widgets" text={isRu ? 'Виджеты рабочего стола' : 'Desktop Widgets'} />

        <Row icon="widgets" label={isRu ? 'Включить виджеты' : 'Enable Widgets'}
          desc={isRu ? 'Мини-окна с телеметрией на рабочем столе' : 'Mini telemetry windows on desktop'}>
          <div className="glass-toggle" data-state={widgetsEnabled ? 'on' : 'off'} onClick={handleWidgetsToggle}>
            <div className="glass-toggle-thumb" />
          </div>
        </Row>

        {widgetsEnabled && (
          <>
            {/* Per-widget toggles */}
            {widgetConfigs.map(cfg => (
              <Row key={cfg.id}
                icon={cfg.type === 'cpu_gpu' ? 'thermostat' : 'memory'}
                label={isRu ? cfg.titleRu : cfg.title}
                desc={cfg.type === 'cpu_gpu'
                  ? (isRu ? 'CPU/GPU температуры и загрузка' : 'CPU/GPU temps & load')
                  : (isRu ? 'Использование памяти + быстрое освобождение' : 'RAM usage + quick purge')
                }
              >
                <div className="glass-toggle" data-state={cfg.enabled ? 'on' : 'off'} onClick={() => handleToggleSingleWidget(cfg.id)}>
                  <div className="glass-toggle-thumb" />
                </div>
              </Row>
            ))}

            <Row icon="push_pin" label={isRu ? 'Поверх всех окон' : 'Always on Top'}
              desc={isRu ? 'Виджеты всегда видны поверх окон' : 'Widgets stay above all windows'}>
              <div className="glass-toggle" data-state={widgetAlwaysOnTop ? 'on' : 'off'} onClick={handleAlwaysOnTop}>
                <div className="glass-toggle-thumb" />
              </div>
            </Row>

            <Row icon="opacity" label={isRu ? 'Прозрачность' : 'Opacity'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="range" min={20} max={100} value={widgetOpacity}
                  onChange={e => handleWidgetOpacity(Number(e.target.value))}
                  style={{ width: 130, accentColor: 'var(--neon-cyan)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--neon-cyan)', minWidth: 40, textAlign: 'right' }}>
                  {widgetOpacity}%
                </span>
              </div>
            </Row>
          </>
        )}

        {/* ── DEVELOPER ── */}
        <SectionTitle icon="code" text={t('settings.developer')} />

        <div className="glass-panel" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="glass-btn-ghost" onClick={() => ipc.openExternal('https://t.me/dmitrymx')}>Telegram</button>
            <button className="glass-btn-ghost" onClick={() => ipc.openExternal('https://mxmvdev.ru')}>mxmvdev.ru</button>
          </div>
        </div>
      </div>
    </div>
  )
}
export default Settings
