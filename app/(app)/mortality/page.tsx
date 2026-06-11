import { Metadata } from 'next'
import type { ComponentType } from 'react'
import { AlertTriangle, ArrowUpRight, Banknote, CalendarDays, Skull, TrendingDown } from 'lucide-react'
import { format } from 'date-fns'

import { Card } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/auth'
import { isManagerOrAbove } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { LogMortalityDialog } from './components/log-mortality-dialog'
import { VoidMortalityDialog } from './components/void-mortality-dialog'

export const metadata: Metadata = {
  title: 'Mortality | Smart Hatchery OS',
  description: 'Operational loss tracking and financial impact analysis.',
}

export default async function MortalityDashboard() {
  const supabase = await createClient()
  const currentUser = await getCurrentUserProfile()
  const canVoidMortality = isManagerOrAbove(currentUser?.role || null)

  const [{ data: batches }, { data: events }] = await Promise.all([
    supabase
      .from('egg_batches')
      .select('id, batch_number')
      .in('status', ['LOGGED', 'SETTER', 'HATCHER', 'BROODER'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('mortality_events')
      .select(`
        *,
        egg_batches ( batch_number )
      `)
      .order('recorded_at', { ascending: false }),
  ])

  const typedEvents = events || []
  const activeEvents = typedEvents.filter((evt) => !evt.voided_at)
  const voidedEventsCount = typedEvents.length - activeEvents.length

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  weekAgo.setHours(0, 0, 0, 0)

  let mortalityToday = 0
  let mortalityThisWeek = 0
  let totalLoss = 0
  let totalBirdLoss = 0

  const lossByStage: Record<string, number> = {}
  const lossByBatch: Record<string, number> = {}

  activeEvents.forEach((evt) => {
    const eventCount = Number(evt.count || 0)
    const evtDate = new Date(evt.recorded_at)
    if (evtDate >= today) mortalityToday += eventCount
    if (evtDate >= weekAgo) mortalityThisWeek += eventCount

    totalBirdLoss += eventCount
    totalLoss += Number(evt.estimated_financial_loss || 0)

    lossByStage[evt.stage] = (lossByStage[evt.stage] || 0) + eventCount
    lossByBatch[getBatchName(evt)] = (lossByBatch[getBatchName(evt)] || 0) + eventCount
  })

  const highestLoss = Object.entries(lossByBatch).sort((a, b) => b[1] - a[1])[0] || ['None', 0]
  const highestLossBatchName = highestLoss[0]
  const highestLossCount = highestLoss[1]
  const maxStageLoss = Math.max(...Object.values(lossByStage), 0)

  const kpis = [
    {
      label: 'Mortality Today',
      value: mortalityToday.toLocaleString(),
      unit: 'birds',
      footer: 'Recorded today',
      icon: Skull,
      tone: mortalityToday > 0 ? 'danger' : 'success',
    },
    {
      label: 'This Week',
      value: mortalityThisWeek.toLocaleString(),
      unit: 'birds',
      footer: 'Past 7 days',
      icon: CalendarDays,
      tone: mortalityThisWeek > 0 ? 'warning' : 'success',
    },
    {
      label: 'Highest Loss Batch',
      value: highestLossBatchName,
      unit: '',
      footer: `${highestLossCount.toLocaleString()} total losses`,
      icon: TrendingDown,
      tone: highestLossCount > 0 ? 'warning' : 'success',
    },
    {
      label: 'Est. Financial Loss',
      value: `KES ${totalLoss.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      unit: '',
      footer: `${totalBirdLoss.toLocaleString()} total birds`,
      icon: Banknote,
      tone: totalLoss > 0 ? 'danger' : 'success',
    },
  ] as const

  return (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Mortality Intelligence</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Operational loss tracking and financial impact analysis.
          </p>
        </div>
        <LogMortalityDialog batches={batches || []} />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <MetricCard key={kpi.label} {...kpi} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.08fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-muted/10 px-5 py-3.5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Recent Mortality Events</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Latest recorded operational losses</p>
            </div>
            <span className="rounded-button bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
              {activeEvents.length.toLocaleString()} active{voidedEventsCount > 0 ? ` / ${voidedEventsCount.toLocaleString()} voided` : ''}
            </span>
          </div>

          {typedEvents.length === 0 ? (
            <EmptyState message="No mortality events recorded yet." />
          ) : (
            <div className="divide-y divide-border">
              {typedEvents.slice(0, 12).map((evt) => {
                const voided = Boolean(evt.voided_at)
                const batchName = getBatchName(evt)

                return (
                <div
                  key={evt.id}
                  className={cn(
                    'grid gap-3 px-5 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center',
                    voided && 'bg-muted/20 opacity-75'
                  )}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={cn(
                      'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                      voided ? 'bg-muted text-muted-foreground' : 'bg-destructive/10 text-destructive'
                    )}>
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm font-semibold text-foreground">{batchName}</p>
                        <span className="rounded-button border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          {formatLabel(evt.stage)}
                        </span>
                        <span className="rounded-button border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          {formatLabel(evt.cause)}
                        </span>
                        {voided ? (
                          <span className="rounded-button border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                            Voided
                          </span>
                        ) : null}
                      </div>
                      {evt.notes && (
                        <p className="mt-1 max-w-xl truncate text-[13px] text-muted-foreground">{evt.notes}</p>
                      )}
                      {voided && evt.void_reason ? (
                        <p className="mt-1 max-w-xl text-[12px] text-muted-foreground">
                          Correction: {evt.void_reason}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 md:block md:text-right">
                    <p className={cn('text-sm font-semibold tabular-nums', voided ? 'text-muted-foreground line-through' : 'text-destructive')}>
                      -{Number(evt.count || 0).toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {format(new Date(evt.recorded_at), 'MMM d, HH:mm')}
                    </p>
                    {canVoidMortality && !voided ? (
                      <div className="mt-2">
                        <VoidMortalityDialog
                          eventId={evt.id}
                          batchNumber={batchName}
                          count={Number(evt.count || 0)}
                          estimatedLoss={Number(evt.estimated_financial_loss || 0)}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-muted/10 px-5 py-3.5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Loss Volume by Stage</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Where losses are being recorded</p>
            </div>
          </div>

          <div className="space-y-4 px-5 py-4">
            {Object.keys(lossByStage).length === 0 ? (
              <EmptyState message="No stage data available." compact />
            ) : (
              Object.entries(lossByStage)
                .sort((a, b) => b[1] - a[1])
                .map(([stage, count]) => {
                  const percentage = maxStageLoss > 0 ? Math.round((count / maxStageLoss) * 100) : 0
                  return (
                    <div key={stage} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-foreground">{formatLabel(stage)}</span>
                        <span className="text-xs font-medium tabular-nums text-muted-foreground">
                          {count.toLocaleString()} birds
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-destructive transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })
            )}
          </div>
        </Card>
      </section>
    </div>
  )
}

function MetricCard({
  label,
  value,
  unit,
  footer,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  unit: string
  footer: string
  icon: ComponentType<{ className?: string }>
  tone: 'success' | 'warning' | 'danger'
}) {
  const toneClasses = {
    success: {
      icon: 'bg-success text-white shadow-[0_12px_24px_rgba(45,212,111,0.22)]',
      value: 'text-foreground',
      dot: 'bg-success',
    },
    warning: {
      icon: 'bg-warning text-slate-950 shadow-[0_12px_24px_rgba(251,191,36,0.24)]',
      value: 'text-warning',
      dot: 'bg-warning',
    },
    danger: {
      icon: 'bg-destructive text-white shadow-[0_12px_24px_rgba(255,59,92,0.24)]',
      value: 'text-destructive',
      dot: 'bg-destructive',
    },
  }[tone]

  return (
    <Card className="min-h-[138px] p-[18px]">
      <div className="flex items-start gap-3.5">
        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-full', toneClasses.icon)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-foreground">{label}</div>
          <div className={cn('mt-1.5 truncate text-3xl font-semibold leading-none tracking-tight tabular-nums', toneClasses.value)}>
            {value}
          </div>
          {unit && <div className="mt-1 text-xs font-medium text-muted-foreground">{unit}</div>}
        </div>
      </div>
      <div className="mt-3.5 flex items-center justify-between border-t border-border pt-3 text-xs font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className={cn('h-2.5 w-2.5 rounded-full', toneClasses.dot)} />
          {footer}
        </span>
        <ArrowUpRight className="h-4 w-4" />
      </div>
    </Card>
  )
}

function EmptyState({ message, compact = false }: { message: string; compact?: boolean }) {
  return (
    <div className={cn('text-center text-sm text-muted-foreground', compact ? 'py-4' : 'px-5 py-10')}>
      {message}
    </div>
  )
}

function getBatchName(evt: any) {
  if (!evt.egg_batches) return 'Unknown'
  if (Array.isArray(evt.egg_batches)) return evt.egg_batches[0]?.batch_number || 'Unknown'
  return evt.egg_batches.batch_number || 'Unknown'
}

function formatLabel(value?: string | null) {
  if (!value) return '--'
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
