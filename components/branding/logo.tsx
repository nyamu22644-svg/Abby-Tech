import React from 'react'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  showText?: boolean
  variant?: 'light' | 'dark'
}

const sizeMap = {
  sm: 24,
  md: 32,
  lg: 48,
  xl: 64,
}

export function AbbytechLogo({ size = 'md', className = '', showText = true, variant = 'light' }: LogoProps) {
  const dim = sizeMap[size]

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        <defs>
          <linearGradient id="logo-glow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#00D084" />
          </linearGradient>
          <filter id="glow-filter">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer hexagon shield - industrial protection */}
        <path
          d="M32 2 L54 15 L54 49 L32 62 L10 49 L10 15 Z"
          fill="none"
          stroke="url(#logo-glow)"
          strokeWidth="1"
          opacity="0.3"
        />

        {/* Inner hexagon - core system */}
        <path
          d="M32 8 L50 18 L50 46 L32 56 L14 46 L14 18 Z"
          fill="none"
          stroke="url(#logo-glow)"
          strokeWidth="1.5"
          filter="url(#glow-filter)"
        />

        {/* Telemetry nodes - operational intelligence */}
        <g filter="url(#glow-filter)">
          <circle cx="32" cy="20" r="2.5" fill="#38BDF8" opacity="0.8" />
          <circle cx="42" cy="32" r="2.5" fill="#00D084" opacity="0.8" />
          <circle cx="32" cy="44" r="2.5" fill="#38BDF8" opacity="0.8" />
          <circle cx="22" cy="32" r="2.5" fill="#00D084" opacity="0.8" />
        </g>

        {/* Central hatch geometry - incubation core */}
        <g filter="url(#glow-filter)">
          <path
            d="M32 24 L37 32 L32 40 L27 32 Z"
            fill="none"
            stroke="url(#logo-glow)"
            strokeWidth="1.5"
          />
        </g>

        {/* Connection lines - system integrity */}
        <g stroke="url(#logo-glow)" strokeWidth="0.8" opacity="0.4">
          <line x1="32" y1="20" x2="32" y2="24" />
          <line x1="42" y1="32" x2="37" y2="32" />
          <line x1="32" y1="44" x2="32" y2="40" />
          <line x1="22" y1="32" x2="27" y2="32" />
        </g>
      </svg>

      {showText && (
        <div className="flex flex-col">
          <div className={`font-bold text-lg tracking-tight ${variant === 'dark' ? 'text-white' : 'text-slate-950'}`}>
            Abby Tech
          </div>
          <div className={`text-xs font-medium ${variant === 'dark' ? 'text-blue-300' : 'text-slate-500'} tracking-wide uppercase`}>
            Operational
          </div>
        </div>
      )}
    </div>
  )
}

// Icon-only version
export function AbbytechIcon({ size = 'md', className = '', variant = 'light' }: Omit<LogoProps, 'showText'>) {
  const dim = sizeMap[size]

  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`flex-shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id="icon-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#00D084" />
        </linearGradient>
        <filter id="icon-glow-filter">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path
        d="M32 2 L54 15 L54 49 L32 62 L10 49 L10 15 Z"
        fill="none"
        stroke="url(#icon-glow)"
        strokeWidth="1"
        opacity="0.3"
      />

      <path
        d="M32 8 L50 18 L50 46 L32 56 L14 46 L14 18 Z"
        fill="none"
        stroke="url(#icon-glow)"
        strokeWidth="1.5"
        filter="url(#icon-glow-filter)"
      />

      <g filter="url(#icon-glow-filter)">
        <circle cx="32" cy="20" r="2.5" fill="#38BDF8" opacity="0.8" />
        <circle cx="42" cy="32" r="2.5" fill="#00D084" opacity="0.8" />
        <circle cx="32" cy="44" r="2.5" fill="#38BDF8" opacity="0.8" />
        <circle cx="22" cy="32" r="2.5" fill="#00D084" opacity="0.8" />
      </g>

      <g filter="url(#icon-glow-filter)">
        <path
          d="M32 24 L37 32 L32 40 L27 32 Z"
          fill="none"
          stroke="url(#icon-glow)"
          strokeWidth="1.5"
        />
      </g>

      <g stroke="url(#icon-glow)" strokeWidth="0.8" opacity="0.4">
        <line x1="32" y1="20" x2="32" y2="24" />
        <line x1="42" y1="32" x2="37" y2="32" />
        <line x1="32" y1="44" x2="32" y2="40" />
        <line x1="22" y1="32" x2="27" y2="32" />
      </g>
    </svg>
  )
}
