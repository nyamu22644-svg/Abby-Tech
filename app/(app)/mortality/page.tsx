import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LogMortalityDialog } from './components/log-mortality-dialog'
import { format } from 'date-fns'

export default async function MortalityDashboard() {
  const supabase = await createClient()

  // Fetch active batches for the dropdown
  const { data: batches } = await supabase
    .from('egg_batches')
    .select('id, batch_number')
    .in('status', ['RECEIVED', 'STORED', 'EARLY_INCUBATION', 'CANDLING', 'LOCKDOWN', 'HATCHING'])
    .order('created_at', { ascending: false })

  // Fetch recent mortality events
  const { data: events } = await supabase
    .from('mortality_events')
    .select(`
      *,
      egg_batches ( batch_number )
    `)
    .order('recorded_at', { ascending: false })

  const typedEvents = events || []

  // Analytics Calculations
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  weekAgo.setHours(0, 0, 0, 0)

  let mortalityToday = 0
  let mortalityThisWeek = 0
  let totalLoss = 0

  const lossByStage: Record<string, number> = {}
  const lossByBatch: Record<string, number> = {}

  typedEvents.forEach(evt => {
    const evtDate = new Date(evt.recorded_at)
    if (evtDate >= today) mortalityToday += evt.count
    if (evtDate >= weekAgo) mortalityThisWeek += evt.count
    
    totalLoss += (evt.estimated_financial_loss || 0)

    lossByStage[evt.stage] = (lossByStage[evt.stage] || 0) + evt.count

    // Extract batch_number safely
    let bName = 'Unknown'
    if (evt.egg_batches) {
        if (Array.isArray(evt.egg_batches)) {
            bName = evt.egg_batches[0]?.batch_number || 'Unknown'
        } else {
            bName = evt.egg_batches.batch_number || 'Unknown'
        }
    }
    lossByBatch[bName] = (lossByBatch[bName] || 0) + evt.count
  })

  // Find highest loss batch
  let highestLossBatchName = 'None'
  let highestLossCount = 0
  for (const [bName, count] of Object.entries(lossByBatch)) {
    if (count > highestLossCount) {
      highestLossCount = count
      highestLossBatchName = bName
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mortality Intelligence</h1>
          <p className="text-muted-foreground mt-1">
            Operational loss tracking and financial impact analysis.
          </p>
        </div>
        <LogMortalityDialog batches={batches || []} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border shadow-sm flex flex-col justify-between bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mortality Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mortalityToday} birds</div>
            <p className="text-xs text-muted-foreground mt-1">Recorded past 24h</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm flex flex-col justify-between bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mortality This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mortalityThisWeek} birds</div>
            <p className="text-xs text-muted-foreground mt-1">Recorded past 7 days</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm flex flex-col justify-between bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Highest Loss Batch</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate" title={highestLossBatchName}>
              {highestLossBatchName}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{highestLossCount} total losses</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm flex flex-col justify-between bg-card border-destructive/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-destructive">Est. Financial Loss</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              KES {totalLoss.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
            </div>
            <p className="text-xs text-muted-foreground mt-1 text-destructive/80">Total recorded impact</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="col-span-1 shadow-sm border-border bg-card">
          <CardHeader>
            <CardTitle>Recent Mortality Events</CardTitle>
          </CardHeader>
          <CardContent>
            {typedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground pb-4">No mortality events recorded yet.</p>
            ) : (
              <div className="space-y-4">
                {typedEvents.slice(0, 5).map((evt) => {
                  let bName = 'Unknown'
                  if (evt.egg_batches) {
                      if (Array.isArray(evt.egg_batches)) {
                          bName = evt.egg_batches[0]?.batch_number || 'Unknown'
                      } else {
                          bName = evt.egg_batches.batch_number || 'Unknown'
                      }
                  }
                  return (
                    <div key={evt.id} className="flex justify-between items-center bg-muted/50 p-3 rounded-lg border border-border/50">
                      <div>
                        <p className="font-medium text-sm">Batch: {bName}</p>
                        <p className="text-xs text-muted-foreground">
                          {evt.stage} - {evt.cause}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-destructive">-{evt.count}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(evt.recorded_at), 'MMM d, HH:mm')}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1 shadow-sm border-border bg-card">
          <CardHeader>
            <CardTitle>Loss Volume by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(lossByStage)
                .sort((a, b) => b[1] - a[1])
                .map(([stage, count]) => {
                  const max = Math.max(...Object.values(lossByStage))
                  const percentage = ((count / max) * 100).toFixed(0)
                  return (
                    <div key={stage} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{stage}</span>
                        <span className="text-muted-foreground">{count} birds</span>
                      </div>
                      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-destructive transition-all" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              {Object.keys(lossByStage).length === 0 && (
                <p className="text-sm text-muted-foreground">No data available.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
