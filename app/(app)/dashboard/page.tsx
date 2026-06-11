import { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Cloud,
  CreditCard,
  Calculator,
  Droplets,
  Eye,
  Handshake,
  Lock,
  MapPin,
  PackageCheck,
  Server,
  Thermometer,
  Truck,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import { addDays, isPast } from 'date-fns'

import { Card } from '@/components/ui/card'
import { syncLifecycleAlerts } from '@/lib/alerts/lifecycle-alerts'
import { calculateBatchCostSnapshot } from '@/lib/costing/batch-costing'
import {
  CANDLING_WINDOW_END_DAY,
  CANDLING_WINDOW_LABEL,
  CANDLING_WINDOW_START_DAY,
  LOCKDOWN_DAY,
} from '@/lib/incubation/rules'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Dashboard | Smart Hatchery OS',
  description: 'Operational overview of hatchery performance.',
}

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'DISCARDED', 'CANCELLED'])
const TARGET_HATCH_RATE = 85

const kpiIconStyles = {
  blue: 'bg-primary text-white shadow-[0_12px_24px_rgba(37,99,235,0.28)]',
  red: 'bg-destructive text-white shadow-[0_12px_24px_rgba(239,68,68,0.24)]',
} as const

type DashboardBatch = Record<string, any>
type EnvironmentalLog = Record<string, any>
type DashboardAlert = Record<string, any>
type DashboardOrder = Record<string, any>
type DashboardActivity = {
  id: string
  title: string
  time: string
  at: Date
  tone: 'primary' | 'danger' | 'success' | 'warning'
}
type WorkItem = {
  id: string
  title: string
  description: string
  href: string
  action: string
  meta: string
  tone: 'danger' | 'warning' | 'primary' | 'success'
  priority: number
  icon: LucideIcon
}

