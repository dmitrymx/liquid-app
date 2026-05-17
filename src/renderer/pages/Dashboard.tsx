/**
 * Dashboard Page — Main System Overview
 * Based on Stitch mockup: Health Orb, CPU/RAM/Storage rings, Security bar
 */
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useHardwareStore } from '../store/useHardwareStore'
import HealthOrb from '../components/HealthOrb'
import RingProgress from '../components/RingProgress'
import { formatBytes, formatPercent, formatUptime, formatTemp, formatSpeed, getLoadColor } from '../lib/formatters'

const Dashboard: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const data = useHardwareStore(s => s.data)

  const cpuLoad = data?.cpu?.load ?? 0
  const memUsage = data?.memory?.usage ?? 0
  const memTotal = data?.memory?.total ?? 0
  const memActive = data?.memory?.active ?? 0
  const storageUsage = data?.disks?.[0]?.usage ?? 0
  const storageFree = data?.disks?.[0]?.available ?? 0
  const uptime = data?.uptime ?? 0
  const rxSec = data?.network?.rx_sec ?? 0
  const txSec = data?.network?.tx_sec ?? 0
  const cpuTemp = data?.cpu?.temperature

  /* Calculate system health score */
  const healthScore = Math.max(0, Math.min(100, Math.round(
    100 - (cpuLoad * 0.3) - (memUsage * 0.3) - (storageUsage * 0.2) -
    ((cpuTemp && cpuTemp > 75 ? (cpuTemp - 75) * 2 : 0) * 0.2)
  )))

  const healthLabel = healthScore >= 80 ? t('dashboard.optimal') :
                      healthScore >= 50 ? t('dashboard.warning') :
                      t('dashboard.critical')

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1200 }}>
      {/* Page Header */}
      <div className="page-header">
        <h1>{t('dashboard.title')}</h1>
        <p>{t('dashboard.subtitle')}</p>
      </div>

      {/* Main Bento Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: 'auto auto auto',
        gap: 'var(--gutter)',
      }}>

        {/* ===== HEALTH ORB — Spans 2 cols ===== */}
        <div className="glass-panel" style={{
          gridColumn: '1 / 3',
          padding: '40px',
          display: 'flex',
          alignItems: 'center',
          gap: '48px',
          minHeight: 280
        }}>
          <div style={{ flexShrink: 0 }}>
            <HealthOrb score={healthScore} label={healthLabel} size={200} />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--neon-cyan)',
              marginBottom: 8
            }}>
              {t('dashboard.systemHealth')}
            </div>
            <div style={{
              fontSize: '64px',
              fontWeight: 800,
              color: 'var(--on-surface)',
              lineHeight: 1,
              letterSpacing: '-0.04em',
              display: 'flex',
              alignItems: 'baseline',
              gap: 4
            }}>
              {healthScore}
              <span style={{ fontSize: 20, color: 'var(--outline)', fontWeight: 500 }}>/100</span>
            </div>
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--neon-teal)',
              marginTop: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>
              {t('dashboard.efficiency')}: {formatPercent(healthScore)}
            </div>

            {/* Quick stats */}
            <div style={{
              display: 'flex',
              gap: 24,
              marginTop: 20,
              flexWrap: 'wrap'
            }}>
              <QuickStat icon="thermostat" label="CPU" value={formatTemp(cpuTemp)} color={getLoadColor(cpuLoad)} />
              <QuickStat icon="schedule" label={t('dashboard.uptime')} value={formatUptime(uptime)} />
              <QuickStat icon="download" label="↓" value={formatSpeed(rxSec)} />
              <QuickStat icon="upload" label="↑" value={formatSpeed(txSec)} />
            </div>
          </div>
        </div>

        {/* ===== SECURITY STATUS ===== */}
        <div className="glass-panel" style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16
            }}>
              <span className="material-symbols-outlined fill" style={{
                fontSize: 20,
                color: 'var(--neon-teal)'
              }}>verified_user</span>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--neon-teal)'
              }}>
                {t('dashboard.defenseActive')}
              </span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
              {t('dashboard.noThreats')}
            </div>
            <div style={{
              fontSize: 11,
              color: 'var(--outline)',
              marginTop: 8
            }}>
              {t('dashboard.lastScan')}: {new Date().toLocaleDateString()}
            </div>
          </div>

          <button className="glass-btn-ghost" style={{ marginTop: 16, width: '100%' }} onClick={() => navigate('/hardware')}>
            {t('dashboard.viewDetails')}
          </button>
        </div>

        {/* ===== CPU RING ===== */}
        <div className="glass-panel" style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <RingProgress
            value={cpuLoad}
            size={110}
            strokeWidth={5}
            color={getLoadColor(cpuLoad)}
            label={t('dashboard.cpuLoad')}
            sublabel={data?.cpu?.brand?.split(' ').slice(0, 3).join(' ') || ''}
          />
        </div>

        {/* ===== MEMORY RING ===== */}
        <div className="glass-panel" style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <RingProgress
            value={memUsage}
            size={110}
            strokeWidth={5}
            color="var(--neon-teal)"
            label={t('dashboard.memory')}
            sublabel={`${formatBytes(memActive)} / ${formatBytes(memTotal)}`}
          />
        </div>

        {/* ===== STORAGE RING ===== */}
        <div className="glass-panel" style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <RingProgress
            value={storageUsage}
            size={110}
            strokeWidth={5}
            color="var(--neon-blue)"
            label={t('dashboard.storage')}
            sublabel={`${formatBytes(storageFree)} ${t('dashboard.free')}`}
          />
        </div>
      </div>
    </div>
  )
}

/* Quick stat chip */
const QuickStat: React.FC<{ icon: string; label: string; value: string; color?: string }> = ({ icon, label, value, color }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 'var(--radius-full)',
    background: 'var(--surface-container)',
    border: '1px solid var(--outline-variant)'
  }}>
    <span className="material-symbols-outlined" style={{ fontSize: 14, color: color || 'var(--outline)' }}>{icon}</span>
    <span style={{ fontSize: 11, color: 'var(--outline)', fontWeight: 500 }}>{label}</span>
    <span style={{ fontSize: 12, fontWeight: 700, color: color || 'var(--on-surface)' }}>{value}</span>
  </div>
)

export default Dashboard
