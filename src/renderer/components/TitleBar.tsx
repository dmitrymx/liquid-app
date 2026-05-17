/**
 * TitleBar — Custom Windows 11 title bar
 * Frameless window drag region + minimize/maximize/close buttons
 */
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '../lib/ipc'
import { useAppStore } from '../store/useAppStore'

declare const __APP_VERSION__: string

const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false)
  const [logSaving, setLogSaving] = useState(false)
  const [logSaved, setLogSaved] = useState(false)
  const { t } = useTranslation()
  const { language, setLanguage, theme, setTheme } = useAppStore()

  useEffect(() => {
    ipc.isMaximized().then(setIsMaximized)
  }, [])

  const toggleLang = () => {
    const next = language === 'ru' ? 'en' : 'ru'
    setLanguage(next)
    import('i18next').then(i18n => i18n.default.changeLanguage(next))
    ipc.setWidgetLang(next)
  }

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const handleSaveLogs = async () => {
    setLogSaving(true)
    try {
      const result = await ipc.saveLogs() as any
      if (result?.ok) {
        setLogSaved(true)
        setTimeout(() => setLogSaved(false), 2000)
        // Open the folder so user can find the file
        ipc.openLogsFolder()
      }
    } catch { /* ignore */ }
    setLogSaving(false)
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: 'var(--titlebar-height)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 50,
      WebkitAppRegion: 'drag' as any,
      padding: '0 16px',
      background: 'var(--surface-container)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--outline-variant)'
    }}>
      {/* Left: Brand */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        WebkitAppRegion: 'drag' as any
      }}>
        <span style={{
          fontSize: '13px',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--on-surface)',
          WebkitAppRegion: 'drag' as any
        }}>
          Liquid App
        </span>
        <span style={{
          fontSize: '10px',
          color: 'var(--outline)',
          fontWeight: 500
        }}>v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.7.0'}</span>
      </div>

      {/* Right: Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        WebkitAppRegion: 'no-drag' as any
      }}>
        {/* Language toggle */}
        <button onClick={toggleLang} style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--on-surface-variant)',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 600,
          padding: '4px 8px',
          borderRadius: '4px',
          transition: 'color 0.2s'
        }} title={language === 'ru' ? 'Switch to English' : 'Переключить на русский'}>
          {language === 'ru' ? '🇷🇺 RU' : '🇬🇧 EN'}
        </button>

        {/* Theme toggle */}
        <button onClick={toggleTheme} style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--on-surface-variant)',
          cursor: 'pointer',
          padding: '4px 8px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center'
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            {theme === 'dark' ? 'light_mode' : 'dark_mode'}
          </span>
        </button>

        {/* Save Logs button */}
        <button
          onClick={handleSaveLogs}
          disabled={logSaving}
          style={{
            background: logSaved ? 'rgba(34, 197, 94, 0.15)' : 'transparent',
            border: logSaved ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid transparent',
            color: logSaved ? '#22c55e' : 'var(--on-surface-variant)',
            cursor: logSaving ? 'wait' : 'pointer',
            padding: '4px 8px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.2s',
            fontSize: '11px',
            fontWeight: 600,
            opacity: logSaving ? 0.5 : 1
          }}
          title={language === 'ru' ? 'Сохранить логи для отладки' : 'Save debug logs'}
          onMouseEnter={e => {
            if (!logSaved) e.currentTarget.style.background = 'rgba(0, 242, 255, 0.08)'
          }}
          onMouseLeave={e => {
            if (!logSaved) e.currentTarget.style.background = 'transparent'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            {logSaved ? 'check_circle' : 'bug_report'}
          </span>
          {logSaved
            ? (language === 'ru' ? 'Сохранено!' : 'Saved!')
            : (language === 'ru' ? 'Логи' : 'Logs')}
        </button>

        {/* Window controls */}
        <button onClick={() => ipc.minimize()} className="titlebar-btn" aria-label="Minimize">
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>remove</span>
        </button>
        <button onClick={() => { ipc.maximize(); setIsMaximized(!isMaximized) }} className="titlebar-btn" aria-label="Maximize">
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            {isMaximized ? 'filter_none' : 'crop_square'}
          </span>
        </button>
        <button onClick={() => ipc.close()} className="titlebar-btn titlebar-btn-close" aria-label="Close">
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
        </button>
      </div>

      {/* titlebar-btn styles are in glass.css */}
    </div>
  )
}

export default TitleBar
