import { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, BellRing, CheckCircle2, Egg, PackageCheck, ShieldCheck, Skull, Thermometer, UsersRound } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { getSystemAlerts, type SystemAlert } from '@/lib/alerts/system-alerts'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Alerts | Smart Hatchery OS',
  description: 'Daily hatchery alerts and follow-up work.',
}

export default async function AlertsPage() {
  const supabase = await createClient()
  const systemAlerts = await getSystemAlerts(supabase)

  const activeAlerts = systemAlerts.filter((alert) => alert.status === 'ACTIVE')
  const historyAlerts = systemAlerts.filter((alert) => alert.status !== 'ACTIVE')
  const criticalAlerts = activeAlerts.filter((alert) => alert.severity === 'CRITICAL' || alert.severity === 'HIGH')
  const workQueue = groupAlertWork(activeAlerts)

  return (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Alerts & Follow-up</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Clear daily actions for batches, orders, customers, and hatchery risks.
          </p>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Do Now" value={workQueue.doNow.length} tone={workQueue.doNow.length > 0 ? 'danger' : 'success'} />
        <SummaryCard label="Watch Today" value={workQueue.watchToday.length} tone={workQueue.watchToday.length > 0 ? 'primary' : 'success'} />
        <SummaryCard label="Upcoming" value={workQueue.upcoming.length} tone="primary" />
        <SummaryCard label="Cleared" value={historyAlerts.length} tone="success" />
      </section>

      <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b border-border bg-muted/10 px-5 py-3.5">
          <h2 className="text-base font-semibold text-foreground">Today&apos;s Work Queue</h2>
          <span className={cn(
            'rounded-button px-2.5 py-1 text-xs font-semibold',
            activeAlerts.length > 0 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
          )}>
            {activeAlerts.length > 0 ? 'Needs attention' : 'Clear'}
          </span>
        </div>
        {activeAlerts.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-success/20 bg-success/10">
              <ShieldCheck className="h-7 w-7 text-success" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Systems Nominal</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              There is currently no follow-up work waiting.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 p-4 xl:grid-cols-3">
            <QueueColumn title="Do now" helper="Urgent order, batch, or loss problems." alerts={workQueue.doNow} tone="danger" />
            <QueueColumn title="Watch today" helper="Needs attention soon or has just changed." alerts={workQueue.watchToday} tone="warning" />
            <QueueColumn title="Upcoming" helper="Visible early so work does not surprise the team." alerts={workQueue.upcoming} tone="primary" />
          </div>
        )}
      </Card>

      <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
        <div className="border-b border-border bg-muted/10 px-5 py-3.5">
          <h2 className="text-base font-semibold text-foreground">Cleared History</h2>
        </div>
        {historyAlerts.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No cleared alert history found.
          </div>
        ) : (
          <AlertList alerts={historyAlerts.slice(0, 20)} muted />
        )}
      </Card>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'primary' | 'success' | 'danger'
}) {
  const toneClasses = {
    primary: {
      icon: 'bg-primary text-white shadow-[0_12px_24px_rgba(22,119,255,0.28)]',
      value: 'text-foreground',
      dot: 'bg-success',
    },
    success: {
      icon: 'bg-success text-white shadow-[0_12px_24px_rgba(45,212,111,0.22)]',
      value: 'text-foreground',
      dot: 'bg-success',
    },
    danger: {
      icon: 'bg-destructive text-white shadow-[0_12px_24px_rgba(255,59,92,0.24)]',
      value: 'text-destructive',
      dot: 'bg-destructive',
    },
  }[tone]

  return (
    <Card className="rounded-card border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3.5">
        <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-full', toneClasses.icon)}>
          {tone === 'danger' ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">{label}</p>
          <p className={cn('mt-1.5 text-3xl font-semibold leading-none tracking-tight tabular-nums', toneClasses.value)}>
            {value.toLocaleString()}
          </p>
        </div>
      </div>
      <div className="mt-3.5 flex items-center gap-2 border-t border-border pt-3 text-xs font-medium text-muted-foreground">
        <span className={cn('h-2.5 w-2.5 rounded-full', toneClasses.dot)} />
        {tone === 'danger' ? 'Needs attention' : tone === 'success' ? 'Clear' : 'System visibility'}
      </div>
    </Card>
  )
}

function QueueColumn({
  title,
  helper,
  alerts,
  tone,
}: {
  title: string
  helper: string
  alerts: SystemAlert[]
  tone: 'danger' | 'warning' | 'primary'
}) {
  return (
    <div className="rounded-button border border-border bg-muted/10">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <span className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
            tone === 'danger' && 'bg-destructive/10 text-destructive',
            tone === 'warning' && 'bg-warning/12 text-warning',
            tone === 'primary' && 'bg-primary/10 text-primary'
          )}>
            {alerts.length.toLocaleString()}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>
      </div>
      {alerts.length === 0 ? (
        <div className="px-4 py-6 text-sm font-medium text-success">Clear</div>
      ) : (
        <AlertList alerts={alerts.slice(0, 8)} compact />
      )}
    </div>
  )
}

