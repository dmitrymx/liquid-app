/**
 * CircularGauge — 3D gauge for benchmarks
 * Based on Benchmarks mockup: conic gradient + SVG fill
 */
import React from 'react'

interface CircularGaugeProps {
  value: number | string
  unit: string
  label: string
  maxValue?: number
  color?: string
  size?: number
}

const CircularGauge: React.FC<CircularGaugeProps> = ({
  value,
  unit,
  label,
  maxValue = 100,
  color = 'var(--neon-cyan)',
  size = 160
}) => {
  const numericValue = typeof value === 'string' ? parseFloat(value) || 0 : value
  const percent = Math.min((numericValue / maxValue) * 100, 100)
  const radius = (size / 2) - 14
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '12px'
    }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        {/* Outer decorative ring */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: `conic-gradient(from 180deg, rgba(0, 242, 255, 0.1) 0%, rgba(21, 255, 209, 0.05) 50%, transparent 100%)`,
          border: '2px solid rgba(255,255,255,0.04)'
        }} />

        {/* SVG gauge */}
        <svg width={size} height={size} style={{
          transform: 'rotate(-90deg)',
          position: 'relative',
          zIndex: 1
        }}>
          {/* Dark track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={8}
          />
          {/* Filled arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
              filter: `drop-shadow(0 0 8px ${color})`
            }}
          />
          {/* Notch at end */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--neon-teal)"
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={`3 ${circumference - 3}`}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </svg>

        {/* Center display */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <span style={{
            fontSize: size * 0.22,
            fontWeight: 800,
            color: color,
            textShadow: `0 0 12px ${color}`,
            lineHeight: 1,
            letterSpacing: '-0.03em'
          }}>
            {typeof value === 'number' ? value.toFixed(1) : value}
          </span>
          <span style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--on-surface-variant)',
            marginTop: 4
          }}>
            {unit}
          </span>
        </div>
      </div>

      {/* Label */}
      <span style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--on-surface-variant)'
      }}>
        {label}
      </span>
    </div>
  )
}

export default CircularGauge
