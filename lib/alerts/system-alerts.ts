import { syncLifecycleAlerts } from '@/lib/alerts/lifecycle-alerts'

export type SystemAlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type SystemAlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SILENCED'
export type SystemAlertSource = 'Incubation' | 'Batch Workflow' | 'Mortality' | 'Orders'

export type SystemAlert = {
  id: string
  title: string
  description: string
  source: SystemAlertSource
  severity: SystemAlertSeverity
  status: SystemAlertStatus
  triggeredAt: string
  context: string
}

export async function getSystemAlerts(supabase: any) {
  await syncLifecycleAlerts(supabase)

  const [
    { data: incubationAlerts },
    { data: batches },
    { data: mortalityEvents },
    { data: orders },
  ] = await Promise.all([
    supabase
      .from('alert_events')
      .select('*, incubators(name), egg_batches(batch_number)')
      .order('triggered_at', { ascending: false }),
    supabase
      .from('egg_batches')
      .select('id, batch_number, status, set_date, expected_hatch_date, actual_hatch_date, incubator_id, quantity_received, quantity_set, accepted_eggs, quantity_hatched, quantity_culled, mortality_count, created_at, updated_at, deleted_at')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false }),
    supabase
      .from('mortality_events')
      .select('id, count, cause, stage, recorded_at, egg_batches(batch_number)')
      .order('recorded_at', { ascending: false })
      .limit(20),
    (supabase as any)
      .from('orders')
      .select('id, order_number, total_quantity, status, dispatch_status, created_at, order_items(id, batch_id, quantity)')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  return buildSystemAlerts({
    incubationAlerts: incubationAlerts || [],
    batches: batches || [],
    mortalityEvents: mortalityEvents || [],
    orders: orders || [],
  })
}

export function buildSystemAlerts({
  incubationAlerts,
  batches,
  mortalityEvents,
  orders,
}: {
  incubationAlerts: any[]
  batches: any[]
  mortalityEvents: any[]
  orders: any[]
}) {
  const alerts: SystemAlert[] = []
  const batchesById = new Map(batches.map((batch) => [batch.id, batch]))

  incubationAlerts.forEach((alert) => {
    const source = normalizeAlertSource(alert.source || (String(alert.alert_key || '').startsWith('batch:') ? 'Batch Workflow' : 'Incubation'))
    alerts.push({
      id: `alert-${alert.id}`,
      title: alert.title,
      description: alert.description || '',
      source,
      severity: alert.severity || 'MEDIUM',
      status: alert.status || 'ACTIVE',
      triggeredAt: alert.triggered_at,
      context: [
        readRelatedName(alert.incubators, 'name') || 'Unknown incubator',
        readRelatedName(alert.egg_batches, 'batch_number'),
      ].filter(Boolean).join(' - '),
    })
  })

  mortalityEvents.forEach((event) => {
    const count = Number(event.count || 0)
    if (count <= 0) return
    alerts.push({
      id: `mortality-${event.id}`,
      title: 'Mortality recorded',
      description: `${count.toLocaleString()} birds lost at ${String(event.stage || 'UNKNOWN').toLowerCase().replace(/_/g, ' ')} stage.`,
      source: 'Mortality',
      severity: count >= 10 ? 'HIGH' : 'MEDIUM',
      status: 'ACTIVE',
      triggeredAt: event.recorded_at,
      context: readRelatedName(event.egg_batches, 'batch_number') || 'Unknown batch',
    })
  })

  orders.forEach((order) => {
    const item = Array.isArray(order.order_items) ? order.order_items.find((entry: any) => entry.batch_id) : null
    const batch = item?.batch_id ? batchesById.get(item.batch_id) : null
    if (!batch || ['CANCELLED', 'DELIVERED', 'DISPATCHED'].includes(order.status)) return
    const available = getAvailableChicks(batch)
    const requested = Number(order.total_quantity || item?.quantity || 0)
    if (requested > available) {
      alerts.push({
        id: `order-risk-${order.id}`,
        title: 'Order fulfillment risk',
        description: `${requested.toLocaleString()} chicks requested but only ${available.toLocaleString()} projected from allocated batch.`,
        source: 'Orders',
        severity: 'HIGH',
        status: 'ACTIVE',
        triggeredAt: order.created_at,
        context: `${order.order_number} - ${batch.batch_number}`,
      })
    }
  })

  return alerts.sort((a, b) => {
    const severityDiff = severityRank(b.severity) - severityRank(a.severity)
    if (severityDiff !== 0) return severityDiff
    return new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
  })
}

function getAvailableChicks(batch: any) {
  if (['COMPLETED', 'BROODER'].includes(batch.status)) {
    return Math.max(Number(batch.quantity_hatched || 0) - Number(batch.quantity_culled || 0) - Number(batch.mortality_count || 0), 0)
  }

  return Math.max(
    Number(batch.quantity_set ?? batch.accepted_eggs ?? batch.quantity_received ?? 0) -
      Number(batch.quantity_culled || 0) -
      Number(batch.mortality_count || 0),
    0
  )
}

function readRelatedObject(value: any) {
  if (!value) return null
  return Array.isArray(value) ? value[0] || null : value
}

function readRelatedName(value: any, key: string) {
  const object = readRelatedObject(value)
  return object?.[key] || null
}

function normalizeAlertSource(value: string): SystemAlertSource {
  if (value === 'Batch Workflow') return 'Batch Workflow'
  if (value === 'Mortality') return 'Mortality'
  if (value === 'Orders') return 'Orders'
  return 'Incubation'
}

function severityRank(severity: SystemAlertSeverity) {
  return {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
  }[severity]
}
