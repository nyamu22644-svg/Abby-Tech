import { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit3, ThermometerSun, AlertTriangle, PlayCircle, Eye, Settings, HeartPulse, Activity, DollarSign, TrendingUp, TrendingDown, Factory } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BatchActionsMenu } from '../components/batch-actions-menu';
import { AddCostDialog } from '../components/add-cost-dialog';

export const metadata: Metadata = {
  title: 'Batch Details | Smart Hatchery OS',
  description: 'Detailed operational view of an egg batch.',
};

export default async function BatchDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch batch details
  const { data: batch } = await supabase
    .from('egg_batches')
    .select('*')
    .eq('id', id)
    .single();

  if (!batch) {
    notFound();
  }

  // Fetch operational expenses
  const { data: costs } = await supabase
    .from('operational_costs')
    .select('*')
    .eq('batch_id', id)
    .order('created_at', { ascending: false });

  // Fetch revenue from orders allocated to this batch
  const { data: allocatedOrders } = await supabase
    .from('orders')
    .select('total_amount, quantity, balance_due, status')
    .eq('allocated_batch_id', id)
    .neq('status', 'CANCELLED');

  const quantity = batch.quantity_received || 0;
  const culled = batch.quantity_culled || 0;
  const mortality = batch.mortality_count || 0;
  const totalLosses = culled + mortality;
  const hatched = batch.quantity_hatched || 0;
  
  const remainingInCycle = quantity - totalLosses;
  const mortalityPercentage = quantity > 0 ? ((totalLosses / quantity) * 100).toFixed(1) : '0.0';
  const hatchabilityPercentage = quantity > 0 ? ((hatched / quantity) * 100).toFixed(1) : '0.0';

  // Fetch mortality events for this batch
  const { data: mortalityEvents } = await supabase
    .from('mortality_events')
    .select('*')
    .eq('batch_id', id)
    .order('recorded_at', { ascending: false });

  // --- Financial Calculations ---
  const initialCost = batch.total_initial_cost || 0;
  const operationalCostsTotal = (costs || []).reduce((acc, cost) => acc + cost.amount, 0);
  const totalCost = initialCost + operationalCostsTotal;
  
  const totalRevenue = (allocatedOrders || []).reduce((acc, order) => acc + (order.total_amount || 0), 0);
  const outstandingBal = (allocatedOrders || []).reduce((acc, order) => acc + (order.balance_due || 0), 0);
  const totalAllocatedChicks = (allocatedOrders || []).reduce((acc, order) => acc + (order.quantity || 0), 0);
  const collectedRevenue = totalRevenue - outstandingBal;
  const estimatedProfit = totalRevenue > 0 ? totalRevenue - totalCost : 0; // Only calculate profit if there is revenue logged
  const hasRevenue = totalRevenue > 0;
  const isProfitable = hasRevenue && estimatedProfit > 0;
  const profitMargin = hasRevenue ? ((estimatedProfit / totalRevenue) * 100).toFixed(1) : '0.0';
  
  const costPerEgg = quantity > 0 ? totalCost / quantity : 0;
  // If not hatched yet, estimate based on remaining in cycle, else actual hatched
  const chicksForCalculation = hatched > 0 ? hatched : (remainingInCycle > 0 ? remainingInCycle : 1);
  const costPerChick = totalCost / chicksForCalculation;

  const estimatedLossAmount = (batch.total_financial_loss || 0) + (culled * costPerEgg); // Incorporating explicit mortality loss

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200 pb-10">
      
      {/* Top Banner Navigation */}
      <div className="flex items-center justify-between mb-2">
        <Link href="/batches" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group">
          <ArrowLeft className="w-4 h-4 mr-1 transition-transform group-hover:-translate-x-1" />
          Back to Batches
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Batch ID:</span>
          <span className="font-mono text-xs text-muted-foreground select-all">{batch.id}</span>
        </div>
      </div>

      {/* Header Profile */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-primary font-mono">{batch.batch_number}</h1>
            <StatusBadge status={batch.status || ''} />
          </div>
          <p className="text-sm text-muted-foreground mt-1.5 tracking-tight flex items-center gap-2">
            Supplier: <span className="font-medium text-foreground">{batch.supplier_name || '—'}</span> • 
            Received on <span className="text-foreground">{new Date(batch.created_at).toLocaleDateString()}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 h-9 px-4 rounded-md font-medium text-secondary-foreground border-border bg-card hover:bg-muted/50 shadow-sm">
            <Edit3 className="h-4 w-4" />
            Edit Metadata
          </Button>
          <BatchActionsMenu batchId={batch.id} />
        </div>
      </div>

      {/* Production Economics Overlay Canvas */}
      <Card className="border-border shadow-md bg-card overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            <h3 className="font-medium tracking-tight text-primary text-sm uppercase">Production Economics</h3>
          </div>
          <div className={cn("text-xs font-semibold px-2.5 py-1 rounded-md uppercase tracking-wider", hasRevenue ? (isProfitable ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive") : "bg-muted text-muted-foreground")}>
            {hasRevenue ? (isProfitable ? 'PROFITABLE' : 'RUNNING LOSS') : 'IN PROGRESS'}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-border">
          <div className="p-5 flex flex-col justify-center">
            <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase">Total Cost</div>
            <div className="text-2xl font-bold tabular-nums text-foreground">
              KES {totalCost.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1 text-destructive">Absorbs KES {estimatedLossAmount.toLocaleString()} mortality</div>
          </div>
          
          <div className="p-5 flex flex-col justify-center bg-muted/5">
            <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase">Cost / Chick</div>
            <div className="text-2xl font-bold tabular-nums text-foreground">
              KES {costPerChick.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">Based on KES {costPerEgg.toFixed(1)}/egg</div>
          </div>
          
          <div className="p-5 flex flex-col justify-center">
            <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase text-primary">Sales / Bookings</div>
            <div className="text-2xl font-bold tabular-nums text-primary">
              {totalAllocatedChicks.toLocaleString()} chicks
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">Expected: KES {totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
          </div>

          <div className="p-5 flex flex-col justify-center">
            <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase text-success">Collected</div>
            <div className="text-2xl font-bold tabular-nums text-success">
              KES {collectedRevenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">Actual cash in bank</div>
          </div>

          <div className="p-5 flex flex-col justify-center bg-muted/5">
            <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase text-destructive">Unpaid / Debt</div>
            <div className="text-2xl font-bold tabular-nums text-destructive">
              KES {outstandingBal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">Outstanding balance pending</div>
          </div>
          
          <div className="p-5 flex flex-col justify-center relative overflow-hidden">
            <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase z-10">Net Profit / Loss</div>
            <div className={cn("text-2xl font-bold tabular-nums flex items-center gap-2 z-10", hasRevenue ? (isProfitable ? "text-success" : "text-destructive") : "text-muted-foreground")}>
              KES {estimatedProfit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
              {hasRevenue && (isProfitable ? <TrendingUp className="w-5 h-5 opacity-70" /> : <TrendingDown className="w-5 h-5 opacity-70" />)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1 z-10">{hasRevenue ? `${profitMargin}% margin on expected` : 'Awaiting sales'}</div>
            
            {/* Visual Indicator Background */}
            {hasRevenue && (
              <div className={cn(
                "absolute inset-y-0 right-0 w-32 blur-[40px] opacity-20 -z-0 pointer-events-none",
                isProfitable ? "bg-success" : "bg-destructive"
              )} />
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Main Stage Panel */}
        <div className="md:col-span-2 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4 border-border shadow-sm bg-card">
              <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase">Starting Volume</div>
              <div className="text-2xl font-bold text-primary tabular-nums">{quantity.toLocaleString()}</div>
            </Card>
            <Card className="p-4 border-border shadow-sm bg-card">
              <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase text-destructive">Mortality / Culled</div>
              <div className="text-2xl font-bold text-destructive tabular-nums flex items-end gap-2">
                {totalLosses.toLocaleString()} <span className="text-sm font-medium text-destructive/70 mb-1">({mortalityPercentage}%)</span>
              </div>
            </Card>
          </div>

          <Card className="border-border shadow-sm bg-card">
            <div className="p-5 border-b border-border bg-muted/10">
              <h3 className="font-medium tracking-tight text-primary">Incubation Lifecycle</h3>
            </div>
            <div className="p-6 relative">
              <div className="absolute left-10 top-6 bottom-6 w-0.5 bg-border z-0"></div>
              
              <div className="space-y-8 relative z-10">
                <TimelineEvent 
                  icon={<ThermometerSun className="w-5 h-5" />}
                  title="Setter Assignment"
                  date={batch.set_date || 'Pending'}
                  description="Eggs moved into Setter Bay to begin incubation."
                  status={batch.status === 'RECEIVED' || batch.status === 'STORED' ? 'pending' : 'completed'}
                />
                <TimelineEvent 
                  icon={<Eye className="w-5 h-5" />}
                  title="Candling & Viability Check"
                  date="Pending (Day 7)"
                  description="Mid-cycle fertility inspection. Infertile eggs must be recorded and removed."
                  status={batch.quantity_culled !== null && batch.quantity_culled > 0 ? 'completed' : (batch.status === 'EARLY_INCUBATION' || batch.status === 'CANDLING') ? 'active' : 'pending'}
                />
                <TimelineEvent 
                  icon={<Settings className="w-5 h-5" />}
                  title="Lockdown"
                  date="Pending (Day 18)"
                  description="Eggs transferred to Lockdown."
                  status={batch.status === 'LOCKDOWN' || batch.status === 'HATCHING' ? 'active' : (batch.status === 'COMPLETED' || batch.status === 'SOLD' || batch.status === 'ARCHIVED') ? 'completed' : 'pending'}
                />
                <TimelineEvent 
                  icon={<HeartPulse className="w-5 h-5" />}
                  title="Hatch Completion"
                  date={batch.expected_hatch_date || 'Pending'}
                  description="Final chick count and hatchability recording."
                  status={(batch.status === 'COMPLETED' || batch.status === 'SOLD' || batch.status === 'ARCHIVED') ? 'completed' : 'pending'}
                  isLast
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Action & Linked Data Sidebar */}
        <div className="md:col-span-1 space-y-6">
          
          <Card className="border-border shadow-sm bg-card overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/10 flex items-center justify-between">
              <h3 className="font-medium tracking-tight text-primary text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Initial Investment
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">Egg Purchase</span>
                <span className="text-sm font-semibold tabular-nums text-foreground">KES {(batch.egg_purchase_cost || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">Transport</span>
                <span className="text-sm font-semibold tabular-nums text-foreground">KES {(batch.transport_cost || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">Misc Setup</span>
                <span className="text-sm font-semibold tabular-nums text-foreground">KES {(batch.misc_initial_cost || 0).toLocaleString()}</span>
              </div>
            </div>
            <div className="p-3 border-t border-border bg-muted/5 flex justify-between items-center">
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Base Total</span>
              <span className="text-sm font-bold text-foreground tabular-nums font-mono">KES {initialCost.toLocaleString()}</span>
            </div>
          </Card>

          <Card className="border-border shadow-sm bg-card overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/10 flex items-center justify-between">
              <h3 className="font-medium tracking-tight text-primary text-sm flex items-center gap-2">
                <Factory className="w-4 h-4" />
                Operational OpEx Log
              </h3>
              <AddCostDialog batchId={batch.id} />
            </div>
            
            <div className="divide-y divide-border/50 max-h-[300px] overflow-y-auto">
              {!costs || costs.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-xs text-muted-foreground font-medium">No additional ops costs logged yet.</p>
                </div>
              ) : (
                costs.map(cost => (
                  <div key={cost.id} className="p-3 hover:bg-muted/5 transition-colors">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-semibold text-foreground">{cost.category}</span>
                      <span className="text-xs font-bold text-destructive font-mono tabular-nums">
                        KES {cost.amount.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{cost.description}</p>
                    <div className="text-[10px] text-muted-foreground/60 mt-1 uppercase">
                      {new Date(cost.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-border bg-muted/10 flex justify-between items-center">
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">OpEx Subtotal</span>
              <span className="text-sm font-bold text-foreground tabular-nums font-mono">KES {operationalCostsTotal.toLocaleString()}</span>
            </div>
          </Card>

          <Card className="border-border shadow-sm bg-card overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/10 flex items-center justify-between">
              <h3 className="font-medium tracking-tight text-primary text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                Mortality Events
              </h3>
            </div>
            
            <div className="divide-y divide-border/50 max-h-[300px] overflow-y-auto">
              {!mortalityEvents || mortalityEvents.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-xs text-muted-foreground font-medium">No mortality events recorded.</p>
                </div>
              ) : (
                mortalityEvents.map(evt => (
                  <div key={evt.id} className="p-3 hover:bg-muted/5 transition-colors border-l-2 border-l-destructive/50">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-semibold text-foreground">{evt.stage} - {evt.cause}</span>
                      <span className="text-xs font-bold text-destructive font-mono tabular-nums">
                        -{evt.count} birds
                      </span>
                    </div>
                    {evt.notes && <p className="text-[11px] text-muted-foreground">{evt.notes}</p>}
                    <div className="flex justify-between items-center mt-1">
                      <div className="text-[10px] text-muted-foreground/60 uppercase">
                        {new Date(evt.recorded_at).toLocaleDateString()}
                      </div>
                      <div className="text-[10px] font-semibold text-destructive/80 font-mono">
                        ~KES {(evt.estimated_financial_loss || 0).toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:0})} loss
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-border bg-muted/10 flex justify-between items-center">
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Total Mortality</span>
              <span className="text-sm font-bold text-destructive tabular-nums font-mono">{mortality.toLocaleString()} birds</span>
            </div>
          </Card>

          <Card className="border-border shadow-sm bg-card">
            <div className="p-4 border-b border-border bg-muted/10">
              <h3 className="font-medium tracking-tight text-primary text-sm">Telemetry Context</h3>
            </div>
            <div className="p-4 text-center">
              <AlertTriangle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground font-medium">Batch not assigned to a live incubator yet. Assign a setter to view real-time climate data.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-semibold tracking-wide uppercase border",
      status === 'RECEIVED' && "bg-muted text-muted-foreground border-border",
      status === 'STORED' && "bg-muted text-muted-foreground border-border",
      status === 'EARLY_INCUBATION' && "bg-status-setter text-status-setter-text border-status-setter/50",
      status === 'CANDLING' && "bg-status-hatcher text-status-hatcher-text border-status-hatcher/50",
      status === 'LOCKDOWN' && "bg-status-hatcher text-status-hatcher-text border-status-hatcher/50",
      status === 'HATCHING' && "bg-status-hatcher text-status-hatcher-text border-status-hatcher/50",
      status === 'COMPLETED' && "bg-status-completed text-status-completed-text border-status-completed/50",
      status === 'SOLD' && "bg-status-completed text-status-completed-text border-status-completed/50",
      status === 'ARCHIVED' && "bg-muted/50 text-muted-foreground border-border",
      status === 'DISCARDED' && "bg-destructive/10 text-destructive border-destructive/20",
      !['RECEIVED', 'STORED', 'EARLY_INCUBATION', 'CANDLING', 'LOCKDOWN', 'HATCHING', 'COMPLETED', 'SOLD', 'ARCHIVED', 'DISCARDED'].includes(status) && "bg-muted text-muted-foreground border-border"
    )}>
      {status}
    </span>
  );
}

function TimelineEvent({ icon, title, date, description, status, isLast = false }: any) {
  return (
    <div className="flex gap-4">
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center border-2 z-10 bg-background flex-shrink-0 transition-colors",
        status === 'completed' && "border-success bg-success/10 text-success",
        status === 'active' && "border-primary bg-primary/10 text-primary shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)]",
        status === 'pending' && "border-border bg-muted/30 text-muted-foreground",
      )}>
        {icon}
      </div>
      <div className={cn("pt-2 pb-6", isLast && "pb-0")}>
        <div className="flex items-center gap-3 mb-1">
          <h4 className={cn("font-medium tracking-tight", status === 'pending' ? 'text-muted-foreground' : 'text-primary')}>{title}</h4>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">{date}</span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  )
}
