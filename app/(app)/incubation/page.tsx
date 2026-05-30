import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertCircle, Thermometer, Calendar, Clock, CheckCircle2 } from 'lucide-react'
import { RegisterIncubatorDialog } from './components/register-incubator-dialog'
import { LogEnvironmentDialog } from './components/log-environment-dialog'
import { AssignBatchDialog } from './components/assign-batch-dialog'
import { differenceInDays, addDays, isPast, formatDistanceToNow, format } from 'date-fns'
import { ResolveAlertButton } from './components/resolve-alert-button'

export default async function IncubationDashboard() {
  const supabase = await createClient()

  // Data Fetching
  const [
    { data: incubators },
    { data: activeBatches },
    { data: activeAlerts },
    { data: unassignedBatches }
  ] = await Promise.all([
    supabase.from('incubators').select('*').order('name'),
    supabase.from('egg_batches')
      .select('*, incubators(name, controller_type)')
      .in('status', ['SETTER', 'HATCHER'])
      .order('set_date', { ascending: true }),
    supabase.from('incubation_alerts')
      .select('*, incubators(name), egg_batches(batch_number)')
      .eq('status', 'ACTIVE')
      .order('severity', { ascending: false })
      .order('triggered_at', { ascending: false }),
    supabase.from('egg_batches')
      .select('id, batch_number, quantity_received')
      .eq('status', 'LOGGED')
  ])

  const typedIncubators = incubators || []
  const typedBatches = activeBatches || []
  const typedAlerts = activeAlerts || []

  // Operational Tasks Logic
  const today = new Date()
  const operationalTasks: any[] = []

  const cycleEnriched = typedBatches.map(batch => {
    let incubationDay = 0;
    if (batch.set_date) {
      incubationDay = differenceInDays(today, new Date(batch.set_date))
    }

    const candlingDue = batch.set_date ? addDays(new Date(batch.set_date), 10) : null
    const lockdownDue = batch.set_date ? addDays(new Date(batch.set_date), 18) : null
    const hatchExpected = batch.expected_hatch_date ? new Date(batch.expected_hatch_date) : 
      (batch.set_date ? addDays(new Date(batch.set_date), 21) : null)

    const isCandlingDue = candlingDue && isPast(candlingDue) && batch.status === 'SETTER'
    const isLockdownDue = lockdownDue && isPast(lockdownDue) && batch.status === 'SETTER'
    const isOverdueHatch = hatchExpected && isPast(hatchExpected) && !['COMPLETED', 'FAILED', 'CANCELLED', 'DISCARDED'].includes(batch.status)

    if (isCandlingDue) {
      operationalTasks.push({ id: `c-${batch.id}`, type: 'CANDLING', batch: batch.batch_number, due: candlingDue })
    }
    if (isLockdownDue) {
      operationalTasks.push({ id: `l-${batch.id}`, type: 'LOCKDOWN TRANSFER', batch: batch.batch_number, due: lockdownDue })
    }
    if (isOverdueHatch) {
      operationalTasks.push({ id: `h-${batch.id}`, type: 'HATCHING DELAY', batch: batch.batch_number, due: hatchExpected })
    }

    return { ...batch, incubationDay, candlingDue, lockdownDue, hatchExpected }
  })

  const expectedHatchVolume = typedBatches.reduce((acc, batch) => {
    return acc + ((batch.quantity_received || 0) - (batch.quantity_culled || 0) - (batch.mortality_count || 0));
  }, 0);

  // Sort tasks
  operationalTasks.sort((a, b) => a.due.getTime() - b.due.getTime())

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Incubation Intelligence</h1>
          <p className="text-muted-foreground mt-1">Hatchery production environment and active cycle telemetry.</p>
        </div>
        <div className="flex gap-2">
          <LogEnvironmentDialog incubators={typedIncubators} />
          <AssignBatchDialog 
            incubators={typedIncubators} 
            activeBatches={typedBatches} 
            unassignedBatches={unassignedBatches || []} 
          />
        </div>
      </div>

      {typedAlerts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5 shadow-sm">
          <CardHeader className="py-4">
            <CardTitle className="text-destructive flex items-center gap-2 text-sm">
              <AlertCircle className="w-5 h-5" /> 
              Active Critical Alerts ({typedAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pb-5">
            {typedAlerts.map(alert => (
              <div key={alert.id} className="flex justify-between items-center p-3 bg-card border border-destructive/20 rounded-lg">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="uppercase text-[10px] tracking-wider">{alert.severity}</Badge>
                    <span className="font-semibold text-sm">{(alert.incubators as any)?.name || 'Unknown Unit'}</span>
                    {alert.egg_batches && (
                      <span className="text-xs text-muted-foreground">((alert.egg_batches as any).batch_number)</span>
                    )}
                  </div>
                  <p className="text-sm mt-1">{alert.title} — <span className="text-muted-foreground">{alert.description}</span></p>
                  <p className="text-[10px] text-muted-foreground mt-1">Triggered {formatDistanceToNow(new Date(alert.triggered_at))} ago</p>
                </div>
                <ResolveAlertButton alertId={alert.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="cycles" className="space-y-4">
        <TabsList className="bg-muted/50 border border-border/50">
          <TabsTrigger value="cycles">Active Cycles</TabsTrigger>
          <TabsTrigger value="registry">Incubator Units</TabsTrigger>
          <TabsTrigger value="tasks" className="relative">
            Operational Tasks 
            {operationalTasks.length > 0 && (
              <span className="ml-2 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                {operationalTasks.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cycles" className="space-y-4 m-0">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="shadow-sm border-border bg-card">
              <CardHeader className="py-4 pb-2">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Active Batches</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{cycleEnriched.length}</div>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-border bg-card">
              <CardHeader className="py-4 pb-2">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Eggs In Process</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{expectedHatchVolume.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Viable eggs currently loaded</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-border bg-card">
              <CardHeader className="py-4 pb-2">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Pending Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-destructive">{operationalTasks.length}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cycleEnriched.length === 0 ? (
              <div className="col-span-full p-8 text-center text-muted-foreground border border-dashed rounded-lg bg-card/50">
                No active hatch cycles found. Load a batch into an incubator.
              </div>
            ) : cycleEnriched.map(batch => (
              <Card key={batch.id} className="relative overflow-hidden group shadow-sm border-border">
                <div className={`absolute top-0 left-0 w-1 h-full ${batch.status === 'HATCHING' ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                <CardHeader className="pb-3 pl-5 border-b border-border/50 bg-muted/10">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg font-bold">{batch.batch_number}</CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1 text-xs">
                        <Thermometer className="w-3 h-3" />
                         {(batch.incubators as any)?.name || 'Unassigned'} 
                      </CardDescription>
                    </div>
                    <Badge variant={batch.status === 'HATCHING' ? 'default' : 'secondary'} className="uppercase text-[10px] tracking-wider">
                      {batch.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 pl-5 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Day of Cycle</span>
                    <span className="font-bold tabular-nums">Day {batch.incubationDay}</span>
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
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="registry" className="m-0 space-y-4">
          <div className="flex justify-end mb-4">
            <RegisterIncubatorDialog />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {typedIncubators.map(inc => (
              <Card key={inc.id} className="shadow-sm border-border">
                <CardHeader className="pb-3 border-b border-border/50 bg-muted/10">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                       {inc.name}
                    </CardTitle>
                    <Badge variant={inc.operational_status === 'ACTIVE' ? 'default' : 'outline'} className="uppercase text-[10px]">
                      {inc.operational_status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-y-3 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Controller</p>
                      <p className="font-medium">{inc.controller_type}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Capacity</p>
                      <p className="font-medium tabular-nums">{inc.capacity.toLocaleString()} eggs</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Model</p>
                      <p className="font-medium">{inc.model_number || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Automation</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inc.automation_capable ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                        {inc.automation_capable ? 'Capable' : 'Manual'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {typedIncubators.length === 0 && (
              <div className="col-span-full p-8 text-center text-muted-foreground border border-dashed rounded-lg bg-card/50">
                No incubator units registered. Add your first unit to begin.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="m-0">
          <Card className="shadow-sm border-border bg-card">
            <CardHeader>
              <CardTitle>Operational Reminders</CardTitle>
              <CardDescription>Overdue and upcoming actions for active hatch cycles.</CardDescription>
            </CardHeader>
            <CardContent>
              {operationalTasks.length === 0 ? (
                 <div className="flex flex-col items-center justify-center p-8 text-center bg-muted/20 rounded-lg border border-border/50">
                   <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-3">
                     <CheckCircle2 className="w-6 h-6" />
                   </div>
                   <p className="font-medium">All clear</p>
                   <p className="text-sm text-muted-foreground mt-1">No overdue operational tasks.</p>
                 </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {operationalTasks.map(task => (
                    <div key={task.id} className="py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-destructive/10 text-destructive rounded-full flex items-center justify-center shrink-0">
                           <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">Action Required: {task.type}</p>
                          <p className="text-xs text-muted-foreground">Batch {task.batch} • Due {format(task.due, 'MMM d, yyyy')}</p>
                        </div>
                      </div>
                      <div className="text-xs text-destructive bg-destructive/10 px-2 py-1 rounded-md font-medium whitespace-nowrap">
                        {formatDistanceToNow(task.due)} overdue
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
