import React from 'react'
import { useTranslation } from 'react-i18next'

const About: React.FC = () => {
  const { t } = useTranslation()
  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', paddingTop: 48 }}>
      {/* Logo */}
      <div style={{
        width: 100, height: 100, borderRadius: 'var(--radius-lg)', margin: '0 auto 32px',
        background: 'rgba(0, 242, 255, 0.1)', border: '1px solid rgba(0, 242, 255, 0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 40px rgba(0, 242, 255, 0.15)'
      }}>
        <span className="material-symbols-outlined fill" style={{ fontSize: 48, color: 'var(--neon-cyan)' }}>water_drop</span>
      </div>
      <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8 }}>Liquid App</h1>
      <p style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginBottom: 32 }}>{t('about.description')}</p>
      <div className="glass-panel" style={{ padding: '32px', textAlign: 'left' }}>
        <InfoRow label={t('about.version')} value={__APP_VERSION__ || '1.6.0'} />
        <InfoRow label={t('about.developer')} value={t('about.developerName')} />
        <InfoRow label="" value={`${t('about.city')}, ${t('about.year')}`} />
      </div>
    </div>
  )
}

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--outline-variant)' }}>
    <span style={{ fontSize: 13, color: 'var(--outline)' }}>{label}</span>
    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>{value}</span>
  </div>
)

export default About
