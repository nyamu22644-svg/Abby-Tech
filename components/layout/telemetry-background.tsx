'use client'

import { useEffect, useState } from 'react'
import { Activity, Zap, Radio, Gauge } from 'lucide-react'

export function TelemetryBackground() {
  const [animationKey, setAnimationKey] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationKey((k) => k + 1)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#040D1A] via-[#0B1730] to-[#071120]" />

      {/* Animated grid overlay */}
      <svg
        className="absolute inset-0 w-full h-full opacity-10"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#38BDF8" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Telemetry waveforms */}
      <svg
        className="absolute inset-0 w-full h-full opacity-5"
        xmlns="http://www.w3.org/2000/svg"
        key={animationKey}
      >
        <defs>
          <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="50%" stopColor="#00D084" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>
        </defs>

        {/* Primary waveform */}
        <path
          d="M 0,200 Q 150,150 300,200 T 600,200 T 900,200 T 1200,200 T 1500,200 T 1800,200"
          stroke="url(#waveGradient)"
          strokeWidth="2"
          fill="none"
          className="animate-pulse"
        />

        {/* Secondary waveform */}
        <path
          d="M 0,300 Q 150,280 300,300 T 600,300 T 900,300 T 1200,300 T 1500,300 T 1800,300"
          stroke="#00D084"
          strokeWidth="1"
          fill="none"
          opacity="0.4"
          className="animate-pulse"
          style={{ animationDelay: '0.5s' }}
        />

        {/* Tertiary waveform */}
        <path
          d="M 0,400 Q 150,380 300,400 T 600,400 T 900,400 T 1200,400 T 1500,400 T 1800,400"
          stroke="#38BDF8"
          strokeWidth="1"
          fill="none"
          opacity="0.3"
          className="animate-pulse"
          style={{ animationDelay: '1s' }}
        />
      </svg>

      {/* Floating telemetry nodes */}
      <div className="absolute top-20 left-20 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-32 right-20 w-40 h-40 bg-emerald-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 right-1/3 w-36 h-36 bg-cyan-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />

      {/* Radial glow effect */}
      <div className="absolute inset-0 radial-gradient pointer-events-none opacity-30" />
    </div>
  )
}

interface OperationalMetric {
  label: string
  value: string | number
  unit?: string
  status: 'active' | 'idle' | 'warning'
  icon: React.ReactNode
}

export function OperationalMetrics() {
  const [metrics, setMetrics] = useState<OperationalMetric[]>([])

  return (
    <div className="space-y-4">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/5 border border-blue-500/20 backdrop-blur-sm hover:bg-white/10 transition-all"
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                metric.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'
              }`}
            >
              {metric.icon}
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">{metric.label}</div>
              <div className="text-sm font-mono text-white">
                {metric.value} {metric.unit && <span className="text-slate-400 text-xs">{metric.unit}</span>}
              </div>
            </div>
          </div>
          <div
            className={`w-2 h-2 rounded-full ${metric.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}
          />
        </div>
      ))}
    </div>
  )
}
