import { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ThermometerSun, AlertTriangle, Eye, Settings, HeartPulse, DollarSign, TrendingUp, TrendingDown, Factory, ArrowRight, CheckCircle2, MapPin, PackageCheck, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { addDays, isPast } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUserProfile } from '@/lib/auth';
import { isManagerOrAbove } from '@/lib/rbac';
import { notFound } from 'next/navigation';
import { cn } from '@/lib/utils';
import { AddCostDialog } from '../components/add-cost-dialog';
import { BatchLifecycleActionDialog } from '../components/batch-lifecycle-action-dialog';
import { ReopenBatchButton } from '../components/reopen-batch-button';
import { RepairHatchDateDialog } from '../components/repair-hatch-date-dialog';
import { HatchGracePeriodTimeline } from '../components/hatch-grace-period-timeline';
import { VoidMortalityDialog } from '../../mortality/components/void-mortality-dialog';
import { calculateBatchCostSnapshot } from '@/lib/costing/batch-costing';
import { canAutoFailSuggestBatch } from '@/lib/alerts/hatch-grace-period-alerts';
import { CANDLING_WINDOW_LABEL, CANDLING_WINDOW_START_DAY, LOCKDOWN_DAY, LOCKDOWN_LABEL } from '@/lib/incubation/rules';

export const metadata: Metadata = {
  title: 'Batch Details | Smart Hatchery OS',
  description: 'Detailed operational view of an egg batch.',
};