function AlertList({ alerts, muted = false, compact = false }: { alerts: SystemAlert[]; muted?: boolean; compact?: boolean }) {
  return (
    <div className="divide-y divide-border">
      {alerts.map((alert) => {
        const dangerous = alert.severity === 'HIGH' || alert.severity === 'CRITICAL'
        const SourceIcon = getSourceIcon(alert.source)
        return (
          <div key={alert.id} className={cn(
            'grid gap-3 px-4 py-3 md:items-center',
            compact ? 'md:grid-cols-1' : 'md:grid-cols-[minmax(0,1fr)_auto]'
          )}>
            <div className="flex min-w-0 items-start gap-3">
              <span className={cn(
                'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white',
                muted ? 'bg-muted text-muted-foreground' : dangerous ? 'bg-destructive' : 'bg-warning'
              )}>
                <SourceIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn('text-sm font-semibold', muted ? 'text-muted-foreground' : dangerous ? 'text-destructive' : 'text-warning')}>
                    {alert.title}
                  </p>
                  <span className="rounded-button border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {alert.source}
                  </span>
                  <span className="rounded-button border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {alert.severity}
                  </span>
                  <span className="rounded-button border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {alert.status}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-muted-foreground">{alert.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">{alert.context || '--'}</p>
                {alert.href ? (
                  <Link href={alert.href} className="mt-2 inline-flex text-xs font-semibold text-primary hover:underline">
                    Open record
                  </Link>
                ) : null}
              </div>
            </div>
            <div className={cn('text-xs text-muted-foreground', !compact && 'md:text-right')}>
              {formatDate(alert.triggeredAt)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function groupAlertWork(alerts: SystemAlert[]) {
  const doNow = alerts.filter((alert) => alert.severity === 'CRITICAL' || alert.severity === 'HIGH')
  const doNowIds = new Set(doNow.map((alert) => alert.id))
  const watchToday = alerts.filter((alert) => {
    if (doNowIds.has(alert.id)) return false
    if (alert.severity === 'MEDIUM') return true
    return isTodayOrPast(alert.triggeredAt)
  })
  const watchIds = new Set(watchToday.map((alert) => alert.id))
  const upcoming = alerts.filter((alert) => !doNowIds.has(alert.id) && !watchIds.has(alert.id))

  return { doNow, watchToday, upcoming }
}

function isTodayOrPast(value?: string | null) {
  if (!value) return false
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  return parsed.getTime() <= endOfToday.getTime()
}

function getSourceIcon(source: SystemAlert['source']) {
  return {
    Incubation: Thermometer,
    'Batch Workflow': Egg,
    Mortality: Skull,
    Orders: PackageCheck,
    Customers: UsersRound,
  }[source] || BellRing
}

function formatDate(value?: string | null) {
  if (!value) return '--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '--'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}
