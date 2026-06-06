import { isPaymentFollowUpDue, runOrderAutomation } from '@/lib/automation/order-automation'
import { syncLifecycleAlerts } from '@/lib/alerts/lifecycle-alerts'

export type SystemAlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type SystemAlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SILENCED'
export type SystemAlertSource = 'Incubation' | 'Batch Workflow' | 'Mortality' | 'Orders' | 'Customers'

export type SystemAlert = {
  id: string
  title: string
  description: string
  source: SystemAlertSource
  severity: SystemAlertSeverity
  status: SystemAlertStatus
  triggeredAt: string
  context: string
  href?: string
}

export async function getSystemAlerts(supabase: any) {
  await runOrderAutomation(supabase)
  await syncLifecycleAlerts(supabase)

  const [
    { data: incubationAlerts },
    { data: batches },
    { data: mortalityEvents },
    { data: orders },
    { data: orderItems },
    { data: customerFollowUps },
    { data: settings },
  ] = await Promise.all([
    supabase
      .from('alert_events')
      .select('*, incubators(name), egg_batches(batch_number)')
      .order('triggered_at', { ascending: false }),
    supabase
      .from('egg_batches')
      .select('id, batch_number, breed_type, status, set_date, expected_hatch_date, actual_hatch_date, incubator_id, quantity_received, quantity_set, accepted_eggs, rejected_eggs, quantity_hatched, quantity_culled, mortality_count, created_at, updated_at, deleted_at')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false }),
    supabase
      .from('mortality_events')
      .select('id, count, cause, stage, recorded_at, egg_batches(batch_number)')
      .order('recorded_at', { ascending: false })
      .limit(20),
    (supabase as any)
      .from('orders')
      .select('id, order_number, total_quantity, status, dispatch_status, payment_status, balance_due, required_by_date, notes, created_at, updated_at, customers(name, phone), order_items(id, batch_id, quantity, status)')
      .order('created_at', { ascending: false })
      .limit(100),
    (supabase as any)
      .from('order_items')
      .select('batch_id, quantity, status, orders(status, deleted_at)')
      .not('batch_id', 'is', null),
    supabase
      .from('customers')
      .select('id, name, phone, follow_up_at, follow_up_reason, customer_status')
      .is('deleted_at', null)
      .not('follow_up_at', 'is', null)
      .lte('follow_up_at', new Date().toISOString())
      .order('follow_up_at', { ascending: true })
      .limit(50),
    supabase
      .from('business_settings')
      .select('default_hatch_rate_target, reservation_expiry_days')
      .limit(1)
      .maybeSingle(),
  ])

  return buildSystemAlerts({
    incubationAlerts: incubationAlerts || [],
    batches: batches || [],
    mortalityEvents: mortalityEvents || [],
    orders: orders || [],
    orderItems: orderItems || [],
    customerFollowUps: customerFollowUps || [],
    hatchRateTarget: Number(settings?.default_hatch_rate_target ?? 85),
    reservationExpiryDays: Number(settings?.reservation_expiry_days ?? 3),
  })
}