export default async function BatchDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUserProfile();
  const canVoidMortality = isManagerOrAbove(currentUser?.role || null);

  // Fetch batch details
  const { data: batch } = await supabase
    .from('egg_batches')
    .select('*, suppliers(name, contact_name, phone, email, address)')
    .eq('id', id)
    .single();

  if (!batch) {
    notFound();
  }

  // Fetch operational expenses
  const { data: costs } = await supabase
    .from('cost_entries')
    .select('id, amount, description, incurred_at, created_at, expense_categories(name, expense_type)')
    .eq('batch_id', id)
    .is('deleted_at', null)
    .order('incurred_at', { ascending: false });

  // Fetch revenue from orders allocated to this batch
  const { data: allocatedOrderItems } = await (supabase as any)
    .from('order_items')
    .select('quantity, status, total_price, orders(total_amount, balance_due, status, order_dispatches(handover_quantity))')
    .eq('batch_id', id)
    .neq('orders.status', 'CANCELLED');

  // Fetch mortality events for this batch
  const { data: mortalityEvents } = await supabase
    .from('mortality_events')
    .select('*')
    .eq('batch_id', id)
    .order('recorded_at', { ascending: false });

  const { data: inspectionRecords } = await supabase
    .from('batch_inspection_records')
    .select('*')
    .eq('batch_id', id)
    .order('inspected_at', { ascending: false })
    .limit(1);

  const { data: acquisitionCosts } = await supabase
    .from('batch_acquisition_costs')
    .select('*')
    .eq('batch_id', id)
    .order('cost_date', { ascending: false });

  const { data: settings } = await supabase
    .from('business_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  const { data: incubationAssignments } = await supabase
    .from('batch_incubation_assignments')
    .select('*, incubators(name, type)')
    .eq('batch_id', id)
    .order('assigned_at', { ascending: false })
    .limit(1);

  const { data: incubatorAllocations } = await supabase
    .from('batch_incubator_allocations')
    .select('*')
    .eq('batch_id', id)
    .order('column_number', { ascending: true })
    .order('row_number', { ascending: true });

  const { data: attachments } = await supabase
    .from('batch_attachments')
    .select('*')
    .eq('batch_id', id)
    .order('uploaded_at', { ascending: false });

  const { data: receivedByProfile } = batch.received_by
    ? await supabase
        .from('user_profiles')
        .select('first_name, last_name, email')
        .eq('id', batch.received_by)
        .maybeSingle()
    : { data: null };

  const quantity = batch.quantity_received || 0;
  const culled = batch.quantity_culled || 0;
  const mortality = batch.mortality_count || 0;
  const totalLosses = culled + mortality;
  const hatched = batch.quantity_hatched || 0;
  const acceptedEggs = batch.accepted_eggs ?? null;

  const inspectionRecord = (inspectionRecords || [])[0];
  const inspectionCracked = inspectionRecord?.cracked_eggs ?? batch.cracked_eggs ?? 0;
  const inspectionDirty = inspectionRecord?.dirty_eggs ?? batch.dirty_eggs ?? 0;
  const inspectionRejected = inspectionRecord?.rejected_eggs ?? batch.rejected_eggs ?? 0;
  const inspectionAccepted = inspectionRecord?.accepted_eggs ?? acceptedEggs ?? 0;
  const inspectionStatus = batch.inspection_status || 'PENDING';
  const inspectionCompletedAt = batch.inspection_completed_at || inspectionRecord?.inspected_at || null;
  const inspectionNotes = batch.inspection_notes || inspectionRecord?.inspection_notes || null;

  const assignment = (incubationAssignments || [])[0] || null;
  const incubatorName = assignment?.incubators?.name || '--';
  const incubatorType = assignment?.incubators?.type || '';
  const receivedByName = batch.received_by_name || (receivedByProfile
    ? [receivedByProfile.first_name, receivedByProfile.last_name].filter(Boolean).join(' ').trim() || receivedByProfile.email || '--'
    : '--');

  const photoAttachments = (attachments || []).filter(
    (attachment) => attachment.attachment_type === 'INSPECTION_PHOTO'
  );

  let photoUrls: Record<string, string> = {};
  if (photoAttachments.length > 0) {
    const paths = photoAttachments.map((attachment) => attachment.storage_path);
    const { data: signedUrls, error: signedError } = await supabase
      .storage
      .from('batch-attachments')
      .createSignedUrls(paths, 3600);

    if (!signedError && signedUrls) {
      photoUrls = signedUrls.reduce((acc: Record<string, string>, item: any) => {
        if (item?.path && item?.signedUrl) {
          acc[item.path] = item.signedUrl;
        }
        return acc;
      }, {});
    }
  }
  
  const incubatingEggs = batch.quantity_set ?? inspectionAccepted ?? 0;
  const remainingInCycle = Math.max(incubatingEggs - totalLosses, 0);
  const mortalityPercentage = incubatingEggs > 0 ? ((totalLosses / incubatingEggs) * 100).toFixed(1) : '0.0';
  const hatchabilityPercentage = incubatingEggs > 0 ? ((hatched / incubatingEggs) * 100).toFixed(1) : '0.0';

  // --- Financial Calculations ---
  const initialCost = batch.total_initial_cost || 0;
  const operationalCostsTotal = (costs || []).reduce((acc, cost) => acc + Number(cost.amount || 0), 0);
  const costSnapshot = calculateBatchCostSnapshot(batch, operationalCostsTotal, settings);
  const totalCost = costSnapshot.totalCost;
  
  const totalRevenue = (allocatedOrderItems || []).reduce((acc: number, item: any) => {
    const order = Array.isArray(item.orders) ? item.orders[0] : item.orders;
    return acc + (order?.total_amount || item.total_price || 0);
  }, 0);
  const outstandingBal = (allocatedOrderItems || []).reduce((acc: number, item: any) => {
    const order = Array.isArray(item.orders) ? item.orders[0] : item.orders;
    return acc + (order?.balance_due || 0);
  }, 0);
  const liveOrderItems = (allocatedOrderItems || []).filter((item: any) => {
    const order = Array.isArray(item.orders) ? item.orders[0] : item.orders;
    return item.status !== 'CANCELLED' && order?.status !== 'CANCELLED';
  });
  const totalAllocatedChicks = liveOrderItems.reduce((acc: number, item: any) => acc + Number(item.quantity || 0), 0);
  const pickedUpChicks = liveOrderItems.reduce((acc: number, item: any) => {
    const order = Array.isArray(item.orders) ? item.orders[0] : item.orders;
    const dispatches = Array.isArray(order?.order_dispatches) ? order.order_dispatches : [];
    const handedOver = dispatches.reduce((sum: number, dispatch: any) => sum + Number(dispatch.handover_quantity || 0), 0);
    return acc + Math.min(Number(item.quantity || 0), handedOver);
  }, 0);
  const heldForOrders = Math.max(totalAllocatedChicks - pickedUpChicks, 0);
  const collectedRevenue = totalRevenue - outstandingBal;
  const estimatedProfit = totalRevenue > 0 ? totalRevenue - totalCost : 0; // Only calculate profit if there is revenue logged
  const hasRevenue = totalRevenue > 0;
  const isProfitable = hasRevenue && estimatedProfit > 0;
  const profitMargin = hasRevenue ? ((estimatedProfit / totalRevenue) * 100).toFixed(1) : '0.0';
  
  const costPerEgg = incubatingEggs > 0 ? totalCost / incubatingEggs : 0;
  // If not hatched yet, estimate based on remaining in cycle, else actual hatched
  const chicksForCalculation = hatched > 0 ? hatched : (remainingInCycle > 0 ? remainingInCycle : 1);
  const costPerChick = costSnapshot.costPerChick || (totalCost / chicksForCalculation);

  const estimatedLossAmount = (batch.total_financial_loss || 0) + (culled * costPerEgg); // Incorporating explicit mortality loss
  const stockBasis = ['COMPLETED', 'BROODER'].includes(batch.status || '') ? hatched : remainingInCycle;
  const availableForNewOrders = Math.max(stockBasis - totalAllocatedChicks, 0);
  const stockShortfall = Math.max(totalAllocatedChicks - stockBasis, 0);

  const formatDate = (value?: string | null) => {
    if (!value) return '--';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '--' : parsed.toLocaleDateString();
  };

  const candlingRecorded = batch.quantity_culled !== null && batch.quantity_culled !== undefined;
  const candlingOpensAt = batch.set_date ? addDays(new Date(batch.set_date), CANDLING_WINDOW_START_DAY) : null;
  const canRecordCandling = batch.status === 'SETTER' && Boolean(candlingOpensAt && isPast(candlingOpensAt));
  const lockdownOpensAt = batch.set_date ? addDays(new Date(batch.set_date), LOCKDOWN_DAY) : null;
  const canMoveToLockdown = batch.status === 'SETTER' && Boolean(lockdownOpensAt && isPast(lockdownOpensAt));
  const candlingTimelineStatus = candlingRecorded || ['HATCHER', 'COMPLETED', 'BROODER', 'FAILED', 'DISCARDED', 'CANCELLED'].includes(batch.status)
    ? 'completed'
    : canRecordCandling
      ? 'active'
      : 'pending';
  const lockdownTimelineStatus = batch.status === 'HATCHER'
    ? 'active'
    : ['COMPLETED', 'BROODER', 'FAILED', 'DISCARDED', 'CANCELLED'].includes(batch.status)
      ? 'completed'
      : canMoveToLockdown
        ? 'active'
        : 'pending';

  return (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200 pb-6">
      
      {/* Top Banner Navigation */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/batches" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group">
          <ArrowLeft className="w-4 h-4 mr-1 transition-transform group-hover:-translate-x-1" />
          Back to Batches
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Batch ID:</span>
          <span className="truncate font-mono text-xs text-muted-foreground select-all">{batch.id}</span>
        </div>
      </div>

      {/* Header Profile */}
      <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-[18px] shadow-[var(--shadow-card)] lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <h1 className="break-all font-mono text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{batch.batch_number}</h1>
            <StatusBadge status={batch.status || ''} />
          </div>
          <p className="mt-1 flex items-center gap-2 text-[13px] text-muted-foreground tracking-tight">
            Received on <span className="text-foreground">{formatDate(batch.date_received || batch.created_at)}</span>
          </p>
        </div>
      </div>

      <NextBestBatchAction
        batch={batch}
        loadedEggs={incubatingEggs}
        currentCulled={culled}
        candlingRecorded={candlingRecorded}
        canRecordCandling={canRecordCandling}
        candlingOpensLabel={candlingOpensAt ? formatDate(candlingOpensAt.toISOString()) : null}
        canMoveToLockdown={canMoveToLockdown}
        lockdownOpensLabel={lockdownOpensAt ? formatDate(lockdownOpensAt.toISOString()) : null}
      />

      {/* Hatch Grace Period Timeline - Only show if batch has expected_hatch_date and not closed */}
      {batch.expected_hatch_date && !['COMPLETED', 'BROODER', 'FAILED', 'DISCARDED', 'CANCELLED'].includes(batch.status) && (
        <HatchGracePeriodTimeline
          batchId={batch.id}
          batchNumber={batch.batch_number}
          expectedHatchDate={batch.expected_hatch_date}
          currentStatus={batch.status}
          daysOverdue={Math.max(0, Math.floor((new Date().getTime() - new Date(batch.expected_hatch_date).getTime()) / (24 * 60 * 60 * 1000)))}
          canAutoFail={canAutoFailSuggestBatch(batch, new Date())}
        />
      )}

      {/* Traceability Overview */}
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-muted/10 px-5 py-3.5">
          <h3 className="text-base font-semibold tracking-tight text-foreground">Traceability Overview</h3>
        </div>
        <div className="grid grid-cols-1 gap-0 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <div className="space-y-2 p-4">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Supplier</p>
            <div className="space-y-1 text-sm">
              <p className="font-medium text-foreground">{batch.suppliers?.name || '--'}</p>
              <p className="text-muted-foreground">Contact: {batch.contact_person || batch.suppliers?.contact_name || '--'}</p>
              <p className="text-muted-foreground">Phone: {batch.supplier_phone || batch.suppliers?.phone || '--'}</p>
              <p className="text-muted-foreground">Email: {batch.suppliers?.email || '--'}</p>
              <p className="text-muted-foreground">Location: {batch.supplier_location || batch.suppliers?.address || '--'}</p>
              <p className="text-muted-foreground">Invoice: {batch.invoice_number || '--'}</p>
            </div>
          </div>
          <div className="space-y-2 p-4">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Reception</p>
            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">Received: {formatDate(batch.date_received)}</p>
              <p className="text-muted-foreground">Received By: {receivedByName}</p>
              <p className="text-muted-foreground">Breed/Type: {batch.breed_type || '--'}</p>
              <p className="text-muted-foreground">Quantity: {quantity.toLocaleString()}</p>
              <p className="text-muted-foreground">Accepted: {inspectionAccepted.toLocaleString()}</p>
              {batch.notes && (
                <p className="text-muted-foreground">Notes: {batch.notes}</p>
              )}
            </div>
          </div>
          <div className="space-y-2 p-4">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Inspection</p>
            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">Status: {inspectionStatus}</p>
              <p className="text-muted-foreground">Completed: {formatDate(inspectionCompletedAt)}</p>
              <p className="text-muted-foreground">Cracked: {inspectionCracked.toLocaleString()}</p>
              <p className="text-muted-foreground">Dirty: {inspectionDirty.toLocaleString()}</p>
              <p className="text-muted-foreground">Rejected: {inspectionRejected.toLocaleString()}</p>
              <p className="text-muted-foreground">Photos: {photoAttachments.length}</p>
              {inspectionNotes && (
                <p className="text-muted-foreground">Notes: {inspectionNotes}</p>
              )}
            </div>
          </div>
          <div className="space-y-2 p-4">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Assignment</p>
            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">Incubator: {incubatorName}{incubatorType ? ` (${incubatorType})` : ''}</p>
              <p className="text-muted-foreground">Set Date: {formatDate(batch.set_date || assignment?.set_date)}</p>
              <p className="text-muted-foreground">Est. Hatch: {formatDate(batch.expected_hatch_date || assignment?.expected_hatch_date)}</p>
              <p className="text-muted-foreground">Status: {assignment?.status || '--'}</p>
              {batch.placement_summary && (
                <p className="text-muted-foreground">Placement: {batch.placement_summary}</p>
              )}
              {incubatorAllocations && incubatorAllocations.length > 0 && (
                <div className="pt-1">
                  <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Slots</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {incubatorAllocations.map((slot) => (
                      <span
                        key={slot.id}
                        className="rounded-button border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        Unit {slot.column_number}, Tray {slot.row_number}: {slot.eggs_allocated}/{slot.slot_capacity}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {assignment?.assignment_notes && (
                <p className="text-muted-foreground">Notes: {assignment.assignment_notes}</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Production Economics Overlay Canvas */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-muted/10 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            <h3 className="text-base font-semibold tracking-tight text-foreground">Production Economics</h3>
          </div>
          <div className={cn("rounded-button px-2.5 py-1 text-xs font-semibold uppercase tracking-wider", hasRevenue ? (isProfitable ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive") : "bg-muted text-muted-foreground")}>
            {hasRevenue ? (isProfitable ? 'PROFITABLE' : 'RUNNING LOSS') : 'IN PROGRESS'}
          </div>
        </div>
        
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3 xl:grid-cols-6">
          <div className="min-h-24 p-4">
            <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase">Total Cost</div>
            <div className="text-xl font-semibold tabular-nums text-foreground">
              KES {totalCost.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1 text-destructive">Absorbs KES {estimatedLossAmount.toLocaleString()} mortality</div>
          </div>
          
          <div className="min-h-24 bg-muted/5 p-4">
            <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase">Cost / Chick</div>
            <div className="text-xl font-semibold tabular-nums text-foreground">
              KES {costPerChick.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">Based on KES {costPerEgg.toFixed(1)}/egg</div>
          </div>
          
          <div className="min-h-24 p-4">
            <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase text-primary">Sales / Bookings</div>
            <div className="text-xl font-semibold tabular-nums text-primary">
              {totalAllocatedChicks.toLocaleString()} chicks
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">Expected: KES {totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
          </div>

          <div className="min-h-24 p-4">
            <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase text-success">Collected</div>
            <div className="text-xl font-semibold tabular-nums text-success">
              KES {collectedRevenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">Actual cash in bank</div>
          </div>

          <div className="min-h-24 bg-muted/5 p-4">
            <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase text-destructive">Unpaid / Debt</div>
            <div className="text-xl font-semibold tabular-nums text-destructive">
              KES {outstandingBal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">Outstanding balance pending</div>
          </div>
          
          <div className="relative min-h-24 overflow-hidden p-4">
            <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase z-10">Net Profit / Loss</div>
            <div className={cn("z-10 flex items-center gap-2 text-xl font-semibold tabular-nums", hasRevenue ? (isProfitable ? "text-success" : "text-destructive") : "text-muted-foreground")}>
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

        <div className="grid gap-3 border-t border-border bg-muted/5 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricLine label="Initial Cost" value={`KES ${costSnapshot.initialCost.toLocaleString()}`} helper="Eggs, transport, and intake costs" />
          <MetricLine label="Manual Expenses" value={`KES ${costSnapshot.manualCostTotal.toLocaleString()}`} helper="Costs logged manually" />
          <MetricLine label="Auto Daily Running" value={`KES ${(costSnapshot.incubationRunningCost + costSnapshot.holdingRunningCost + costSnapshot.feedCost).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} helper={`${costSnapshot.incubationDays} incubation days, ${costSnapshot.holdingDays} holding days`} />
          <MetricLine label="Vaccination Cost" value={`KES ${costSnapshot.vaccinationCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} helper="From Settings schedule" />
        </div>
      </Card>

      <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-1 border-b border-border bg-muted/10 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold tracking-tight text-foreground">Stock Movement</h3>
          </div>
          <span className={cn(
            'w-fit rounded-button px-2.5 py-1 text-xs font-semibold',
            stockShortfall > 0 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
          )}>
            {stockShortfall > 0 ? `${stockShortfall.toLocaleString()} short` : 'Balanced'}
          </span>
        </div>
        <div className="grid gap-0 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-5">
          <StockMovementTile label={['COMPLETED', 'BROODER'].includes(batch.status || '') ? 'Hatched Stock' : 'Projected Stock'} value={stockBasis} helper={['COMPLETED', 'BROODER'].includes(batch.status || '') ? 'Recorded hatch minus losses' : 'Accepted eggs minus recorded losses'} tone="primary" />
          <StockMovementTile label="Held for Orders" value={heldForOrders} helper="Allocated and not picked up" tone="warning" />
          <StockMovementTile label="Picked Up" value={pickedUpChicks} helper="Already handed over" tone="success" />
          <StockMovementTile label="Losses" value={totalLosses} helper="Culled plus mortality" tone="danger" />
          <StockMovementTile label="Available" value={availableForNewOrders} helper="Free for new orders" tone={availableForNewOrders > 0 ? 'success' : 'muted'} />
        </div>
        <div className="border-t border-border bg-muted/5 px-5 py-3 text-xs text-muted-foreground">
          Stock is calculated from hatch results, order allocations, handovers, candling removals, and mortality records.
        </div>
      </Card>

      <div className="space-y-4">
        
        {/* Main Stage Panel */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase">Received Eggs</div>
              <div className="text-2xl font-semibold text-primary tabular-nums">{quantity.toLocaleString()}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase">Accepted Incubating</div>
              <div className="text-2xl font-semibold text-success tabular-nums">{incubatingEggs.toLocaleString()}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase text-destructive">Mortality / Culled</div>
              <div className="flex items-end gap-2 text-2xl font-semibold text-destructive tabular-nums">
                {totalLosses.toLocaleString()} <span className="text-sm font-medium text-destructive/70 mb-1">({mortalityPercentage}%)</span>
              </div>
            </Card>
          </div>

          <Card>
            <div className="flex flex-col gap-3 border-b border-border bg-muted/10 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-base font-semibold tracking-tight text-foreground">Incubation Lifecycle</h3>
              <div className="flex flex-wrap gap-2">
                {batch.status === 'SETTER' && (
                  <>
                    {canRecordCandling ? (
                      <BatchLifecycleActionDialog
                        action="candling"
                        batchId={batch.id}
                        batchNumber={batch.batch_number}
                        loadedEggs={incubatingEggs}
                        currentCulled={culled}
                        triggerLabel={candlingRecorded ? 'Update Candling' : 'Record Candling'}
                        compact
                      />
                    ) : (
                      <span className="rounded-button border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                        Candling opens {candlingOpensAt ? formatDate(candlingOpensAt.toISOString()) : 'after placement'}
                      </span>
                    )}
                    {canMoveToLockdown ? (
                      <BatchLifecycleActionDialog
                        action="lockdown"
                        batchId={batch.id}
                        batchNumber={batch.batch_number}
                        loadedEggs={incubatingEggs}
                        currentCulled={culled}
                        triggerLabel="Move to Hatch Prep"
                        compact
                      />
                    ) : (
                      <span className="rounded-button border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                        Hatch prep opens {lockdownOpensAt ? formatDate(lockdownOpensAt.toISOString()) : 'after placement'}
                      </span>
                    )}
                  </>
                )}
                {batch.status === 'HATCHER' && (
                  <BatchLifecycleActionDialog
                    action="hatch"
                    batchId={batch.id}
                    batchNumber={batch.batch_number}
                    loadedEggs={incubatingEggs}
                    currentCulled={culled}
                    triggerLabel="Record Hatch"
                    compact
                  />
                )}
              </div>
            </div>
            <div className="relative p-5">
              <div className="absolute bottom-5 left-9 top-5 z-0 w-0.5 bg-border"></div>
              
              <div className="relative z-10 space-y-6">
                <TimelineEvent 
                  icon={<ThermometerSun className="w-5 h-5" />}
                  title="Incubator Placement"
                  date={batch.set_date || 'Pending'}
                  description="Eggs placed into incubator slots to begin the 21-day cycle."
                  status={batch.status === 'LOGGED' ? 'pending' : 'completed'}
                />
                <TimelineEvent 
                  icon={<Eye className="w-5 h-5" />}
                  title="Candling & Viability Check"
                  date={candlingRecorded ? formatDate(batch.candling_recorded_at) : `Window (${CANDLING_WINDOW_LABEL})`}
                  description={candlingRecorded 
                    ? `✓ Completed: ${culled.toLocaleString()} eggs culled and removed from active count`
                    : "Mid-cycle fertility inspection. Record infertile or culled eggs so hatch yield and inventory stay accurate."}
                  status={candlingTimelineStatus}
                />
                <TimelineEvent 
                  icon={<Settings className="w-5 h-5" />}
                  title="Lockdown / Hatch Prep"
                  date={`Pending (${LOCKDOWN_LABEL})`}
                  description="Stop turning and move eggs into hatch preparation for the final days."
                  status={lockdownTimelineStatus}
                />
                <TimelineEvent 
                  icon={<HeartPulse className="w-5 h-5" />}
                  title="Hatch Completion"
                  date={batch.expected_hatch_date || 'Pending'}
                  description="Final chick count and hatchability recording."
                  status={(batch.status === 'COMPLETED' || batch.status === 'BROODER') ? 'completed' : 'pending'}
                  isLast
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Action & Linked Data Sidebar */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
          
          {['BROODER', 'COMPLETED'].includes(batch.status || '') ? (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border bg-muted/10 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                  <HeartPulse className="w-4 h-4" />
                  Repair Hatch Date
                </h3>
              </div>
              <div className="p-4">
                <RepairHatchDateDialog
                  batchId={batch.id}
                  batchNumber={batch.batch_number}
                  currentHatchDate={batch.actual_hatch_date}
                />
              </div>
            </Card>
          ) : null}

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-muted/10 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
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
                <span className="text-xs font-medium text-muted-foreground">Loading / Offloading</span>
                <span className="text-sm font-semibold tabular-nums text-foreground">KES {(batch.loading_offloading_cost || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">Misc Setup</span>
                <span className="text-sm font-semibold tabular-nums text-foreground">KES {(batch.misc_initial_cost || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">Cost / Accepted Egg</span>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  KES {(batch.cost_per_accepted_egg || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div className="p-3 border-t border-border bg-muted/5 flex justify-between items-center">
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Base Total</span>
              <span className="text-sm font-bold text-foreground tabular-nums font-mono">KES {initialCost.toLocaleString()}</span>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-muted/10 p-4">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">Acquisition Cost Items</h3>
            </div>
            <div className="divide-y divide-border/50">
              {!acquisitionCosts || acquisitionCosts.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-xs text-muted-foreground font-medium">No acquisition cost items recorded.</p>
                </div>
              ) : (
                acquisitionCosts.map((cost) => (
                  <div key={cost.id} className="p-3 flex items-center justify-between">
                    <div className="text-xs font-semibold text-foreground">
                      {cost.cost_type}
                    </div>
                    <div className="text-xs font-bold text-foreground tabular-nums">
                      KES {Number(cost.amount || 0).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border bg-muted/10 p-4">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">Inspection Photos</h3>
            </div>
            {photoAttachments.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs text-muted-foreground font-medium">No inspection photos uploaded.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 p-4">
                {photoAttachments.map((photo) => {
                  const url = photoUrls[photo.storage_path];
                  return (
                    <a
                      key={photo.id}
                      href={url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="border border-border rounded-md overflow-hidden text-xs text-muted-foreground"
                    >
                      {url ? (
                        <Image
                          src={url}
                          alt={photo.file_name}
                          width={160}
                          height={96}
                          unoptimized
                          className="w-full h-24 object-cover"
                        />
                      ) : (
                        <div className="w-full h-24 flex items-center justify-center bg-muted">
                          Unavailable
                        </div>
                      )}
                      <div className="p-2 truncate" title={photo.file_name}>
                        {photo.file_name}
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-muted/10 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
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
                costs.map((cost: any) => {
                  const category = Array.isArray(cost.expense_categories)
                    ? cost.expense_categories[0]
                    : cost.expense_categories;
                  const categoryName = category?.name || category?.expense_type || 'Operational Cost';
                  const costDate = cost.incurred_at || cost.created_at;

                  return (
                  <div key={cost.id} className="p-3 hover:bg-muted/5 transition-colors">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-semibold text-foreground">{categoryName}</span>
                      <span className="text-xs font-bold text-destructive font-mono tabular-nums">
                        KES {Number(cost.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{cost.description}</p>
                    <div className="text-[10px] text-muted-foreground/60 mt-1 uppercase">
                      {new Date(costDate).toLocaleDateString()}
                    </div>
                  </div>
                  );
                })
              )}
            </div>
            <div className="p-3 border-t border-border bg-muted/10 flex justify-between items-center">
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">OpEx Subtotal</span>
              <span className="text-sm font-bold text-foreground tabular-nums font-mono">KES {operationalCostsTotal.toLocaleString()}</span>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-muted/10 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
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
                mortalityEvents.map(evt => {
                  const voided = Boolean(evt.voided_at);

                  return (
                  <div
                    key={evt.id}
                    className={cn(
                      'p-3 transition-colors border-l-2',
                      voided
                        ? 'border-l-warning/50 bg-muted/20 opacity-75'
                        : 'border-l-destructive/50 hover:bg-muted/5'
                    )}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-semibold text-foreground">
                        {evt.stage} - {evt.cause}
                        {voided ? (
                          <span className="ml-2 rounded-button border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                            Voided
                          </span>
                        ) : null}
                      </span>
                      <span className={cn('text-xs font-bold font-mono tabular-nums', voided ? 'text-muted-foreground line-through' : 'text-destructive')}>
                        -{evt.count} birds
                      </span>
                    </div>
                    {evt.notes && <p className="text-[11px] text-muted-foreground">{evt.notes}</p>}
                    {voided && evt.void_reason ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">Correction: {evt.void_reason}</p>
                    ) : null}
                    <div className="flex justify-between items-center mt-1">
                      <div className="text-[10px] text-muted-foreground/60 uppercase">
                        {new Date(evt.recorded_at).toLocaleDateString()}
                      </div>
                      <div className={cn('text-[10px] font-semibold font-mono', voided ? 'text-muted-foreground line-through' : 'text-destructive/80')}>
                        ~KES {(evt.estimated_financial_loss || 0).toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:0})} loss
                      </div>
                    </div>
                    {canVoidMortality && !voided ? (
                      <div className="mt-2 flex justify-end">
                        <VoidMortalityDialog
                          eventId={evt.id}
                          batchNumber={batch.batch_number}
                          count={Number(evt.count || 0)}
                          estimatedLoss={Number(evt.estimated_financial_loss || 0)}
                        />
                      </div>
                    ) : null}
                  </div>
                  )
                })
              )}
            </div>
            <div className="p-3 border-t border-border bg-muted/10 flex justify-between items-center">
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Total Mortality</span>
              <span className="text-sm font-bold text-destructive tabular-nums font-mono">{mortality.toLocaleString()} birds</span>
            </div>
          </Card>

          <Card>
            <div className="border-b border-border bg-muted/10 p-4">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">Telemetry Context</h3>
            </div>
            <div className="p-4 text-center">
              <AlertTriangle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground font-medium">
                {batch.incubator_id
                  ? 'Batch is linked to an incubator. Telemetry will appear here when live readings are available.'
                  : 'Batch is not assigned to a live incubator yet. Place it in an incubator to view climate data.'}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function NextBestBatchAction({
  batch,
  loadedEggs,
  currentCulled,
  candlingRecorded,
  canRecordCandling,
  candlingOpensLabel,
  canMoveToLockdown,
  lockdownOpensLabel,
}: {
  batch: any
  loadedEggs: number
  currentCulled: number
  candlingRecorded: boolean
  canRecordCandling: boolean
  candlingOpensLabel: string | null
  canMoveToLockdown: boolean
  lockdownOpensLabel: string | null
}) {
  const brooderStatus = batch.status === 'BROODER';
  const closedStatuses = ['COMPLETED', 'FAILED', 'DISCARDED', 'CANCELLED'];
  const isClosed = closedStatuses.includes(batch.status || '');

  if (batch.status === 'LOGGED' || !batch.incubator_id) {
    return (
      <Card className="overflow-hidden border-primary/30 bg-primary/5">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Recommended next step</p>
              <h2 className="mt-1 text-base font-semibold tracking-tight text-foreground">Place this batch in an incubator</h2>
              <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
                Accepted eggs are ready for placement. Once placed, the system can track cycle day, expected hatch date, and incubator capacity.
              </p>
            </div>
          </div>
          <Button
            render={<Link href="/incubation" />}
            nativeButton={false}
            className="w-full gap-2 sm:w-auto"
          >
            <MapPin className="h-4 w-4" />
            Place Batch
          </Button>
        </div>
      </Card>
    );
  }

  if (batch.status === 'SETTER' && canRecordCandling && !candlingRecorded) {
    return (
      <BatchActionCard
        icon={<Eye className="h-5 w-5" />}
        title="Record candling results"
        description="This removes infertile or rejected eggs from the active count so hatch forecasts and losses stay accurate."
        action={
          <BatchLifecycleActionDialog
            action="candling"
            batchId={batch.id}
            batchNumber={batch.batch_number}
            loadedEggs={loadedEggs}
            currentCulled={currentCulled}
            triggerLabel="Record Candling"
          />
        }
      />
    );
  }

  if (batch.status === 'SETTER' && canMoveToLockdown) {
    return (
      <BatchActionCard
        icon={<PackageCheck className="h-5 w-5" />}
        title="Move this batch to hatch prep"
        description="The lockdown window is open. Move the batch into hatch preparation so the final hatch stage is clear to the team."
        action={
          <BatchLifecycleActionDialog
            action="lockdown"
            batchId={batch.id}
            batchNumber={batch.batch_number}
            loadedEggs={loadedEggs}
            currentCulled={currentCulled}
            triggerLabel="Move to Hatch Prep"
          />
        }
      />
    );
  }

  if (batch.status === 'HATCHER') {
    return (
      <BatchActionCard
        icon={<HeartPulse className="h-5 w-5" />}
        title="Record hatch completion"
        description="Enter the final chick count and unhatched losses. This closes the cycle and makes the numbers ready for sales and reporting."
        action={
          <BatchLifecycleActionDialog
            action="hatch"
            batchId={batch.id}
            batchNumber={batch.batch_number}
            loadedEggs={loadedEggs}
            currentCulled={currentCulled}
            triggerLabel="Record Hatch"
          />
        }
      />
    );
  }

  if (batch.status === 'AWAITING_HATCH_COUNT') {
    const daysOverdue = Math.floor((new Date().getTime() - new Date(batch.expected_hatch_date).getTime()) / (1000 * 60 * 60 * 24));
    return (
      <BatchActionCard
        icon={<AlertCircle className="h-5 w-5 text-warning" />}
        title="Hatch count recording overdue"
        description={`This batch hatch date was ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} ago. The cycle cannot complete until the final chick count is recorded. Reopen the batch to record hatch data now.`}
        action={
          <div className="flex flex-col gap-2">
            <BatchLifecycleActionDialog
              action="hatch"
              batchId={batch.id}
              batchNumber={batch.batch_number}
              loadedEggs={loadedEggs}
              currentCulled={currentCulled}
              triggerLabel="Record Hatch Now"
              compact
            />
            <p className="text-xs text-muted-foreground">or</p>
            <ReopenBatchButton batchId={batch.id} batchNumber={batch.batch_number} />
          </div>
        }
      />
    );
  }

  if (batch.status === 'FAILED') {
    return (
      <BatchActionCard
        icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
        title="Batch marked as failed - Recovery available"
        description="This batch can be reopened to record hatch data. Use this option to recover the batch cycle and complete the recording."
        action={
          <ReopenBatchButton batchId={batch.id} batchNumber={batch.batch_number} />
        }
      />
    );
  }

  if (brooderStatus) {
    return (
      <BatchActionCard
        icon={<CheckCircle2 className="h-5 w-5" />}
        title="Batch is in the brooder stage"
        description="Hatch results are recorded and chicks are now managed in brooder. Record mortality, vaccinations, and orders as needed."
        action={
          <Button
            render={<Link href="/orders" />}
            nativeButton={false}
            variant="outline"
            className="w-full gap-2 sm:w-auto"
          >
            <ArrowRight className="h-4 w-4" />
            Review Orders
          </Button>
        }
      />
    );
  }

  if (isClosed) {
    return (
      <BatchActionCard
        icon={<CheckCircle2 className="h-5 w-5" />}
        title="Batch cycle is closed"
        description="Review hatch results, costs, and linked orders from this record before making sales or performance decisions."
        action={
          <Button
            render={<Link href="/orders" />}
            nativeButton={false}
            variant="outline"
            className="w-full gap-2 sm:w-auto"
          >
            <ArrowRight className="h-4 w-4" />
            Review Orders
          </Button>
        }
      />
    );
  }

  return (
    <BatchActionCard
      icon={<ThermometerSun className="h-5 w-5" />}
      title="Keep monitoring this batch"
      description={
        batch.status === 'SETTER'
          ? `Next window: candling ${candlingRecorded ? 'is already recorded' : `opens ${candlingOpensLabel || 'soon'}`}; lockdown opens ${lockdownOpensLabel || 'later'}.`
          : 'The batch has no immediate manual action. Keep checking environment readings and mortality events.'
      }
      action={
        <Button
          render={<Link href="/incubation" />}
          nativeButton={false}
          variant="outline"
          className="w-full gap-2 sm:w-auto"
        >
          <ArrowRight className="h-4 w-4" />
          Open Incubation
        </Button>
      }
    />
  );
}

function BatchActionCard({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action: ReactNode
}) {
  return (
    <Card className="overflow-hidden border-primary/30 bg-primary/5">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Recommended next step</p>
            <h2 className="mt-1 text-base font-semibold tracking-tight text-foreground">{title}</h2>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
    </Card>
  );
}

function MetricLine({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-button border border-border bg-background p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{helper}</p>
    </div>
  )
}

function StockMovementTile({
  label,
  value,
  helper,
  tone,
}: {
  label: string
  value: number
  helper: string
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'muted'
}) {
  return (
    <div className="min-h-24 p-4">
      <p className={cn(
        'text-xs font-semibold uppercase tracking-wide',
        tone === 'primary' && 'text-primary',
        tone === 'success' && 'text-success',
        tone === 'warning' && 'text-warning',
        tone === 'danger' && 'text-destructive',
        tone === 'muted' && 'text-muted-foreground'
      )}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const label = status === 'SETTER' ? 'IN INCUBATOR' : status;

  return (
    <span className={cn(
      "inline-flex items-center rounded-button border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
      status === 'LOGGED' && "bg-muted text-muted-foreground border-border",
      status === 'SETTER' && "bg-status-setter text-status-setter-text border-status-setter/50",
      status === 'HATCHER' && "bg-status-hatcher text-status-hatcher-text border-status-hatcher/50",
      status === 'BROODER' && "bg-status-hatcher text-status-hatcher-text border-status-hatcher/50",
      status === 'COMPLETED' && "bg-status-completed text-status-completed-text border-status-completed/50",
      status === 'FAILED' && "bg-destructive/10 text-destructive border-destructive/20",
      status === 'DISCARDED' && "bg-destructive/10 text-destructive border-destructive/20",
      status === 'CANCELLED' && "bg-muted/50 text-muted-foreground border-border",
      !['LOGGED', 'SETTER', 'HATCHER', 'BROODER', 'COMPLETED', 'FAILED', 'DISCARDED', 'CANCELLED'].includes(status) && "bg-muted text-muted-foreground border-border"
    )}>
      {label}
    </span>
  );
}

function TimelineEvent({ icon, title, date, description, status, isLast = false }: any) {
  return (
    <div className="flex gap-3">
      <div className={cn(
        "z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 bg-background transition-colors",
        status === 'completed' && "border-success bg-success/10 text-success",
        status === 'active' && "border-primary bg-primary/10 text-primary shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)]",
        status === 'pending' && "border-border bg-muted/30 text-muted-foreground",
      )}>
        {icon}
      </div>
      <div className={cn("pb-5 pt-1.5", isLast && "pb-0")}>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h4 className={cn("font-medium tracking-tight", status === 'pending' ? 'text-muted-foreground' : 'text-foreground')}>{title}</h4>
          <span className="rounded-button bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{date}</span>
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
