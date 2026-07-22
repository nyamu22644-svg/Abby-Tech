import { Metadata } from 'next'
import Link from 'next/link'
import { addDays, isBefore, isSameDay, startOfDay } from 'date-fns'
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, Settings, Syringe, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { MarkVaccinationDoneDialog } from './components/mark-vaccination-done-dialog'

export const metadata: Metadata = {
  title: 'Vaccinations | Smart Hatchery OS',
  description: 'Track batch vaccine due dates and completion.',
}

type VaccinationRule = {
  name: string
  due_day: number
  cost_per_chick: number
  required?: boolean
}

type VaccinationTask = {
  id: string
  batchId: string
  batchNumber: string
  chickCount: number
  batchAgeDays: number
  hatchDateSource: 'actual' | 'expected'
  hatchDate: Date
  vaccineName: string
  dueDay: number
  dueDate: Date
  dueDateValue: string
  costPerChick: number
  totalCost: number
  status: 'overdue' | 'due_today' | 'upcoming' | 'done'
  completedAt?: string | null
  notes?: string | null
}

export default async function VaccinationsPage() {
  const supabase = await createClient()
  const today = startOfDay(new Date())

  const [{ data: settings }, { data: batches }, recordsResult] = await Promise.all([
    supabase
      .from('business_settings')
      .select('required_vaccination_rules')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('egg_batches')
      .select('id, batch_number, actual_hatch_date, expected_hatch_date, quantity_hatched, mortality_count, status')
      .or('actual_hatch_date.not.is.null,expected_hatch_date.not.is.null')
      .not('status', 'in', '(FAILED,DISCARDED,CANCELLED)')
      .is('deleted_at', null)
      .order('actual_hatch_date', { ascending: false })
      .limit(150),
    (supabase as any)
      .from('batch_vaccination_records')
      .select('id, batch_id, vaccine_name, due_day, due_date, completed_at, notes')
      .is('deleted_at', null),
  ])

  const rules = normalizeVaccinationRules(settings?.required_vaccination_rules)
  const records = (recordsResult.data || []) as any[]
  const recordsByKey = new Map<string, any>(
    records.map((record) => [buildRecordKey(record.batch_id, record.vaccine_name, record.due_day), record])
  )
  const tasks = buildVaccinationTasks({
    batches: batches || [],
    rules,
    recordsByKey,
    today,
  })

  const overdue = tasks.filter((task) => task.status === 'overdue')
  const dueToday = tasks.filter((task) => task.status === 'due_today')
  const upcoming = tasks.filter((task) => task.status === 'upcoming')
  const completed = tasks.filter((task) => task.status === 'done')
  const visibleTasks = [
    ...overdue,
    ...dueToday,
    ...upcoming.slice(0, 25),
    ...completed.slice(0, 10),
  ]

  const totalPendingCost = [...overdue, ...dueToday, ...upcoming].reduce((total, task) => total + task.totalCost, 0)

  return (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Vaccinations</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Batch vaccine work generated from saved vaccination costs.
          </p>
        </div>
        <Link
          href="/settings?section=vaccinations"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-button border border-border bg-card px-3 text-[13px] font-medium text-foreground shadow-[var(--shadow-card)] hover:border-primary/40 hover:bg-muted"
        >
          <Settings className="h-4 w-4" />
          Vaccine Settings
        </Link>
      </section>

      {rules.length === 0 ? (
        <Card className="overflow-hidden border-warning/30 bg-warning/10">
          <div className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning text-slate-950">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">No vaccination costs saved yet</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Add vaccine names, due days, and cost per chick in Settings. This page will create the work list automatically.
                </p>
              </div>
            </div>
            <Link
              href="/settings?section=vaccinations"
              className="inline-flex h-8 items-center justify-center rounded-button border border-border bg-background px-3 text-xs font-semibold text-foreground hover:border-primary/40 hover:bg-muted"
            >
              Open Settings
            </Link>
          </div>
        </Card>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Due Today" value={dueToday.length.toLocaleString()} helper="Needs action today" icon={CalendarDays} tone={dueToday.length > 0 ? 'warning' : 'success'} />
        <MetricCard label="Overdue" value={overdue.length.toLocaleString()} helper="Past due date" icon={AlertTriangle} tone={overdue.length > 0 ? 'danger' : 'success'} />
        <MetricCard label="Upcoming" value={upcoming.length.toLocaleString()} helper="Scheduled from hatch date" icon={Clock} tone="primary" />
        <MetricCard label="Pending Vaccine Cost" value={formatMoney(totalPendingCost)} helper="From saved vaccine cost rules" icon={Syringe} tone="primary" />
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-1 border-b border-border bg-muted/10 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Batch Vaccine Work</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Due dates are calculated from each batch hatch date.
            </p>
          </div>
          <span className={cn(
            'w-fit rounded-button px-2.5 py-1 text-xs font-semibold',
            overdue.length > 0 ? 'bg-destructive/10 text-destructive' : dueToday.length > 0 ? 'bg-warning/12 text-warning' : 'bg-success/12 text-success'
          )}>
            {overdue.length > 0 ? `${overdue.length} overdue` : dueToday.length > 0 ? `${dueToday.length} due today` : 'On schedule'}
          </span>
        </div>

        {visibleTasks.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-success" />
            <p className="mt-2 text-sm font-semibold text-foreground">No vaccine work to show</p>
            <p className="mt-1 text-xs text-muted-foreground">Hatched batches will appear here when vaccination rules are saved.</p>
          </div>
        ) : (
          <div>
            <table className="w-full table-fixed text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="w-[20%] px-3 py-3 text-[11px] font-semibold uppercase tracking-wide">Batch</th>
                  <th className="w-[22%] px-3 py-3 text-[11px] font-semibold uppercase tracking-wide">Vaccine</th>
                  <th className="w-[16%] px-3 py-3 text-[11px] font-semibold uppercase tracking-wide">Due</th>
                  <th className="w-[16%] px-3 py-3 text-[11px] font-semibold uppercase tracking-wide">Cost</th>
                  <th className="w-[13%] px-3 py-3 text-[11px] font-semibold uppercase tracking-wide">Status</th>
                  <th className="w-[13%] px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {visibleTasks.map((task) => (
                  <tr key={task.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-3 py-3">
                      <Link href={`/batches/${task.batchId}`} className="block truncate font-mono text-[12px] font-semibold text-primary hover:underline">
                        {task.batchNumber}
                      </Link>
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {task.chickCount.toLocaleString()} chicks
                      </span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        Age: {task.batchAgeDays.toLocaleString()} day{task.batchAgeDays === 1 ? '' : 's'}{task.hatchDateSource === 'expected' ? ' (est.)' : ''}
                      </span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        Hatch: {formatDate(task.hatchDate)} ({task.hatchDateSource})
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="block truncate text-[13px] font-semibold text-foreground">{task.vaccineName}</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">Day {task.dueDay}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="block text-[12px] font-medium text-foreground">{formatDate(task.dueDate)}</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">{formatRelativeDue(task.dueDate, today, task.status)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="block text-[12px] font-semibold text-foreground">{formatMoney(task.totalCost)}</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">{formatMoney(task.costPerChick)} / chick</span>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      {task.status === 'done' ? (
                        <span className="text-xs font-medium text-muted-foreground">Recorded</span>
                      ) : (
                        <MarkVaccinationDoneDialog
                          batchId={task.batchId}
                          batchNumber={task.batchNumber}
                          vaccineName={task.vaccineName}
                          dueDay={task.dueDay}
                          dueDate={task.dueDateValue}
                          costPerChick={task.costPerChick}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function buildVaccinationTasks({
  batches,
  rules,
  recordsByKey,
  today,
}: {
  batches: any[]
  rules: VaccinationRule[]
  recordsByKey: Map<string, any>
  today: Date
}) {
  return batches.flatMap((batch) => {
    const actualHatchDate = parseDate(batch.actual_hatch_date)
    const expectedHatchDate = parseDate(batch.expected_hatch_date)
    const hatchDate = actualHatchDate || expectedHatchDate
    if (!hatchDate) return []

    const hatchDateSource = actualHatchDate ? 'actual' : 'expected'
    const batchAgeDays = Math.max(0, Math.floor((today.getTime() - hatchDate.getTime()) / (24 * 60 * 60 * 1000)))
    const chickCount = Math.max(0, Number(batch.quantity_hatched || 0) - Number(batch.mortality_count || 0))

    return rules.map((rule) => {
      const dueDate = startOfDay(addDays(hatchDate, rule.due_day))
      const dueDateValue = toDateInputValue(dueDate)
      const record = recordsByKey.get(buildRecordKey(batch.id, rule.name, rule.due_day))
      const status = record
        ? 'done'
        : isBefore(dueDate, today)
          ? 'overdue'
          : isSameDay(dueDate, today)
            ? 'due_today'
            : 'upcoming'

      return {
        id: `${batch.id}:${rule.name}:${rule.due_day}`,
        batchId: batch.id,
        batchNumber: batch.batch_number,
        chickCount,
        batchAgeDays,
        hatchDateSource,
        hatchDate,
        vaccineName: rule.name,
        dueDay: rule.due_day,
        dueDate,
        dueDateValue,
        costPerChick: rule.cost_per_chick,
        totalCost: chickCount * rule.cost_per_chick,
        status,
        completedAt: record?.completed_at || null,
        notes: record?.notes || null,
      } satisfies VaccinationTask
    })
  }).sort((a, b) => {
    const statusOrder = { overdue: 0, due_today: 1, upcoming: 2, done: 3 }
    const statusDiff = statusOrder[a.status] - statusOrder[b.status]
    if (statusDiff !== 0) return statusDiff
    return a.dueDate.getTime() - b.dueDate.getTime()
  })
}

function normalizeVaccinationRules(value: any): VaccinationRule[] {
  if (!Array.isArray(value)) return []

  return value
    .map((rule) => ({
      name: String(rule?.name || '').trim(),
      due_day: Math.max(0, Math.round(Number(rule?.due_day || 0))),
      cost_per_chick: Math.max(0, Number(rule?.cost_per_chick || 0)),
      required: rule?.required !== false,
    }))
    .filter((rule) => rule.name && rule.required !== false)
}

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  helper: string
  icon: LucideIcon
  tone: 'primary' | 'success' | 'warning' | 'danger'
}) {
  const toneClass = {
    primary: 'bg-primary text-white shadow-[0_12px_24px_rgba(37,99,235,0.28)]',
    success: 'bg-success text-white shadow-[0_12px_24px_rgba(45,212,111,0.22)]',
    warning: 'bg-warning text-slate-950 shadow-[0_12px_24px_rgba(251,191,36,0.24)]',
    danger: 'bg-destructive text-white shadow-[0_12px_24px_rgba(239,68,68,0.24)]',
  }[tone]

  return (
    <Card className="min-h-[138px] p-[18px]">
      <div className="flex items-start gap-3.5">
        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-full', toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-foreground">{label}</div>
          <div className="mt-1.5 text-3xl font-semibold leading-none tracking-tight text-foreground">
            {value}
          </div>
        </div>
      </div>
      <div className="mt-3.5 flex items-center gap-2 border-t border-border pt-3 text-xs font-medium text-muted-foreground">
        <span className={cn('h-2.5 w-2.5 rounded-full', tone === 'danger' ? 'bg-destructive' : tone === 'warning' ? 'bg-warning' : 'bg-success')} />
        {helper}
      </div>
    </Card>
  )
}

function StatusBadge({ status }: { status: VaccinationTask['status'] }) {
  const label = {
    overdue: 'Overdue',
    due_today: 'Due Today',
    upcoming: 'Upcoming',
    done: 'Done',
  }[status]

  return (
    <span className={cn(
      'inline-flex rounded-button border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
      status === 'overdue' && 'border-destructive/20 bg-destructive/10 text-destructive',
      status === 'due_today' && 'border-warning/30 bg-warning/10 text-warning',
      status === 'upcoming' && 'border-primary/20 bg-primary/10 text-primary',
      status === 'done' && 'border-success/20 bg-success/10 text-success'
    )}>
      {label}
    </span>
  )
}

function buildRecordKey(batchId: string, vaccineName: string, dueDay: number) {
  return `${batchId}:${vaccineName.trim().toLowerCase()}:${dueDay}`
}

function parseDate(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10)
}

function formatDate(value: Date) {
  return value.toLocaleDateString()
}

function formatRelativeDue(dueDate: Date, today: Date, status: VaccinationTask['status']) {
  if (status === 'done') return 'Recorded'
  const diffDays = Math.round((startOfDay(dueDate).getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays === 0) return 'Today'
  if (diffDays < 0) return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} late`
  return `In ${diffDays} day${diffDays === 1 ? '' : 's'}`
}

function formatMoney(value?: number | null) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'KES 0'
  return `KES ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}
