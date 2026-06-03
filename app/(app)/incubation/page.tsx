import { createClient } from '@/lib/supabase/server'
import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertCircle, Thermometer, Clock, CheckCircle2, MapPin } from 'lucide-react'
import { RegisterIncubatorDialog } from './components/register-incubator-dialog'
import { LogEnvironmentDialog } from './components/log-environment-dialog'
import { AssignBatchDialog } from './components/assign-batch-dialog'
import { BatchLifecycleActionDialog } from '../batches/components/batch-lifecycle-action-dialog'
import { differenceInDays, addDays, isPast, formatDistanceToNow, format } from 'date-fns'
import { ResolveAlertButton } from './components/resolve-alert-button'
import { syncLifecycleAlerts } from '@/lib/alerts/lifecycle-alerts'
import {
  CANDLING_WINDOW_END_DAY,
  CANDLING_WINDOW_LABEL,
  CANDLING_WINDOW_START_DAY,
  INCUBATION_TOTAL_DAYS,
  LOCKDOWN_DAY,
} from '@/lib/incubation/rules'

export default async function IncubationDashboard() {
  const supabase = await createClient()
  await syncLifecycleAlerts(supabase)

  // Data Fetching
  const [
    { data: incubators },
    { data: activeBatches },
    { data: activeAlerts },
    { data: placementCandidates },
    { data: incubatorAllocations }
  ] = await Promise.all([
    supabase.from('incubators').select('*').order('name'),
    supabase.from('egg_batches')
      .select('*, incubators(name, type)')
      .in('status', ['SETTER', 'HATCHER'])
      .order('set_date', { ascending: true }),
    supabase.from('alert_events')
      .select('*, incubators(name), egg_batches(batch_number)')
      .eq('status', 'ACTIVE')
      .order('severity', { ascending: false })
      .order('triggered_at', { ascending: false }),
    supabase.from('egg_batches')
      .select('id, batch_number, quantity_received, accepted_eggs, status, incubator_id, set_date, expected_hatch_date, date_received, created_at')
      .in('status', ['LOGGED', 'SETTER', 'HATCHER'])
      .order('created_at', { ascending: true }),
    supabase.from('batch_incubator_allocations')
      .select('incubator_id, eggs_allocated')
  ])

  const typedIncubators = incubators || []
  const allCycleBatches = activeBatches || []
  const typedAlerts = activeAlerts || []
  const hasPlacement = (batch: any) => Boolean(batch.incubator_id && batch.set_date && batch.expected_hatch_date)
  const typedBatches = allCycleBatches.filter(hasPlacement)
  const placementQueue = (placementCandidates || []).filter((batch: any) => (
    batch.status === 'LOGGED' || (['SETTER', 'HATCHER'].includes(batch.status) && !hasPlacement(batch))
  ))

  // Operational Tasks Logic
  const today = new Date()
  const operationalTasks: any[] = []

  const cycleEnriched = typedBatches.map(batch => {
    let elapsedDays = 0;
    if (batch.set_date) {
      elapsedDays = differenceInDays(today, new Date(batch.set_date))
    }
    const incubationDay = batch.set_date ? Math.max(1, elapsedDays + 1) : 0

    const loadedEggs = Number(batch.quantity_set ?? batch.accepted_eggs ?? batch.quantity_received ?? 0)
    const currentCulled = Number(batch.quantity_culled || 0)
    const currentMortality = Number(batch.mortality_count || 0)
    const activeEggs = Math.max(loadedEggs - currentCulled - currentMortality, 0)
    const candlingRecorded = batch.quantity_culled !== null && batch.quantity_culled !== undefined
    const candlingWindowOpens = batch.set_date ? addDays(new Date(batch.set_date), CANDLING_WINDOW_START_DAY) : null
    const candlingWindowCloses = batch.set_date ? addDays(new Date(batch.set_date), CANDLING_WINDOW_END_DAY) : null
    const lockdownDue = batch.set_date ? addDays(new Date(batch.set_date), LOCKDOWN_DAY) : null
    const hatchExpected = batch.expected_hatch_date ? new Date(batch.expected_hatch_date) : 
      (batch.set_date ? addDays(new Date(batch.set_date), INCUBATION_TOTAL_DAYS) : null)

    const isCandlingWindowOpen = candlingWindowOpens && isPast(candlingWindowOpens) && batch.status === 'SETTER' && !candlingRecorded
    const isCandlingOverdue = candlingWindowCloses && isPast(candlingWindowCloses) && batch.status === 'SETTER' && !candlingRecorded
    const isLockdownDue = lockdownDue && isPast(lockdownDue) && batch.status === 'SETTER'
    const isOverdueHatch = hatchExpected && isPast(hatchExpected) && !['COMPLETED', 'FAILED', 'CANCELLED', 'DISCARDED'].includes(batch.status)

    if (isCandlingWindowOpen) {
      operationalTasks.push({
        id: `c-${batch.id}`,
        type: isCandlingOverdue ? 'CANDLING OVERDUE' : 'CANDLING WINDOW',
        action: 'candling',
        batchId: batch.id,
        batch: batch.batch_number,
        due: candlingWindowCloses,
        urgency: isCandlingOverdue ? 'overdue' : 'due',
        loadedEggs,
        currentCulled,
      })
    }
    if (isLockdownDue) {
      operationalTasks.push({
        id: `l-${batch.id}`,
        type: 'LOCKDOWN TRANSFER',
        action: 'lockdown',
        batchId: batch.id,
        batch: batch.batch_number,
        due: lockdownDue,
        urgency: 'overdue',
        loadedEggs,
        currentCulled,
      })
    }
    if (isOverdueHatch) {
      operationalTasks.push({
        id: `h-${batch.id}`,
        type: 'HATCHING DELAY',
        action: 'hatch',
        batchId: batch.id,
        batch: batch.batch_number,
        due: hatchExpected,
        urgency: 'overdue',
        loadedEggs,
        currentCulled,
      })
    }

    return {
      ...batch,
      incubationDay,
      elapsedDays,
      loadedEggs,
      currentCulled,
      currentMortality,
      activeEggs,
      candlingRecorded,
      candlingWindowOpens,
      candlingWindowCloses,
      lockdownDue,
      hatchExpected,
    }
  })

  const setterEggs = cycleEnriched
    .filter((batch) => batch.status === 'SETTER')
    .reduce((acc, batch) => acc + batch.activeEggs, 0)
  const hatcherEggs = cycleEnriched
    .filter((batch) => batch.status === 'HATCHER')
    .reduce((acc, batch) => acc + batch.activeEggs, 0)

  // Sort tasks
  operationalTasks.sort((a, b) => a.due.getTime() - b.due.getTime())

  return (
    <div className="space-y-4 pb-6 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Incubation Intelligence</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Hatchery production environment and active cycle telemetry.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LogEnvironmentDialog incubators={typedIncubators} />
          <AssignBatchDialog 
            incubators={typedIncubators} 
            placementBatches={placementQueue}
            incubatorAllocations={incubatorAllocations || []}
          />
        </div>
      </div>

      {typedAlerts.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="py-3.5">
            <CardTitle className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-5 h-5" /> 
              Active Critical Alerts ({typedAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pb-4">
            {typedAlerts.map(alert => (
              <div key={alert.id} className="flex items-center justify-between rounded-card border border-destructive/20 bg-card p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="uppercase text-[10px] tracking-wider">{alert.severity}</Badge>
                    <span className="font-semibold text-sm">{(alert.incubators as any)?.name || 'Unknown Unit'}</span>
                    {alert.egg_batches && (
                      <span className="text-xs text-muted-foreground">{(alert.egg_batches as any).batch_number}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm">{alert.title} - <span className="text-muted-foreground">{alert.description}</span></p>
                  <p className="text-[10px] text-muted-foreground mt-1">Triggered {formatDistanceToNow(new Date(alert.triggered_at))} ago</p>
                </div>
                <ResolveAlertButton alertId={alert.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="cycles" className="space-y-4">
        <TabsList className="rounded-button border border-border bg-card p-1 shadow-[var(--shadow-card)]">
          <TabsTrigger value="cycles">Active Cycles</TabsTrigger>
          <TabsTrigger value="registry">Incubator Machines</TabsTrigger>
          <TabsTrigger value="tasks" className="relative">
            Operational Tasks 
            {operationalTasks.length > 0 && (
              <span className="ml-2 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                {operationalTasks.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cycles" className="m-0 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              icon={<Thermometer className="h-5 w-5" />}
              label="Active Cycles"
              value={cycleEnriched.length.toLocaleString()}
              footer="Placed batches running"
              tone="primary"
            />
            <MetricCard
              icon={<MapPin className="h-5 w-5" />}
              label="Setter Eggs"
              value={setterEggs.toLocaleString()}
              footer="Still turning in incubators"
              tone="primary"
            />
            <MetricCard
              icon={<CheckCircle2 className="h-5 w-5" />}
              label="Hatch Prep Eggs"
              value={hatcherEggs.toLocaleString()}
              footer="Lockdown / final hatch stage"
              tone="success"
            />
            <MetricCard
              icon={<MapPin className="h-5 w-5" />}
              label="Needs Placement"
              value={placementQueue.length.toLocaleString()}
              footer="Waiting for machine slots"
              tone="warning"
            />
            <MetricCard
              icon={<AlertCircle className="h-5 w-5" />}
              label="Pending Actions"
              value={operationalTasks.length.toLocaleString()}
              footer="Overdue or due tasks"
              tone="destructive"
            />
          </div>

          {placementQueue.length > 0 && (
            <Card className="border-warning/30">
              <CardHeader className="py-3.5">
                <CardTitle className="flex items-center gap-2 text-sm text-warning">
                  <MapPin className="h-4 w-4" />
                  Waiting for Placement
                </CardTitle>
                <CardDescription>
                  Received batches that still need a physical incubator machine.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {placementQueue.map((batch: any) => (
                  <div key={batch.id} className="rounded-card border border-warning/25 bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-sm font-semibold text-primary">{batch.batch_number}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Accepted eggs: {Number(batch.accepted_eggs ?? batch.quantity_received ?? 0).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant="outline" className="whitespace-nowrap border-warning/30 text-warning">
                        Waiting
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cycleEnriched.length === 0 ? (
              <div className="col-span-full rounded-card border border-dashed border-border bg-card/50 p-8 text-center text-muted-foreground">
                No active incubation cycles. Use Place / Update Batch to load accepted eggs into an incubator.
              </div>
            ) : cycleEnriched.map(batch => {
              const guidance = getCycleGuidance(batch)
              return (
              <Card key={batch.id} className="group relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1 h-full ${batch.status === 'HATCHING' ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                <CardHeader className="border-b border-border/50 bg-muted/10 pb-3 pl-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="font-mono text-base font-semibold">{batch.batch_number}</CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1 text-xs">
                        <Thermometer className="w-3 h-3" />
                         {(batch.incubators as any)?.name || 'Unassigned'} 
                      </CardDescription>
                    </div>
                    <Badge variant={batch.status === 'HATCHER' ? 'default' : 'secondary'} className="uppercase text-[10px] tracking-wider">
                      {batch.status === 'SETTER' ? 'In Incubator' : batch.status === 'HATCHER' ? 'Hatch Prep' : batch.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-4 pl-5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Day of Cycle</span>
                    <span className="font-semibold tabular-nums">Day {batch.incubationDay}</span>
                  </div>
                  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-500" 
                      style={{ width: `${Math.min(100, (batch.incubationDay / 21) * 100)}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                    <div>
                      <span className="text-muted-foreground block mb-0.5">Loaded On</span>
                      <span className="font-medium">{batch.set_date ? format(new Date(batch.set_date), 'MMM d, yyyy') : 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-0.5">Est. Hatch</span>
                      <span className="font-medium">{batch.hatchExpected ? format(batch.hatchExpected, 'MMM d, yyyy') : 'N/A'}</span>
                    </div>
                  </div>
                  <div className={`rounded-button border px-3 py-2 text-xs ${guidance.tone}`}>
                    <p className="font-semibold text-foreground">{guidance.title}</p>
                    <p className="mt-1 leading-relaxed text-muted-foreground">{guidance.description}</p>
                  </div>
                </CardContent>
              </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="registry" className="m-0 space-y-4">
          <div className="mb-4 flex justify-end">
            <RegisterIncubatorDialog />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {typedIncubators.map(inc => (
              <Card key={inc.id} className="overflow-hidden">
                <CardHeader className="border-b border-border/50 bg-muted/10 pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                       {inc.name}
                    </CardTitle>
                    <Badge variant={inc.operational_status === 'ACTIVE' ? 'default' : 'outline'} className="uppercase text-[10px]">
                      {inc.operational_status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-y-3 text-sm">
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Controller</p>
                      <p className="font-medium">{inc.type}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Capacity</p>
                      <p className="font-medium tabular-nums">{inc.capacity.toLocaleString()} eggs</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Model</p>
                      <p className="font-medium">{inc.controller_model || '--'}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Automation</p>
                      <span className="rounded-button bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                        XD layout
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {typedIncubators.length === 0 && (
              <div className="col-span-full rounded-card border border-dashed border-border bg-card/50 p-8 text-center text-muted-foreground">
                No incubator machines registered. Add the XD 18 machine to begin.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="m-0">
          <Card>
            <CardHeader>
              <CardTitle>Operational Reminders</CardTitle>
              <CardDescription>Overdue and upcoming actions for active hatch cycles.</CardDescription>
            </CardHeader>
            <CardContent>
              {operationalTasks.length === 0 ? (
                 <div className="flex flex-col items-center justify-center rounded-card border border-border bg-muted/20 p-8 text-center">
                   <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
                     <CheckCircle2 className="w-6 h-6" />
                   </div>
                   <p className="font-medium">All clear</p>
                   <p className="text-sm text-muted-foreground mt-1">No overdue operational tasks.</p>
                 </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {operationalTasks.map(task => (
                    <div key={task.id} className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                           <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">Action Required: {task.type}</p>
                          <p className="text-xs text-muted-foreground">
                            Batch {task.batch} - {task.type.includes('CANDLING') ? `Candling ${CANDLING_WINDOW_LABEL}` : 'Due'} by {format(task.due, 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <div className={`whitespace-nowrap rounded-button px-2 py-1 text-xs font-medium ${
                          task.urgency === 'due'
                            ? 'bg-warning/10 text-warning'
                            : 'bg-destructive/10 text-destructive'
                        }`}>
                          {task.urgency === 'due'
                            ? `Window closes in ${formatDistanceToNow(task.due)}`
                            : `${formatDistanceToNow(task.due)} overdue`}
                        </div>
                        <BatchLifecycleActionDialog
                          action={task.action}
                          batchId={task.batchId}
                          batchNumber={task.batch}
                          loadedEggs={task.loadedEggs}
                          currentCulled={task.currentCulled}
                          triggerLabel={
                            task.action === 'candling'
                              ? 'Record Candling'
                              : task.action === 'lockdown'
                                ? 'Move to Hatch Prep'
                                : 'Record Hatch'
                          }
                          compact
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  footer,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  footer: string
  tone: 'primary' | 'warning' | 'success' | 'destructive'
}) {
  const toneClasses = {
    primary: {
      icon: 'bg-primary text-white shadow-[0_12px_24px_rgba(22,119,255,0.28)]',
      value: 'text-foreground',
      dot: 'bg-success',
    },
    warning: {
      icon: 'bg-warning text-slate-950 shadow-[0_12px_24px_rgba(251,191,36,0.24)]',
      value: 'text-warning',
      dot: 'bg-warning',
    },
    success: {
      icon: 'bg-success text-white shadow-[0_12px_24px_rgba(45,212,111,0.22)]',
      value: 'text-foreground',
      dot: 'bg-success',
    },
    destructive: {
      icon: 'bg-destructive text-white shadow-[0_12px_24px_rgba(255,59,92,0.24)]',
      value: 'text-destructive',
      dot: 'bg-destructive',
    },
  }[tone]

  return (
    <Card className="min-h-[138px] p-[18px]">
      <div className="flex items-start gap-3.5">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${toneClasses.icon}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-foreground">{label}</div>
          <div className={`mt-1.5 text-3xl font-semibold leading-none tracking-tight ${toneClasses.value}`}>
            {value}
          </div>
        </div>
      </div>
      <div className="mt-3.5 flex items-center gap-2 border-t border-border pt-3 text-xs font-medium text-muted-foreground">
        <span className={`h-2.5 w-2.5 rounded-full ${toneClasses.dot}`} />
        {footer}
      </div>
    </Card>
  )
}

function getCycleGuidance(batch: any) {
  const candlingOpen = batch.candlingWindowOpens && isPast(batch.candlingWindowOpens)
  const lockdownOpen = batch.lockdownDue && isPast(batch.lockdownDue)
  const hatchDue = batch.hatchExpected && isPast(batch.hatchExpected)

  if (batch.status === 'SETTER' && candlingOpen && !batch.candlingRecorded) {
    return {
      title: 'Physical task: candle this batch',
      description: 'Check eggs with the candler, remove infertile or bad eggs, then record the removed count so forecasts stay accurate.',
      tone: 'border-warning/30 bg-warning/10',
    }
  }

  if (batch.status === 'SETTER' && lockdownOpen) {
    return {
      title: 'Physical task: move to hatch prep',
      description: 'Stop turning, move trays into hatch preparation, then confirm the move in the system.',
      tone: 'border-warning/30 bg-warning/10',
    }
  }

  if (batch.status === 'HATCHER' && hatchDue) {
    return {
      title: 'Physical task: count hatch results',
      description: 'Count live chicks, final culled or unhatched eggs, then record hatch completion to close the batch.',
      tone: 'border-warning/30 bg-warning/10',
    }
  }

  if (batch.status === 'HATCHER') {
    return {
      title: 'Physical task: monitor hatch prep',
      description: 'Keep the batch in hatch prep, avoid turning, monitor temperature and humidity, and prepare for chick collection.',
      tone: 'border-primary/20 bg-primary/5',
    }
  }

  if (batch.status === 'SETTER') {
    const candlingDate = batch.candlingWindowOpens ? format(batch.candlingWindowOpens, 'MMM d, yyyy') : 'the candling window'
    const lockdownDate = batch.lockdownDue ? format(batch.lockdownDue, 'MMM d, yyyy') : 'lockdown'

    return {
      title: 'Physical task: keep incubator routine',
      description: `Monitor temperature, humidity, turning, and power. Candling opens ${candlingDate}; hatch prep opens ${lockdownDate}.`,
      tone: 'border-border bg-muted/20',
    }
  }

  return {
    title: 'Physical task: review batch status',
    description: 'Open the batch record if the physical farm stage does not match the system stage.',
    tone: 'border-border bg-muted/20',
  }
}
