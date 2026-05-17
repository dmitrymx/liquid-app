/**
 * RingProgress — SVG ring progress indicator
 * Used in Dashboard for CPU/RAM/Storage
 */
import React from 'react'

interface RingProgressProps {
  value: number
  max?: number
  size?: number
  strokeWidth?: number
  color?: string
  label?: string
  sublabel?: string
  showPercent?: boolean
}

const RingProgress: React.FC<RingProgressProps> = ({
  value,
  max = 100,
  size = 100,
  strokeWidth = 6,
  color = 'var(--neon-cyan)',
  label,
  sublabel,
  showPercent = true
}) => {
  const radius = (size / 2) - strokeWidth - 4
  const circumference = 2 * Math.PI * radius
  const percent = Math.min(value / max * 100, 100)
  const offset = circumference - (percent / 100) * circumference

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px'
    }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
          />
          {/* Fill */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
              filter: `drop-shadow(0 0 6px ${color})`
            }}
          />
        </svg>
        {/* Center text */}
        {showPercent && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column'
          }}>
            <span style={{
              fontSize: size * 0.22,
              fontWeight: 700,
              color: 'var(--on-surface)',
              lineHeight: 1
            }}>
              {Math.round(percent)}
            </span>
            <span style={{
              fontSize: 9,
              color: 'var(--outline)',
              fontWeight: 500
            }}>%</span>
          </div>
        )}
      </div>
      {label && (
        <span style={{
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--on-surface-variant)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>{label}</span>
      )}
      {sublabel && (
        <span style={{
          fontSize: '11px',
          color: 'var(--outline)',
          marginTop: '-4px'
        }}>{sublabel}</span>
      )}
    </div>
  )
}

export default RingProgress
