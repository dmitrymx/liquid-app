/**
 * HealthOrb — Animated central health indicator
 * Based on Dashboard mockup: 3D glass orb with rotating rings
 */
import React from 'react'

interface HealthOrbProps {
  score: number
  label?: string
  size?: number
}

const HealthOrb: React.FC<HealthOrbProps> = ({ score, label = 'Optimal', size = 200 }) => {
  const getColor = () => {
    if (score >= 80) return { main: '#15ffd1', glow: 'rgba(21, 255, 209, 0.4)', gradient: 'linear-gradient(135deg, #00f2ff, #15ffd1)' }
    if (score >= 50) return { main: '#ffc107', glow: 'rgba(255, 193, 7, 0.4)', gradient: 'linear-gradient(135deg, #ffc107, #ff9800)' }
    return { main: '#ff4444', glow: 'rgba(255, 68, 68, 0.4)', gradient: 'linear-gradient(135deg, #ff4444, #d32f2f)' }
  }

  const color = getColor()
  const r = (size / 2) - 10

  return (
    <div style={{
      position: 'relative',
      width: size,
      height: size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute',
        width: size * 0.7,
        height: size * 0.7,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${color.glow} 0%, transparent 70%)`,
        filter: 'blur(20px)',
        animation: 'pulse-glow 3s ease-in-out infinite'
      }} />

      {/* Outer ring 1 — slow spin */}
      <div style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: '50%',
        border: `1px solid rgba(0, 242, 255, 0.15)`,
        animation: 'spin-slow 10s linear infinite'
      }}>
        <div style={{
          position: 'absolute',
          top: '-3px',
          left: '50%',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: color.main,
          boxShadow: `0 0 8px ${color.main}`,
          transform: 'translateX(-50%)'
        }} />
      </div>

      {/* Outer ring 2 — reverse spin */}
      <div style={{
        position: 'absolute',
        width: size * 0.88,
        height: size * 0.88,
        borderRadius: '50%',
        border: '1px solid rgba(21, 255, 209, 0.1)',
        animation: 'spin-slow-reverse 15s linear infinite'
      }}>
        <div style={{
          position: 'absolute',
          bottom: '-2px',
          left: '50%',
          width: '4px',
          height: '4px',
          borderRadius: '50%',
          background: 'var(--neon-cyan)',
          boxShadow: '0 0 6px var(--neon-cyan)',
          transform: 'translateX(-50%)'
        }} />
      </div>

      {/* Glass orb body */}
      <div style={{
        width: size * 0.65,
        height: size * 0.65,
        borderRadius: '50%',
        background: 'rgba(24, 33, 37, 0.5)',
        backdropFilter: 'blur(30px)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderTopColor: 'rgba(255,255,255,0.3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `
          inset 0 -20px 30px rgba(0,0,0,0.3),
          inset 0 10px 20px rgba(255,255,255,0.05),
          0 0 40px ${color.glow}
        `,
        position: 'relative',
        zIndex: 2
      }}>
        {/* Score number */}
        <span style={{
          fontSize: size * 0.2,
          fontWeight: 800,
          color: color.main,
          textShadow: `0 0 15px ${color.glow}`,
          lineHeight: 1,
          letterSpacing: '-0.04em'
        }}>
          {score}
        </span>
        {/* Label */}
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--on-surface-variant)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginTop: 4
        }}>
          {label}
        </span>
      </div>
    </div>
  )
}

export default HealthOrb
