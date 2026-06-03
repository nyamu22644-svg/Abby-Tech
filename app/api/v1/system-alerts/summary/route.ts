import { NextResponse } from 'next/server'

import { getSystemAlerts } from '@/lib/alerts/system-alerts'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const alerts = await getSystemAlerts(supabase)
  const activeAlerts = alerts.filter((alert) => alert.status === 'ACTIVE')
  const criticalAlerts = activeAlerts.filter((alert) => alert.severity === 'CRITICAL' || alert.severity === 'HIGH')

  return NextResponse.json({
    activeCount: activeAlerts.length,
    criticalCount: criticalAlerts.length,
    latest: activeAlerts[0]
      ? {
          title: activeAlerts[0].title,
          source: activeAlerts[0].source,
          severity: activeAlerts[0].severity,
        }
      : null,
  })
}
