import { Metadata, Viewport } from 'next'
import { Suspense } from 'react'

import { AbbytechLogo } from '@/components/branding/logo'
import { PoweredByEdgait } from '@/components/branding/powered-by-edgait'
import { TelemetryBackground, OperationalMetrics } from '@/components/layout/telemetry-background'
import { SYSTEM_BRANDING } from '@/lib/branding'
import { GlassmorphicLoginForm } from './components/glassmorphic-login-form'

export const metadata: Metadata = {
  title: 'Operational Access | Abbye Chicks',
  description: 'Premium poultry hatchery operations platform',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background">
      <TelemetryBackground />

      <div className="relative z-10 hidden w-3/5 flex-col justify-between p-12 lg:flex">
        <AbbytechLogo size="lg" showText={true} variant="dark" />

        <div className="max-w-md space-y-8">
          <div>
            <div className="mb-3 inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase text-amber-200">
              Premium poultry starts here
            </div>
            <h2 className="mb-4 text-4xl font-bold text-cyan-100">
              Premium Poultry Control Room
            </h2>
            <p className="text-sm leading-relaxed text-slate-300">
              Hatchery operations for accepted eggs, incubator placement, hatch forecasting,
              customer orders, and profitability.
            </p>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-medium uppercase text-slate-400">System Status</div>
            <OperationalMetrics />
          </div>

          <div className="space-y-3 border-t border-white/10 pt-6">
            {[
              {
                icon: '01',
                title: 'Batch Traceability',
                desc: 'Supplier, inspection, placement, and hatch records stay connected',
              },
              {
                icon: '02',
                title: 'Incubator Precision',
                desc: 'Units, trays, set times, hatch dates, and telemetry stay aligned',
              },
              {
                icon: '03',
                title: 'Commercial Clarity',
                desc: 'Costs, bookings, payments, and chick availability remain visible',
              },
            ].map((item) => (
              <div key={item.title} className="group flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/10 text-[10px] font-semibold text-amber-200 transition group-hover:border-cyan-300/50 group-hover:text-cyan-100">
                  {item.icon}
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{item.title}</div>
                  <div className="text-xs text-slate-400">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <div className="font-mono text-xs text-slate-500">
            Operational System v{SYSTEM_BRANDING.appVersion} - {SYSTEM_BRANDING.edition}
          </div>
          <div className="text-xs text-slate-600">Abbye Chicks. All operational systems secured.</div>
          <PoweredByEdgait />
        </div>
      </div>

      <div className="relative z-10 flex w-full items-center justify-center px-4 py-12 lg:w-2/5">
        <div className="w-full">
          <div className="mb-8 text-center lg:hidden">
            <AbbytechLogo size="md" showText={true} variant="dark" />
            <p className="mt-3 text-xs text-slate-400">Operational Access</p>
          </div>

          <Suspense fallback={null}>
            <GlassmorphicLoginForm />
          </Suspense>

          <div className="mt-6 flex justify-center lg:hidden">
            <PoweredByEdgait />
          </div>
        </div>
      </div>
    </div>
  )
}