export default async function DashboardPage() {
  const supabase = await createClient()
  await syncLifecycleAlerts(supabase)
  const today = new Date()
  const displayDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(today)

  const [
    batchesResult,
    alertsResult,
    telemetryResult,
    hatchResultsResult,
    mortalityResult,
    auditResult,
    ordersResult,
    incubatorsResult,
    settingsResult,
    costEntriesResult,
  ] = await Promise.all([
    supabase
      .from('egg_batches')
      .select('*, incubators(name)')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false }),
    supabase
      .from('alert_events')
      .select('*, incubators(name), egg_batches(batch_number)')
      .order('triggered_at', { ascending: false })
      .limit(10),
    supabase
      .from('incubator_environmental_logs')
      .select('*, incubators(name), egg_batches(batch_number)')
      .order('recorded_at', { ascending: false })
      .limit(24),
    supabase
      .from('hatch_results')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(20),
    supabase
      .from('mortality_events')
      .select('id, count, cause, recorded_at, egg_batches(batch_number)')
      .is('voided_at', null)
      .order('recorded_at', { ascending: false })
      .limit(6),
    supabase
      .from('audit_logs')
      .select('id, entity_type, action, created_at, performed_at')
      .order('performed_at', { ascending: false })
      .limit(6),
    (supabase as any)
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        payment_status,
        balance_due,
        total_quantity,
        required_by_date,
        created_at,
        customers(name),
        order_items(id, batch_id, status, quantity, total_price),
        order_dispatches(handover_quantity)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('incubators')
      .select('id')
      .is('deleted_at', null)
      .limit(1),
    supabase
      .from('business_settings')
      .select('*')
      .limit(1),
    supabase
      .from('cost_entries')
      .select('batch_id, amount')
      .is('deleted_at', null),
  ])

  const batches = (batchesResult.data || []) as DashboardBatch[]
  const alerts = (alertsResult.data || []) as DashboardAlert[]
  const telemetryLogs = ((telemetryResult.data || []) as EnvironmentalLog[]).filter((log) => log.recorded_at)
  const hatchResults = (hatchResultsResult.data || []) as Record<string, any>[]
  const orders = (ordersResult.data || []) as DashboardOrder[]
  const settings = Array.isArray(settingsResult.data) ? settingsResult.data[0] : null
  const manualCostByBatch = ((costEntriesResult.data || []) as Record<string, any>[]).reduce((acc, entry) => {
    if (!entry.batch_id) return acc
    acc[entry.batch_id] = (acc[entry.batch_id] || 0) + Number(entry.amount || 0)
    return acc
  }, {} as Record<string, number>)
  const activeAlerts = alerts.filter((alert) => alert.status === 'ACTIVE')
  const setupWarnings = [
    ...(settingsResult.data && settingsResult.data.length > 0 ? [] : ['Save facility settings']),
    ...(incubatorsResult.data && incubatorsResult.data.length > 0 ? [] : ['Register real incubator equipment']),
  ]

  const hasPlacement = (batch: DashboardBatch) => Boolean(batch.incubator_id && batch.set_date && batch.expected_hatch_date)
  const activeCycles = batches.filter((batch) => ['SETTER', 'HATCHER'].includes(batch.status) && hasPlacement(batch))
  const activeSetters = activeCycles.filter((batch) => batch.status === 'SETTER')
  const activeHatchers = activeCycles.filter((batch) => batch.status === 'HATCHER')
  const placementQueue = batches.filter((batch) => (
    batch.status === 'LOGGED' ||
    (['SETTER', 'HATCHER'].includes(batch.status) && !hasPlacement(batch))
  ))

  const setterEggs = sumBy(activeSetters, getLoadedEggs)
  const hatcherEggs = sumBy(activeHatchers, getLoadedEggs)
  const activeLoadedEggs = setterEggs + hatcherEggs
  const costingBatches = batches.filter((batch) => !TERMINAL_STATUSES.has(batch.status || ''))
  const batchCostById = new Map(
    costingBatches.map((batch) => [
      batch.id,
      calculateBatchCostSnapshot(batch, manualCostByBatch[batch.id] || 0, settings, today),
    ])
  )
  const costedSnapshots = Array.from(batchCostById.values()).filter((snapshot) => snapshot.costPerChick > 0)
  const totalRunningCost = costedSnapshots.reduce((total, snapshot) => total + snapshot.totalCost, 0)
  const totalCostQuantity = costedSnapshots.reduce((total, snapshot) => total + snapshot.costQuantity, 0)
  const averageCostPerChick = costedSnapshots.length > 0
    ? totalRunningCost / totalCostQuantity
    : 0
  const averageMinimumPrice = costedSnapshots.length > 0
    ? costedSnapshots.reduce((total, snapshot) => total + (snapshot.suggestedMinimumPrice * snapshot.costQuantity), 0) / totalCostQuantity
    : 0
  const lowPriceOrders = orders.filter((order) => {
    const items = Array.isArray(order.order_items) ? order.order_items : []
    return items.some((item: any) => {
      if (item.status === 'CANCELLED' || !item.batch_id) return false
      const snapshot = batchCostById.get(item.batch_id)
      const quantity = Number(item.quantity || 0)
      const itemPrice = quantity > 0 ? Number(item.total_price || 0) / quantity : 0
      return Boolean(snapshot && itemPrice > 0 && itemPrice < snapshot.suggestedMinimumPrice)
    })
  })

  const candlingDue = activeSetters.filter((batch) => {
    if (!batch.set_date) return false
    if (batch.quantity_culled !== null && batch.quantity_culled !== undefined) return false
    const setDate = new Date(batch.set_date)
    return isPast(addDays(setDate, CANDLING_WINDOW_START_DAY))
  })
  const candlingOverdue = candlingDue.filter((batch) => batch.set_date && isPast(addDays(new Date(batch.set_date), CANDLING_WINDOW_END_DAY)))
  const lockdownDue = activeSetters.filter((batch) => {
    if (!batch.set_date) return false
    return isPast(addDays(new Date(batch.set_date), LOCKDOWN_DAY))
  })

  const completedToday = batches.filter((batch) => batch.actual_hatch_date && isSameDay(new Date(batch.actual_hatch_date), today))
  const hatchedToday = sumBy(completedToday, (batch) => Number(batch.quantity_hatched || 0))

  const yieldSource = buildYieldSource(hatchResults, batches)
  const hatchRate = yieldSource.totalSet > 0 ? (yieldSource.totalHatched / yieldSource.totalSet) * 100 : null
  const yieldValue = hatchRate === null ? '--' : `${formatDecimal(hatchRate, 1)}%`
  const yieldTrend = hatchRate === null
    ? 'Awaiting hatch data'
    : hatchRate >= TARGET_HATCH_RATE
      ? 'On target'
      : `${formatDecimal(TARGET_HATCH_RATE - hatchRate, 1)}% below target`

  const latestLog = telemetryLogs[0] || null
  const telemetryIsRecent = latestLog ? today.getTime() - new Date(latestLog.recorded_at).getTime() <= 60 * 60 * 1000 : false
  const chartLogs = telemetryLogs.slice(0, 12).reverse()
  const telemetryMetrics = buildTelemetryMetrics(latestLog)
  const activities = buildActivityFeed({
    orderActivities: [],
    mortalityEvents: mortalityResult.data || [],
    auditLogs: auditResult.data || [],
    batches,
    now: today,
  })
  const todaysWork = buildTodaysWork({
    activeAlerts,
    placementQueue,
    candlingDue,
    candlingOverdue,
    lockdownDue,
    activeHatchers,
    orders,
    now: today,
  })

  const kpis = [
    {
      label: 'Active Setters',
      value: activeSetters.length,
      trend: `${setterEggs.toLocaleString()} eggs loaded`,
      status: placementQueue.length > 0 ? `${placementQueue.length} need placement` : 'All placed',
      icon: Server,
      tone: 'blue' as const,
      alert: false,
    },
    {
      label: 'Active Hatchers',
      value: activeHatchers.length,
      trend: `${hatcherEggs.toLocaleString()} eggs in hatch prep`,
      status: activeHatchers.length > 0 ? 'Hatch prep running' : 'No hatchers running',
      icon: BellRing,
      tone: 'red' as const,
      alert: false,
    },
    {
      label: 'Current Yield',
      value: yieldValue,
      trend: yieldTrend,
      status: `Target: ${TARGET_HATCH_RATE}%`,
      icon: BarChart3,
      tone: 'blue' as const,
      alert: false,
    },
    {
      label: 'Active Alerts',
      value: activeAlerts.length,
      trend: activeAlerts.length > 0 ? 'Requires attention' : 'No active alerts',
      status: activeAlerts.length > 0 ? 'View alerts' : 'All systems optimal',
      icon: AlertTriangle,
      tone: 'red' as const,
      alert: activeAlerts.length > 0,
    },
  ]

  const pipelineRows = [
    {
      label: 'Setters Running',
      value: activeSetters.length,
      progress: percent(activeSetters.length, activeCycles.length),
      icon: Server,
    },
    {
      label: 'Hatchers Running',
      value: activeHatchers.length,
      progress: percent(activeHatchers.length, activeCycles.length),
      icon: BellRing,
    },
    {
      label: `Candling Window (${CANDLING_WINDOW_LABEL})`,
      value: candlingDue.length,
      progress: percent(candlingDue.length, activeSetters.length),
      icon: Eye,
      detail: candlingOverdue.length > 0 ? `${candlingOverdue.length} overdue` : 'Record viability',
    },
    {
      label: 'Lockdown Due',
      value: lockdownDue.length,
      progress: percent(lockdownDue.length, activeSetters.length),
      icon: Lock,
      detail: 'Move to hatch prep',
    },
    {
      label: 'Hatched Today',
      value: hatchedToday > 0 ? hatchedToday.toLocaleString() : '--',
      progress: hatchedToday > 0 ? 100 : 0,
      icon: PackageCheck,
      detail: 'Completed today',
    },
  ]

  return (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
      <section className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Operational Overview</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Real-time telemetry and performance at a glance
          </p>
        </div>
        <button className="inline-flex h-9 items-center gap-2 rounded-button border border-border bg-card px-3 text-[13px] font-medium text-foreground shadow-[var(--shadow-card)]">
          <CalendarDays className="h-4 w-4 text-foreground" />
          <span>{displayDate}</span>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </section>

      {setupWarnings.length > 0 && (
        <Card className="overflow-hidden border-warning/30 bg-warning/10">
          <div className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning text-slate-950">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">Finish first-use setup before production entry</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {setupWarnings.join(' and ')} before the farm team records real batches.
                </p>
              </div>
            </div>
            <Link
              href="/settings"
              className="inline-flex h-8 items-center justify-center rounded-button border border-border bg-background px-3 text-xs font-semibold text-foreground hover:border-primary/40 hover:bg-muted"
            >
              Open Settings
            </Link>
          </div>
        </Card>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          const alertCard = kpi.label === 'Active Alerts'
          return (
            <Card key={kpi.label} className="min-h-[138px] p-[18px]">
              <div className="flex items-start gap-3.5">
                <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-full', kpiIconStyles[kpi.tone])}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-foreground">{kpi.label}</div>
                  <div className="mt-1.5 text-3xl font-semibold leading-none tracking-tight text-foreground">
                    {kpi.value}
                  </div>
                  <div className={cn('mt-2.5 flex items-center gap-1.5 text-xs font-semibold', kpi.alert ? 'text-destructive' : 'text-success')}>
                    {!kpi.alert && <ArrowUpRight className="h-3.5 w-3.5" />}
                    {kpi.trend}
                  </div>
                </div>
              </div>
              <div className="mt-3.5 flex items-center justify-between border-t border-border pt-3 text-xs font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-full', kpi.alert ? 'bg-destructive' : 'bg-success')} />
                  {kpi.status}
                </span>
                {alertCard && <ArrowUpRight className="h-4 w-4" />}
              </div>
            </Card>
          )
        })}
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-1 border-b border-border bg-muted/10 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Cost & Price Check</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Active batch cost and selling-price risk at a glance.
            </p>
          </div>
          <Link href="/batches" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80">
            View batches
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewCostMetric
            icon={Calculator}
            label="Running Batch Cost"
            value={formatMoney(totalRunningCost)}
            helper={`${costedSnapshots.length.toLocaleString()} active batch${costedSnapshots.length === 1 ? '' : 'es'} costed`}
            tone="primary"
          />
          <OverviewCostMetric
            icon={BarChart3}
            label="Avg Cost / Chick"
            value={formatMoney(averageCostPerChick)}
            helper="Based on active batches"
            tone="primary"
          />
          <OverviewCostMetric
            icon={CreditCard}
            label="Avg Minimum Price"
            value={formatMoney(averageMinimumPrice)}
            helper="Includes Target Profit Margin"
            tone="success"
          />
          <OverviewCostMetric
            icon={AlertTriangle}
            label="Price Risk"
            value={lowPriceOrders.length.toLocaleString()}
            helper={lowPriceOrders.length > 0 ? 'Orders priced below suggested minimum' : 'No low-price orders found'}
            tone={lowPriceOrders.length > 0 ? 'warning' : 'success'}
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-1 border-b border-border bg-muted/10 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Today&apos;s Work</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Highest-priority actions from overview, incubation, alerts, and orders.
            </p>
          </div>
          <span className={cn(
            'w-fit rounded-button px-2.5 py-1 text-xs font-semibold',
            todaysWork.length > 0 ? 'bg-warning/12 text-warning' : 'bg-success/12 text-success'
          )}>
            {todaysWork.length > 0 ? `${todaysWork.length} action${todaysWork.length === 1 ? '' : 's'}` : 'Clear'}
          </span>
        </div>
        {todaysWork.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-success" />
            <p className="mt-2 text-sm font-semibold text-foreground">No urgent work right now</p>
            <p className="mt-1 text-xs text-muted-foreground">Keep monitoring telemetry and new orders from the modules below.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {todaysWork.slice(0, 6).map((item) => (
              <WorkQueueRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </Card>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.08fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5">
            <div>
              <h3 className="text-base font-semibold text-foreground">Setter Bay Telemetry</h3>
              {latestLog && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Latest reading {formatRelativeTime(new Date(latestLog.recorded_at), today)}
                </p>
              )}
            </div>
            <span className={cn(
              'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold',
              telemetryIsRecent ? 'bg-success/12 text-success' : 'bg-warning/12 text-warning'
            )}>
              <span className={cn('h-2 w-2 rounded-full', telemetryIsRecent ? 'bg-success' : 'bg-warning')} />
              {telemetryIsRecent ? 'LIVE' : 'LATEST'}
            </span>
          </div>
          <div className="border-t border-border px-5 py-3.5">
            <div className="flex flex-wrap gap-6 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="h-1 w-8 rounded-full bg-primary" />
                Temperature (C)
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-1 w-8 rounded-full bg-destructive" />
                Humidity (%)
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-0.5 w-8 border-t-2 border-dashed border-primary opacity-45" />
                CO2 not configured
              </span>
            </div>

            <TelemetryChart logs={chartLogs} />

            <div className="mt-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {telemetryMetrics.map((metric) => {
                const Icon = metric.icon
                return (
                  <div key={metric.label} className="flex items-center gap-2.5 rounded-button border border-border bg-card px-3 py-2 shadow-sm">
                    <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-button', metric.tone === 'red' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary')}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-muted-foreground">{metric.label}</div>
                      <div className="truncate text-sm font-semibold text-foreground">{metric.value}</div>
                      <div className={cn('text-[11px] font-medium', metric.statusTone === 'warning' ? 'text-warning' : metric.statusTone === 'danger' ? 'text-destructive' : 'text-primary')}>
                        {metric.status}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5">
            <h3 className="text-base font-semibold text-foreground">Incubation Pipeline</h3>
            <Link href="/incubation" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80">
              View all
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-border border-t border-border">
            {pipelineRows.map((row) => {
              const Icon = row.icon
              return (
                <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_2.5rem_3.5rem_minmax(80px,140px)] items-center gap-3 px-5 py-2.5 text-[13px] sm:gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-balance font-medium leading-snug text-foreground">{row.label}</span>
                      {'detail' in row && row.detail && (
                        <span className="block text-[11px] leading-snug text-muted-foreground">{row.detail}</span>
                      )}
                    </span>
                  </div>
                  <span className="text-right font-semibold tabular-nums text-foreground">{row.value}</span>
                  <span className="text-right text-xs font-medium tabular-nums text-muted-foreground">{row.progress}%</span>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${row.progress}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.08fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5">
            <h3 className="text-base font-semibold text-foreground">Recent Alerts</h3>
            <Link href="/alerts" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80">
              View all
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-border border-t border-border">
            {alerts.length === 0 ? (
              <EmptyRow message="No incubation alerts have been recorded yet." />
            ) : (
              alerts.slice(0, 3).map((alert) => {
                const tone = getAlertTone(alert.severity)
                return (
                  <div key={alert.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className={cn('flex h-9 w-9 items-center justify-center rounded-full text-white', tone === 'danger' ? 'bg-destructive' : 'bg-warning')}>
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={cn('truncate text-sm font-semibold', tone === 'danger' ? 'text-destructive' : 'text-warning')}>{alert.title}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{alert.description}</div>
                    </div>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{formatRelativeTime(new Date(alert.triggered_at), today)}</span>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                )
              })
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5">
            <h3 className="text-base font-semibold text-foreground">Recent Activity</h3>
            <Link href="/orders" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80">
              View all
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-border border-t border-border">
            {activities.length === 0 ? (
              <EmptyRow message="No operational activity has been logged yet." />
            ) : (
              activities.slice(0, 4).map((activity) => (
                <div key={activity.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-white',
                    activity.tone === 'danger' && 'bg-destructive',
                    activity.tone === 'success' && 'bg-success',
                    activity.tone === 'warning' && 'bg-warning',
                    activity.tone === 'primary' && 'bg-primary'
                  )}>
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{activity.title}</div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{activity.time}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>

      <p className="sr-only">
        Active loaded eggs currently tracked: {activeLoadedEggs.toLocaleString()}.
      </p>
    </div>
  )
}

function TelemetryChart({ logs }: { logs: EnvironmentalLog[] }) {
  const temperaturePath = buildChartPath(logs, 'temperature', 40)
  const humidityPath = buildChartPath(logs, 'humidity', 100)
  const labels = buildTimeLabels(logs)

  return (
    <div className="mt-3.5 h-[190px] rounded-card bg-card">
      {logs.length === 0 ? (
        <div className="flex h-full items-center justify-center rounded-card border border-dashed border-border text-sm text-muted-foreground">
          No environmental logs yet. Log telemetry from the Incubation module to populate this chart.
        </div>
      ) : (
        <svg className="h-full w-full" viewBox="0 0 820 260" role="img" aria-label="Telemetry chart">
          {[40, 82, 124, 166, 208].map((y) => (
            <line key={y} x1="70" x2="765" y1={y} y2={y} stroke="currentColor" className="text-border" strokeWidth="1" />
          ))}
          {[70, 170, 270, 370, 470, 570, 670, 765].map((x) => (
            <line key={x} x1={x} x2={x} y1="34" y2="220" stroke="currentColor" className="text-border/60" strokeWidth="1" />
          ))}

          {['40C', '30C', '20C', '10C', '0C'].map((label, index) => (
            <text key={label} x="26" y={45 + index * 42} fontSize="12" fontWeight="600" fill="var(--destructive)">
              {label}
            </text>
          ))}
          {['100%', '75%', '50%', '25%', '0%'].map((label, index) => (
            <text key={label} x="780" y={45 + index * 42} fontSize="12" fontWeight="600" fill="var(--primary)">
              {label}
            </text>
          ))}
          {labels.map((item) => (
            <text key={`${item.x}-${item.label}`} x={item.x} y="246" fontSize="12" fill="var(--muted-foreground)">
              {item.label}
            </text>
          ))}

          {temperaturePath && (
            <path
              d={temperaturePath}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {humidityPath && (
            <path
              d={humidityPath}
              fill="none"
              stroke="var(--destructive)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      )}
    </div>
  )
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="px-5 py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function WorkQueueRow({ item }: { item: WorkItem }) {
  const Icon = item.icon
  const toneClasses = {
    danger: {
      icon: 'bg-destructive text-white',
      label: 'bg-destructive/10 text-destructive',
      title: 'text-destructive',
    },
    warning: {
      icon: 'bg-warning text-white',
      label: 'bg-warning/12 text-warning',
      title: 'text-warning',
    },
    primary: {
      icon: 'bg-primary text-white',
      label: 'bg-primary/10 text-primary',
      title: 'text-foreground',
    },
    success: {
      icon: 'bg-success text-white',
      label: 'bg-success/10 text-success',
      title: 'text-foreground',
    },
  }[item.tone]

  return (
    <div className="grid gap-3 px-5 py-3.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', toneClasses.icon)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn('text-sm font-semibold', toneClasses.title)}>{item.title}</p>
            <span className={cn('rounded-button px-2 py-0.5 text-[11px] font-semibold', toneClasses.label)}>
              {item.meta}
            </span>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{item.description}</p>
        </div>
      </div>
      <Link
        href={item.href}
        className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-button border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-muted md:w-auto"
      >
        {item.action}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}

function OverviewCostMetric({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: LucideIcon
  label: string
  value: string
  helper: string
  tone: 'primary' | 'success' | 'warning'
}) {
  const toneClass = {
    primary: 'bg-primary text-white shadow-[0_12px_24px_rgba(37,99,235,0.24)]',
    success: 'bg-success text-white shadow-[0_12px_24px_rgba(45,212,111,0.20)]',
    warning: 'bg-warning text-slate-950 shadow-[0_12px_24px_rgba(251,191,36,0.20)]',
  }[tone]

  return (
    <div className="min-w-0 rounded-button border border-border bg-card p-3.5">
      <div className="flex items-start gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', toneClass)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-lg font-semibold leading-none text-foreground">{value}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-2.5 text-xs font-medium text-muted-foreground">
        <span className={cn('h-2.5 w-2.5 rounded-full', tone === 'warning' ? 'bg-warning' : 'bg-success')} />
        {helper}
      </div>
    </div>
  )
}

function getLoadedEggs(batch: DashboardBatch) {
  return Number(batch.quantity_set ?? batch.accepted_eggs ?? batch.quantity_received ?? 0)
}

function sumBy<T>(items: T[], getter: (item: T) => number) {
  return items.reduce((total, item) => total + getter(item), 0)
}

function percent(value: number, total: number) {
  if (!total) return 0
  return Math.min(100, Math.round((value / total) * 100))
}

function formatDecimal(value: number, digits = 1) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatMoney(value?: number | null) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return '--'
  return `KES ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function isSameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
}

function buildYieldSource(hatchResults: Record<string, any>[], batches: DashboardBatch[]) {
  const hatchResultTotals = hatchResults.reduce(
    (acc, result) => ({
      totalSet: acc.totalSet + Number(result.total_set || 0),
      totalHatched: acc.totalHatched + Number(result.total_hatched || 0),
    }),
    { totalSet: 0, totalHatched: 0 }
  )

  if (hatchResultTotals.totalSet > 0) return hatchResultTotals

  return batches
    .filter((batch) => TERMINAL_STATUSES.has(batch.status) && Number(batch.quantity_hatched || 0) > 0)
    .reduce(
      (acc, batch) => ({
        totalSet: acc.totalSet + getLoadedEggs(batch),
        totalHatched: acc.totalHatched + Number(batch.quantity_hatched || 0),
      }),
      { totalSet: 0, totalHatched: 0 }
    )
}

function buildTelemetryMetrics(latestLog: EnvironmentalLog | null) {
  const temperature = latestLog?.temperature === null || latestLog?.temperature === undefined
    ? null
    : Number(latestLog.temperature)
  const humidity = latestLog?.humidity === null || latestLog?.humidity === undefined
    ? null
    : Number(latestLog.humidity)

  return [
    {
      label: 'Temperature',
      value: temperature === null ? '--' : `${formatDecimal(temperature, 1)}C`,
      status: temperature === null ? 'No reading' : temperature > 38 || temperature < 35 ? 'Review' : 'Optimal',
      statusTone: temperature === null ? 'warning' : temperature > 38 || temperature < 35 ? 'danger' : 'primary',
      icon: Thermometer,
      tone: 'blue',
    },
    {
      label: 'Humidity',
      value: humidity === null ? '--' : `${formatDecimal(humidity, 0)}%`,
      status: humidity === null ? 'No reading' : humidity > 70 || humidity < 40 ? 'Review' : 'Optimal',
      statusTone: humidity === null ? 'warning' : humidity > 70 || humidity < 40 ? 'danger' : 'primary',
      icon: Droplets,
      tone: 'red',
    },
    {
      label: 'CO2 Level',
      value: '--',
      status: 'Not configured',
      statusTone: 'warning',
      icon: Cloud,
      tone: 'blue',
    },
    {
      label: 'Ventilation',
      value: latestLog?.turning_status || latestLog?.power_source || '--',
      status: latestLog ? 'Machine log' : 'No reading',
      statusTone: latestLog ? 'primary' : 'warning',
      icon: Wind,
      tone: 'blue',
    },
  ] as const
}

function buildTodaysWork(input: {
  activeAlerts: DashboardAlert[]
  placementQueue: DashboardBatch[]
  candlingDue: DashboardBatch[]
  candlingOverdue: DashboardBatch[]
  lockdownDue: DashboardBatch[]
  activeHatchers: DashboardBatch[]
  orders: DashboardOrder[]
  now: Date
}) {
  const items: WorkItem[] = []
  const overdueCandlingIds = new Set(input.candlingOverdue.map((batch) => batch.id))

  input.activeAlerts.slice(0, 3).forEach((alert) => {
    const dangerous = alert.severity === 'HIGH' || alert.severity === 'CRITICAL'
    items.push({
      id: `alert-${alert.id}`,
      title: alert.title || 'Active system alert',
      description: alert.description || 'Review the alert and resolve the operational risk.',
      href: '/alerts',
      action: 'Open Alerts',
      meta: alert.severity || 'Alert',
      tone: dangerous ? 'danger' : 'warning',
      priority: dangerous ? 100 : 85,
      icon: AlertTriangle,
    })
  })

  input.candlingDue.forEach((batch) => {
    const overdue = overdueCandlingIds.has(batch.id)
    items.push({
      id: `candling-${batch.id}`,
      title: overdue ? 'Candling overdue' : 'Candling due',
      description: `${batch.batch_number} needs viability results so the active egg count and hatch forecast stay accurate.`,
      href: `/batches/${batch.id}`,
      action: 'Record Candling',
      meta: overdue ? 'Overdue' : CANDLING_WINDOW_LABEL,
      tone: overdue ? 'danger' : 'warning',
      priority: overdue ? 95 : 75,
      icon: Eye,
    })
  })

  input.lockdownDue.forEach((batch) => {
    items.push({
      id: `lockdown-${batch.id}`,
      title: 'Move batch to hatch prep',
      description: `${batch.batch_number} has reached the lockdown window. Move it forward so the hatch stage is clear.`,
      href: `/batches/${batch.id}`,
      action: 'Move Batch',
      meta: 'Due',
      tone: 'warning',
      priority: 80,
      icon: Lock,
    })
  })

  input.activeHatchers.forEach((batch) => {
    const hatchDate = batch.expected_hatch_date ? new Date(batch.expected_hatch_date) : null
    const overdue = hatchDate ? hatchDate.getTime() <= input.now.getTime() : false
    items.push({
      id: `hatch-${batch.id}`,
      title: overdue ? 'Record hatch result' : 'Hatch prep running',
      description: overdue
        ? `${batch.batch_number} is at expected hatch date. Record the final chick count and close the cycle.`
        : `${batch.batch_number} is in hatch prep. Review it when hatch completion is ready.`,
      href: `/batches/${batch.id}`,
      action: overdue ? 'Record Hatch' : 'Open Batch',
      meta: overdue ? 'Due' : 'Hatcher',
      tone: overdue ? 'warning' : 'primary',
      priority: overdue ? 78 : 35,
      icon: PackageCheck,
    })
  })

  input.placementQueue.forEach((batch) => {
    items.push({
      id: `placement-${batch.id}`,
      title: 'Place accepted eggs',
      description: `${batch.batch_number} is not fully placed in an incubator yet. Place it to start cycle tracking.`,
      href: '/incubation',
      action: 'Place Batch',
      meta: 'Waiting',
      tone: 'primary',
      priority: 70,
      icon: MapPin,
    })
  })

  input.orders.forEach((order) => {
    if (['DELIVERED', 'CANCELLED'].includes(order.status || '')) return
    const balanceDue = Number(order.balance_due || 0)
    const allocated = getOrderItems(order).some((item) => item.batch_id && item.status !== 'CANCELLED')
    const remainingQuantity = getRemainingOrderQuantity(order)
    const customerName = readRelatedName(order.customers, 'name') || 'customer'

    if (balanceDue > 0) {
      items.push({
        id: `payment-${order.id}`,
        title: 'Collect order balance',
        description: `${order.order_number} for ${customerName} still has KES ${balanceDue.toLocaleString()} unpaid.`,
        href: `/orders/${order.id}`,
        action: 'Record Payment',
        meta: 'Payment',
        tone: 'warning',
        priority: 68,
        icon: CreditCard,
      })
      return
    }

    if (order.payment_status === 'PAID' && !allocated) {
      items.push({
        id: `allocate-${order.id}`,
        title: 'Allocate chicks to paid order',
        description: `${order.order_number} is paid. Link it to an available batch before pickup or delivery.`,
        href: `/orders/${order.id}`,
        action: 'Allocate Chicks',
        meta: 'Paid',
        tone: 'primary',
        priority: 64,
        icon: Truck,
      })
      return
    }

    if (order.payment_status === 'PAID' && allocated && remainingQuantity > 0) {
      items.push({
        id: `handover-${order.id}`,
        title: 'Complete customer handover',
        description: `${order.order_number} has ${remainingQuantity.toLocaleString()} chick${remainingQuantity === 1 ? '' : 's'} ready for pickup or delivery.`,
        href: `/orders/${order.id}`,
        action: 'Handover',
        meta: 'Ready',
        tone: 'success',
        priority: 62,
        icon: Handshake,
      })
    }
  })

  return items
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10)
}

function buildChartPath(logs: EnvironmentalLog[], key: 'temperature' | 'humidity', max: number) {
  const points = logs
    .map((log, index) => {
      const rawValue = log[key]
      if (rawValue === null || rawValue === undefined) return null
      const value = Number(rawValue)
      if (Number.isNaN(value)) return null
      const x = logs.length === 1 ? 70 : 70 + (index * 695) / (logs.length - 1)
      const clamped = Math.max(0, Math.min(max, value))
      const y = 208 - (clamped / max) * 168
      return [x, y] as const
    })
    .filter(Boolean) as Array<readonly [number, number]>

  if (points.length === 0) return ''
  if (points.length === 1) {
    const [x, y] = points[0]
    return `M${x.toFixed(1)} ${y.toFixed(1)} L${(x + 0.1).toFixed(1)} ${y.toFixed(1)}`
  }

  return points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ')
}

function buildTimeLabels(logs: EnvironmentalLog[]) {
  if (logs.length === 0) return []
  const indexes = new Set([0, Math.floor((logs.length - 1) / 2), logs.length - 1])

  return Array.from(indexes).map((index) => {
    const x = logs.length === 1 ? 82 : 82 + (index * 660) / (logs.length - 1)
    const date = new Date(logs[index].recorded_at)
    return {
      x,
      label: new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: logs.length <= 3 ? '2-digit' : undefined,
      }).format(date),
    }
  })
}

function getAlertTone(severity: string | null | undefined) {
  return severity === 'HIGH' || severity === 'CRITICAL' ? 'danger' : 'warning'
}

function buildActivityFeed(input: {
  orderActivities: Record<string, any>[]
  mortalityEvents: Record<string, any>[]
  auditLogs: Record<string, any>[]
  batches: DashboardBatch[]
  now: Date
}) {
  const activities: DashboardActivity[] = []

  input.orderActivities.forEach((activity) => {
    const at = new Date(activity.created_at)
    if (Number.isNaN(at.getTime())) return
    activities.push({
      id: `order-${activity.id}`,
      title: activity.description || `Order ${activity.action?.toLowerCase()?.replace(/_/g, ' ') || 'updated'}`,
      time: formatRelativeTime(at, input.now),
      at,
      tone: 'primary',
    })
  })

  input.mortalityEvents.forEach((event) => {
    const at = new Date(event.recorded_at)
    if (Number.isNaN(at.getTime())) return
    const batchNumber = readRelatedName(event.egg_batches, 'batch_number') || 'batch'
    activities.push({
      id: `mortality-${event.id}`,
      title: `Mortality recorded for ${batchNumber}: ${Number(event.count || 0).toLocaleString()} birds`,
      time: formatRelativeTime(at, input.now),
      at,
      tone: 'danger',
    })
  })

  input.auditLogs.forEach((log) => {
    const at = new Date(log.performed_at || log.created_at)
    if (Number.isNaN(at.getTime())) return
    activities.push({
      id: `audit-${log.id}`,
      title: `${formatEntity(log.entity_type)} ${String(log.action || 'updated').toLowerCase().replace(/_/g, ' ')}`,
      time: formatRelativeTime(at, input.now),
      at,
      tone: log.action === 'CREATE' ? 'success' : 'primary',
    })
  })

  input.batches.slice(0, 4).forEach((batch) => {
    const at = new Date(batch.updated_at || batch.created_at)
    if (Number.isNaN(at.getTime())) return
    activities.push({
      id: `batch-${batch.id}`,
      title: `${batch.batch_number} is ${formatStatus(batch.status)}`,
      time: formatRelativeTime(at, input.now),
      at,
      tone: TERMINAL_STATUSES.has(batch.status) ? 'warning' : 'primary',
    })
  })

  return activities
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8)
}

function getOrderItems(order: DashboardOrder) {
  if (!order.order_items) return []
  return Array.isArray(order.order_items) ? order.order_items : [order.order_items]
}

function getOrderDispatches(order: DashboardOrder) {
  if (!order.order_dispatches) return []
  return Array.isArray(order.order_dispatches) ? order.order_dispatches : [order.order_dispatches]
}

function getRemainingOrderQuantity(order: DashboardOrder) {
  const handedOver = getOrderDispatches(order).reduce((total: number, dispatch: Record<string, any>) => {
    return total + Number(dispatch.handover_quantity || 0)
  }, 0)

  return Math.max(Number(order.total_quantity || 0) - handedOver, 0)
}

function readRelatedName(value: any, key: string) {
  if (!value) return null
  if (Array.isArray(value)) return value[0]?.[key] || null
  return value[key] || null
}

function formatEntity(value: string | null | undefined) {
  if (!value) return 'Record'
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatStatus(value: string | null | undefined) {
  if (!value) return 'active'
  return value.toLowerCase().replace(/_/g, ' ')
}

function formatRelativeTime(value: Date, now: Date) {
  const diffMs = now.getTime() - value.getTime()
  if (Number.isNaN(diffMs)) return 'recently'
  if (diffMs < 60 * 1000) return 'just now'
  const minutes = Math.floor(diffMs / (60 * 1000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(value)
}