export function buildSystemAlerts({
  incubationAlerts,
  batches,
  mortalityEvents,
  orders,
  orderItems = [],
  customerFollowUps = [],
  hatchRateTarget = 85,
  reservationExpiryDays = 3,
}: {
  incubationAlerts: any[]
  batches: any[]
  mortalityEvents: any[]
  orders: any[]
  orderItems?: any[]
  customerFollowUps?: any[]
  hatchRateTarget?: number
  reservationExpiryDays?: number
}) {
  const alerts: SystemAlert[] = []
  const batchesById = new Map(batches.map((batch) => [batch.id, batch]))
  const allocatedByBatch = buildAllocatedByBatch(orderItems)

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
      href: alert.batch_id ? `/batches/${alert.batch_id}` : undefined,
    })
  })

  batches.forEach((batch) => {
    buildBatchIssueAlerts(batch, allocatedByBatch[batch.id] || 0, hatchRateTarget).forEach((alert) => alerts.push(alert))
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
      href: event.batch_id ? `/batches/${event.batch_id}` : undefined,
    })
  })

  orders.forEach((order) => {
    const orderHref = `/orders/${order.id}`
    if (isPaymentFollowUpDue(order)) {
      const customerName = readRelatedName(order.customers, 'name') || 'customer'
      alerts.push({
        id: `payment-follow-up-${order.id}`,
        title: 'Payment follow-up due',
        description: `${order.order_number} for ${customerName} still has KES ${Number(order.balance_due || 0).toLocaleString()} unpaid.`,
        source: 'Orders',
        severity: order.required_by_date && new Date(order.required_by_date) < new Date() ? 'HIGH' : 'MEDIUM',
        status: 'ACTIVE',
        triggeredAt: order.required_by_date || order.created_at,
        context: [customerName, readRelatedName(order.customers, 'phone')].filter(Boolean).join(' - '),
        href: orderHref,
      })
    }

    if (isReservationHoldNearRelease(order, reservationExpiryDays)) {
      const daysUsed = getElapsedWholeDays(order.created_at)
      const daysLeft = Math.max(0, reservationExpiryDays - daysUsed)
      alerts.push({
        id: `reservation-release-${order.id}`,
        title: daysLeft === 0 ? 'Unpaid hold releases today' : 'Unpaid hold almost due',
        description: daysLeft === 0
          ? `${order.order_number} has unpaid reserved chicks. Stock will be released by the saved hold rule.`
          : `${order.order_number} has ${daysLeft} day left before unpaid reserved chicks are released.`,
        source: 'Orders',
        severity: daysLeft === 0 ? 'HIGH' : 'MEDIUM',
        status: 'ACTIVE',
        triggeredAt: order.created_at,
        context: `${readRelatedName(order.customers, 'name') || 'Customer'} - ${reservationExpiryDays} day hold`,
        href: orderHref,
      })
    }

    if (wasReservationHoldReleased(order)) {
      alerts.push({
        id: `reservation-released-${order.id}`,
        title: 'Unpaid hold released',
        description: `${order.order_number} was moved back to enquiry and its held chicks are available for other orders.`,
        source: 'Orders',
        severity: 'LOW',
        status: 'ACTIVE',
        triggeredAt: order.updated_at || order.created_at,
        context: readRelatedName(order.customers, 'name') || 'Customer',
        href: orderHref,
      })
    }

    const item = Array.isArray(order.order_items) ? order.order_items.find((entry: any) => entry.batch_id) : null
    const batch = item?.batch_id ? batchesById.get(item.batch_id) : null
    if (!batch || ['CANCELLED', 'DELIVERED', 'DISPATCHED'].includes(order.status)) return
    const available = getAvailableChicks(batch)
    const requested = Number(order.total_quantity || item?.quantity || 0)
    if (requested > available) {
      alerts.push({
        id: `order-risk-${order.id}`,
        title: 'Order may not have enough chicks',
        description: `${requested.toLocaleString()} chicks requested but only ${available.toLocaleString()} projected from allocated batch.`,
        source: 'Orders',
        severity: 'HIGH',
        status: 'ACTIVE',
        triggeredAt: order.created_at,
        context: `${order.order_number} - ${batch.batch_number}`,
        href: orderHref,
      })
    }
  })

  customerFollowUps.forEach((customer) => {
    alerts.push({
      id: `customer-follow-up-${customer.id}`,
      title: 'Customer follow-up due',
      description: customer.follow_up_reason || `Follow up with ${customer.name || 'this customer'}.`,
      source: 'Customers',
      severity: customer.customer_status === 'WATCHLIST' ? 'HIGH' : 'MEDIUM',
      status: 'ACTIVE',
      triggeredAt: customer.follow_up_at,
      context: [customer.name, customer.phone].filter(Boolean).join(' - '),
      href: `/customers/${customer.id}`,
    })
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
  if (value === 'Customers') return 'Customers'
  return 'Incubation'
}

function buildBatchIssueAlerts(batch: any, allocatedCount: number, hatchRateTarget: number): SystemAlert[] {
  const alerts: SystemAlert[] = []
  const href = `/batches/${batch.id}`
  const received = Number(batch.quantity_received || 0)
  const accepted = Number(batch.accepted_eggs ?? batch.quantity_set ?? 0)
  const rejected = Number(batch.rejected_eggs || 0)
  const hatched = Number(batch.quantity_hatched || 0)
  const culled = Number(batch.quantity_culled || 0)
  const mortality = Number(batch.mortality_count || 0)
  const available = getAvailableChicks(batch)
  const now = new Date()

  if (received > 0 && rejected >= 5) {
    const rejectionRate = (rejected / received) * 100
    if (rejectionRate >= 10) {
      alerts.push({
        id: `batch-rejection-${batch.id}`,
        title: 'High egg rejection',
        description: `${batch.batch_number} rejected ${rejectionRate.toFixed(1)}% of received eggs. Review supplier quality before the next purchase.`,
        source: 'Batch Workflow',
        severity: rejectionRate >= 20 ? 'HIGH' : 'MEDIUM',
        status: 'ACTIVE',
        triggeredAt: batch.updated_at || batch.created_at,
        context: batch.breed_type || batch.batch_number,
        href,
      })
    }
  }

  if (['COMPLETED', 'BROODER'].includes(batch.status || '') && accepted > 0) {
    const hatchRate = (hatched / accepted) * 100
    if (hatchRateTarget > 0 && hatchRate < hatchRateTarget) {
      alerts.push({
        id: `batch-hatch-rate-${batch.id}`,
        title: 'Low hatch result',
        description: `${batch.batch_number} hatched ${hatchRate.toFixed(1)}% against a ${hatchRateTarget.toFixed(1)}% target.`,
        source: 'Batch Workflow',
        severity: hatchRate + 15 < hatchRateTarget ? 'HIGH' : 'MEDIUM',
        status: 'ACTIVE',
        triggeredAt: batch.actual_hatch_date || batch.updated_at || batch.created_at,
        context: `${hatched.toLocaleString()} chicks from ${accepted.toLocaleString()} eggs`,
        href,
      })
    }
  }

  if (hatched > 0 && mortality > 0) {
    const mortalityRate = (mortality / hatched) * 100
    if (mortalityRate >= 5) {
      alerts.push({
        id: `batch-mortality-rate-${batch.id}`,
        title: 'High chick loss',
        description: `${batch.batch_number} has ${mortalityRate.toFixed(1)}% chick mortality after hatch.`,
        source: 'Mortality',
        severity: mortalityRate >= 10 ? 'HIGH' : 'MEDIUM',
        status: 'ACTIVE',
        triggeredAt: batch.updated_at || batch.created_at,
        context: `${mortality.toLocaleString()} lost from ${hatched.toLocaleString()} hatched`,
        href,
      })
    }
  }

  if (batch.expected_hatch_date && !['COMPLETED', 'BROODER', 'FAILED', 'DISCARDED', 'CANCELLED'].includes(batch.status || '')) {
    const expectedHatch = new Date(batch.expected_hatch_date)
    const daysLate = Math.floor((now.getTime() - expectedHatch.getTime()) / (24 * 60 * 60 * 1000))
    if (daysLate >= 1) {
      alerts.push({
        id: `batch-late-hatch-${batch.id}`,
        title: 'Hatch result overdue',
        description: `${batch.batch_number} is ${daysLate.toLocaleString()} day${daysLate === 1 ? '' : 's'} past expected hatch. Record hatch result or mark the batch outcome.`,
        source: 'Batch Workflow',
        severity: daysLate >= 2 ? 'HIGH' : 'MEDIUM',
        status: 'ACTIVE',
        triggeredAt: batch.expected_hatch_date,
        context: batch.batch_number,
        href,
      })
    }
  }

  if (allocatedCount > available) {
    alerts.push({
      id: `batch-stock-risk-${batch.id}`,
      title: 'More chicks held than available',
      description: `${batch.batch_number} has ${allocatedCount.toLocaleString()} chicks held for orders but ${available.toLocaleString()} available from the batch.`,
      source: 'Orders',
      severity: 'HIGH',
      status: 'ACTIVE',
      triggeredAt: batch.updated_at || batch.created_at,
      context: batch.batch_number,
      href,
    })
  }

  return alerts
}

function buildAllocatedByBatch(orderItems: any[]) {
  return (orderItems || []).reduce((acc: Record<string, number>, item: any) => {
    if (!item.batch_id || item.status === 'CANCELLED') return acc
    const order = readRelatedObject(item.orders)
    if (order?.deleted_at || order?.status === 'CANCELLED') return acc
    acc[item.batch_id] = (acc[item.batch_id] || 0) + Number(item.quantity || 0)
    return acc
  }, {})
}

function isReservationHoldNearRelease(order: any, reservationExpiryDays: number) {
  if (!order || Number(reservationExpiryDays) < 0) return false
  if (order.payment_status !== 'PENDING') return false
  if (!['RESERVED', 'CONFIRMED', 'ALLOCATED'].includes(order.status || '')) return false
  const items = Array.isArray(order.order_items) ? order.order_items : []
  if (!items.some((item: any) => item.batch_id && item.status !== 'CANCELLED')) return false
  const daysUsed = getElapsedWholeDays(order.created_at)
  return reservationExpiryDays - daysUsed <= 1
}

function wasReservationHoldReleased(order: any) {
  if (!order || order.status !== 'INQUIRY') return false
  if (!String(order.notes || '').includes('Auto release: unpaid stock hold expired')) return false
  const updatedAt = order.updated_at ? new Date(order.updated_at) : null
  if (!updatedAt || Number.isNaN(updatedAt.getTime())) return true
  return Date.now() - updatedAt.getTime() <= 3 * 24 * 60 * 60 * 1000
}

function getElapsedWholeDays(value?: string | null) {
  if (!value) return 0
  const createdAt = new Date(value)
  if (Number.isNaN(createdAt.getTime())) return 0
  const elapsed = Date.now() - createdAt.getTime()
  return Math.max(0, Math.floor(elapsed / (24 * 60 * 60 * 1000)))
}

function severityRank(severity: SystemAlertSeverity) {
  return {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
  }[severity]
}
