/**
 * Sidebar — Floating pill navigation rail
 * Based on Stitch mockup: vertical nav with glass effect
 */
import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const navItems = [
  { path: '/', icon: 'grid_view', key: 'dashboard' },
  { path: '/hardware', icon: 'memory', key: 'hardware' },
  { path: '/fan-control', icon: 'mode_fan', key: 'fanControl' },
  { path: '/cleaner', icon: 'mop', key: 'cleaner' },
  { path: '/performance', icon: 'speed', key: 'performance' },
  { path: '/benchmarks', icon: 'query_stats', key: 'benchmarks' },
  { path: '/privacy', icon: 'shield', key: 'privacy' },
  { path: '/network', icon: 'wifi_tethering', key: 'network' },
  { path: '/tools', icon: 'build', key: 'tools' },
  { path: '/maintenance', icon: 'health_and_safety', key: 'maintenance' },
]

const bottomItems = [
  { path: '/settings', icon: 'settings', key: 'settings' },
]

const Sidebar: React.FC = () => {
  const { t } = useTranslation()
  const location = useLocation()

  return (
    <nav style={{
      position: 'fixed',
      left: '16px',
      top: 'calc(var(--titlebar-height) + 20px)',
      bottom: '20px',
      width: '64px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 40,
      borderRadius: 'var(--radius-xl)',
      background: 'var(--surface-container)',
      backdropFilter: 'blur(60px) saturate(180%)',
      WebkitBackdropFilter: 'blur(60px) saturate(180%)',
      border: '1px solid var(--outline-variant)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      padding: '16px 0',
      overflow: 'hidden'
    }}>
      {/* Top nav items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
        {navItems.map(item => (
          <NavItem
            key={item.key}
            {...item}
            active={location.pathname === item.path}
            label={t(`nav.${item.key}`)}
          />
        ))}
      </div>

      {/* Bottom items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
        {bottomItems.map(item => (
          <NavItem
            key={item.key}
            {...item}
            active={location.pathname === item.path}
            label={t(`nav.${item.key}`)}
          />
        ))}
      </div>
    </nav>
  )
}

interface NavItemProps {
  path: string
  icon: string
  label: string
  active: boolean
}

const NavItem: React.FC<NavItemProps> = ({ path, icon, label, active }) => {
  return (
    <NavLink
      to={path}
      title={label}
      style={{
        width: '48px',
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius)',
        background: active ? 'rgba(0, 242, 255, 0.15)' : 'transparent',
        border: active ? '1px solid rgba(0, 242, 255, 0.3)' : '1px solid transparent',
        color: active ? 'var(--neon-cyan)' : 'var(--on-surface-variant)',
        textDecoration: 'none',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: active ? '0 0 15px rgba(0, 242, 255, 0.2)' : 'none'
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = 'var(--surface-container-high)'
          e.currentTarget.style.color = 'var(--on-surface)'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--on-surface-variant)'
        }
      }}
    >
      <span className="material-symbols-outlined" style={{
        fontSize: '22px',
        fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0"
      }}>
        {icon}
      </span>
    </NavLink>
  )
}

export default Sidebar
