import { GlassmorphicLoginForm } from './components/glassmorphic-login-form'
import { TelemetryBackground, OperationalMetrics } from '@/components/layout/telemetry-background'
import { AbbytechLogo } from '@/components/branding/logo'
import { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Operational Access | Abby Tech',
  description: 'Enterprise Smart Hatchery Operations Platform',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex relative overflow-hidden">
      {/* Animated Telemetry Background */}
      <TelemetryBackground />

      {/* Left Panel - Operational Intelligence */}
      <div className="hidden lg:flex lg:w-3/5 flex-col justify-between p-12 relative z-10">
        {/* Logo */}
        <div>
          <AbbytechLogo size="lg" showText={true} variant="dark" />
        </div>

        {/* Operational Intelligence Section */}
        <div className="space-y-8 max-w-md">
          <div>
            <h2 className="text-4xl font-bold bg-gradient-to-r from-blue-300 via-cyan-300 to-emerald-300 bg-clip-text text-transparent mb-4">
              Industrial Intelligence
            </h2>
            <p className="text-slate-300 text-sm leading-relaxed">
              Enterprise-grade hatchery operations platform for precision breeding, environmental intelligence, and commercial fulfillment.
            </p>
          </div>

          {/* Operational Metrics */}
          <div className="space-y-3">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400">System Status</div>
            <OperationalMetrics />
          </div>

          {/* Key Features */}
          <div className="space-y-3 pt-6 border-t border-white/10">
            {[
              {
                icon: '◈',
                title: 'Real-Time Operations',
                desc: 'Live hatchery management and environmental telemetry',
              },
              {
                icon: '⊙',
                title: 'Intelligence Dashboard',
                desc: 'Profitability analysis, batch tracking, and optimization',
              },
              {
                icon: '◆',
                title: 'Enterprise Security',
                desc: 'Role-based access, audit logging, and operational continuity',
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-3 items-start group">
                <div className="text-emerald-400 text-lg flex-shrink-0 mt-0.5 group-hover:scale-125 transition">{item.icon}</div>
                <div>
                  <div className="text-sm font-medium text-white">{item.title}</div>
                  <div className="text-xs text-slate-400">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="space-y-1">
          <div className="text-xs text-slate-500 font-mono">Operational System v1.0 • Enterprise Edition</div>
          <div className="text-xs text-slate-600">© 2024 Abby Tech. All operational systems secured.</div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-2/5 flex items-center justify-center px-4 py-12 relative z-10">
        <div className="w-full">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <AbbytechLogo size="md" showText={true} variant="dark" />
            <p className="text-xs text-slate-400 mt-3">Operational Access</p>
          </div>

          {/* Login Form */}
          <GlassmorphicLoginForm />
        </div>
      </div>

      {/* Radial gradient overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(56, 189, 248, 0.1)" />
              <stop offset="100%" stopColor="rgba(56, 189, 248, 0)" />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#glow)" />
        </svg>
      </div>
    </div>
  )
}
