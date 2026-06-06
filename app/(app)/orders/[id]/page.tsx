import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CreditCard, Package, Scale, ShoppingCart, TrendingDown, TrendingUp, Truck, User, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { AdjustPricingDialog } from '../components/adjust-pricing-dialog';
import { AllocateBatchDialog } from '../components/allocate-batch-dialog';
import { CompleteHandoverDialog } from '../components/complete-handover-dialog';
import { OrderActionsMenu } from '../components/order-actions-menu';
import { OrderReceiptCard } from '../components/order-receipt-card';
import { RecordPaymentDialog } from '../components/record-payment-dialog';

export const metadata: Metadata = {
  title: 'Order Details | Smart Hatchery OS',
  description: 'Detailed operational view of a chick order.',
};

type OrderRecord = any;
type OrderItemRecord = any;
type BatchRecord = any;
type AuditRecord = any;

export default async function OrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const db = supabase as any;

  const { data: order } = await db
    .from('orders')
    .select(`
      *,
      customers (
        id,
        name,
        phone,
        address,
        city,
        country
      ),
      order_items (
        id,
        batch_id,
        description,
        quantity,
        unit_price,
        total_price,
        status,
        egg_batches (
          batch_number,
          total_initial_cost,
          quantity_hatched,
          quantity_set,
          accepted_eggs,
          quantity_received,
          quantity_culled,
          mortality_count,
          actual_hatch_date,
          daily_holding_cost_per_chick
        )
      )
    `)
    .eq('id', id)
    .single();

  if (!order) {
    notFound();
  }

  const { data: receiptSettings } = order.tenant_id
    ? await db
        .from('business_settings')
        .select('business_name, receipt_title, receipt_tagline, receipt_phone, receipt_location, receipt_footer, receipt_show_system_branding')
        .eq('tenant_id', order.tenant_id)
        .maybeSingle()
    : { data: null };

  const { data: auditLogs } = await db
    .from('audit_logs')
    .select('*')
    .eq('entity_type', 'order')
    .eq('entity_id', order.id)
    .order('created_at', { ascending: false });

  const { data: payments } = await db
    .from('order_payments')
    .select('amount, payment_method, transaction_reference, paid_at, recorded_at')
    .eq('order_id', order.id)
    .order('recorded_at', { ascending: false });

  const { data: dispatches } = await db
    .from('order_dispatches')
    .select('carrier, driver_name, driver_phone, vehicle_number, handover_quantity, dispatched_at, delivered_at, notes')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false });

  const { data: batches } = await db
    .from('egg_batches')
    .select('id, batch_number, breed_type, quantity_received, quantity_set, accepted_eggs, quantity_hatched, quantity_culled, mortality_count, status')
    .not('status', 'eq', 'DISCARDED')
    .not('status', 'eq', 'FAILED')
    .not('status', 'eq', 'CANCELLED');

  const { data: allocations } = await db
    .from('order_items')
    .select('batch_id, quantity, status')
    .not('batch_id', 'is', null);

  const batchAllocations = (allocations || []).reduce((acc: Record<string, number>, curr: OrderItemRecord) => {
    if (curr.batch_id && curr.status !== 'CANCELLED') {
      acc[curr.batch_id] = (acc[curr.batch_id] || 0) + (curr.quantity || 0);
    }
    return acc;
  }, {});

  const availableBatches = (batches || [])
    .map((batch: BatchRecord) => {
      const projectedLoss = (batch.quantity_culled || 0) + (batch.mortality_count || 0);
      const incubationBase = batch.quantity_set ?? batch.accepted_eggs ?? batch.quantity_received ?? 0;
      const baseQuantity = ['COMPLETED', 'BROODER'].includes(batch.status || '')
        ? batch.quantity_hatched || 0
        : Math.max(0, incubationBase - projectedLoss);

      return {
        id: batch.id,
        batch_number: batch.batch_number,
        breedType: batch.breed_type,
        status: batch.status,
        baseQuantity,
        allocated_count: batchAllocations[batch.id] || 0,
      };
    })
    .filter((batch: BatchRecord) => batch.baseQuantity - batch.allocated_count > 0);

  const items = getOrderItems(order);
  const batchIds = items.map((item: OrderItemRecord) => item.batch_id).filter(Boolean);
  const { data: costEntries } = batchIds.length > 0
    ? await db
        .from('cost_entries')
        .select('batch_id, order_id, amount')
        .or(`batch_id.in.(${batchIds.join(',')}),order_id.eq.${order.id}`)
        .is('deleted_at', null)
    : await db
        .from('cost_entries')
        .select('batch_id, order_id, amount')
        .eq('order_id', order.id)
        .is('deleted_at', null);
  const primaryItem = items[0];
  const quantity = order.total_quantity ?? primaryItem?.quantity ?? 0;
  const balanceDue = order.balance_due || 0;
  const amountPaid = order.amount_paid || 0;
  const customer = Array.isArray((order as any).customers) ? (order as any).customers[0] : (order as any).customers;
  const allocatedBatch = primaryItem?.egg_batches
    ? Array.isArray(primaryItem.egg_batches)
      ? primaryItem.egg_batches[0]
      : primaryItem.egg_batches
    : null;
  const allocatedBatchId = primaryItem?.batch_id || null;
  const closed = ['DELIVERED', 'CANCELLED'].includes(order.status || '');
  const takenQuantity = (dispatches || []).reduce((sum: number, dispatch: any) => sum + Number(dispatch.handover_quantity || 0), 0);
  const remainingQuantity = Math.max(0, quantity - takenQuantity);
  const requestedBreed = getRequestedBreed(primaryItem?.description);
  const salesEconomics = calculateSalesEconomics(order, items, costEntries || []);

  return (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Link href="/orders" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Orders
        </Link>
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-[0.08em]">Order ID:</span>{' '}
          <span className="font-mono">{order.id}</span>
        </div>
      </div>

      <Card className="rounded-card border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground">{order.order_number}</h1>
              <OrderStatusBadge status={order.status || ''} />
              <PaymentStatusBadge status={order.payment_status || ''} />
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {customer?.name || 'Unnamed customer'} / Created {formatDate(order.created_at)}
            </p>
          </div>
          <OrderActionsMenu
            orderId={order.id}
            status={order.status}
            paymentStatus={order.payment_status}
            hasAllocatedBatch={Boolean(allocatedBatchId)}
          />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Reserved Volume" value={quantity.toLocaleString()} helper="Chicks requested" icon={<ShoppingCart className="h-5 w-5" />} tone="blue" />
        <SummaryCard label="Total Amount" value={formatCurrency(order.total_amount || 0)} helper={`KES ${(primaryItem?.unit_price || 0).toLocaleString()} per chick`} icon={<Wallet className="h-5 w-5" />} tone="blue" />
        <SummaryCard label="Amount Paid" value={formatCurrency(amountPaid)} helper={balanceDue > 0 ? `${formatCurrency(balanceDue)} due` : 'Fully settled'} icon={<CreditCard className="h-5 w-5" />} tone={balanceDue > 0 ? 'amber' : 'green'} />
        <SummaryCard label="Allocated Batch" value={allocatedBatch?.batch_number || 'Pending'} helper={allocatedBatchId ? 'Inventory linked' : 'Needs allocation'} icon={<Package className="h-5 w-5" />} tone={allocatedBatchId ? 'green' : 'amber'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {order.notes ? (
            <Card className="rounded-card border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-base font-semibold text-foreground">Order Notes</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{order.notes}</p>
            </Card>
          ) : null}

          <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
            <div className="border-b border-border bg-muted/10 px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">Fulfillment Lifecycle</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Reservation, payment, allocation, and dispatch progress.</p>
            </div>
            <div className="p-5">
              <div className="space-y-6">
                <TimelineEvent
                  icon={<User className="h-5 w-5" />}
                  title="Reservation Logged"
                  date={formatDate(order.created_at)}
                  description="Customer request is captured in the order book."
                  status="completed"
                />
                <TimelineEvent
                  icon={<CreditCard className="h-5 w-5" />}
                  title="Payment Secured"
                  date={['PARTIAL', 'PAID'].includes(order.payment_status || '') ? 'Recorded' : 'Pending'}
                  description="Deposit or full payment confirms the booking."
                  status={['PARTIAL', 'PAID'].includes(order.payment_status || '') ? 'completed' : 'pending'}
                />
                <TimelineEvent
                  icon={<Package className="h-5 w-5" />}
                  title="Batch Allocation"
                  date={allocatedBatch?.batch_number || 'Pending'}
                  description="Order is matched to hatch inventory when enough chicks are available."
                  status={allocatedBatchId ? 'completed' : ['RESERVED', 'CONFIRMED'].includes(order.status || '') ? 'active' : 'pending'}
                />
                <TimelineEvent
                  icon={<Truck className="h-5 w-5" />}
                  title="Pickup / Delivery"
                  date={formatDate(order.required_by_date)}
                  description="Customer pickup or delivery is recorded here to close the sale."
                  status={['DISPATCHED', 'DELIVERED'].includes(order.status || '') ? 'completed' : order.status === 'READY_FOR_DISPATCH' ? 'active' : 'pending'}
                  isLast
                />
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
              <div className="border-b border-border bg-muted/10 px-5 py-4">
                <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <Scale className="h-4 w-4 text-primary" />
                  Inventory Ledger
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Reserved, handed over, and remaining chicks.</p>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border text-center">
                <LedgerCell label="Reserved" value={quantity} />
                <LedgerCell label="Taken" value={takenQuantity} />
                <LedgerCell label="Remaining" value={remainingQuantity} />
              </div>
            </Card>

            <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
              <div className="border-b border-border bg-muted/10 px-5 py-4">
                <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  {salesEconomics.estimatedProfit >= 0 ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                  Sale Profit Check
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Uses batch cost, logged costs, and configured holding cost.</p>
              </div>
              <div className="grid gap-3 p-5 text-sm">
                <InfoRow label="Estimated Cost / Chick" value={formatCurrency(salesEconomics.costPerChick)} />
                <InfoRow label="Sale Price / Chick" value={formatCurrency(salesEconomics.netSalePerChick)} />
                <InfoRow label="Estimated Profit" value={formatCurrency(salesEconomics.estimatedProfit)} />
                {salesEconomics.estimatedProfit < 0 ? (
                  <div className="rounded-button border border-destructive/20 bg-destructive/5 p-3 text-xs font-medium text-destructive">
                    Loss warning: this order appears to sell below the current cost basis.
                  </div>
                ) : (
                  <div className="rounded-button border border-success/20 bg-success/5 p-3 text-xs font-medium text-success">
                    Profit check passes based on current cost records.
                  </div>
                )}
              </div>
            </Card>
          </div>

          <OrderReceiptCard
            orderNumber={order.order_number}
            customerName={customer?.name || 'Unnamed customer'}
            customerPhone={customer?.phone}
            customerLocation={customer?.address || customer?.city || customer?.country}
            orderDate={order.order_date || order.created_at}
            items={items}
            subtotalAmount={order.subtotal_amount || 0}
            discountAmount={order.discount_amount || 0}
            totalAmount={order.total_amount || 0}
            amountPaid={amountPaid}
            balanceDue={balanceDue}
            payments={payments || []}
            dispatches={dispatches || []}
            branding={receiptSettings}
          />
        </div>

        <div className="space-y-4">
          <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
            <div className="border-b border-border bg-muted/10 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-foreground">Customer Profile</h2>
                {customer?.id ? (
                  <Link href={`/customers/${customer.id}`} className="text-xs font-semibold text-primary hover:underline">
                    Open CRM
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="space-y-4 p-5 text-sm">
              <InfoRow label="Name" value={customer?.name || 'Not captured'} />
              <InfoRow label="Phone" value={customer?.phone || 'Not captured'} />
              <InfoRow label="Location" value={customer?.address || customer?.city || customer?.country || 'Not captured'} />
            </div>
          </Card>

          <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
            <div className="border-b border-border bg-muted/10 px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">Sales Assistant</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Next step for this customer.</p>
            </div>
            <div className="space-y-3 p-5">
              {closed ? (
                <p className="text-sm text-muted-foreground">
                  This order is closed. Use the receipt card to print or share the customer record.
                </p>
              ) : balanceDue > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Outstanding balance: <span className="font-semibold text-destructive">{formatCurrency(balanceDue)}</span>
                  </p>
                  <AdjustPricingDialog
                    orderId={order.id}
                    quantity={quantity}
                    currentUnitPrice={primaryItem?.unit_price || 0}
                    currentDiscount={order.discount_amount || 0}
                  />
                  <RecordPaymentDialog orderId={order.id} balanceDue={balanceDue} />
                </>
              ) : allocatedBatchId ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Payment is complete and stock is linked. Record pickup or delivery to close the sale.
                  </p>
                  <AdjustPricingDialog
                    orderId={order.id}
                    quantity={quantity}
                    currentUnitPrice={primaryItem?.unit_price || 0}
                    currentDiscount={order.discount_amount || 0}
                  />
                  <CompleteHandoverDialog
                    orderId={order.id}
                    customerName={customer?.name || 'Customer'}
                    customerPhone={customer?.phone || ''}
                    customerLocation={customer?.address || customer?.city || customer?.country || ''}
                    remainingQuantity={remainingQuantity}
                    compact
                  />
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Payment is complete. Link the order to available stock before handover.</p>
                  <AdjustPricingDialog
                    orderId={order.id}
                    quantity={quantity}
                    currentUnitPrice={primaryItem?.unit_price || 0}
                    currentDiscount={order.discount_amount || 0}
                  />
                  <AllocateBatchDialog
                    orderId={order.id}
                    orderQuantity={quantity}
                    availableBatches={availableBatches}
                    requestedBreed={requestedBreed}
                  />
                </>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
            <div className="border-b border-border bg-muted/10 px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">Action Logs</h2>
            </div>
            <div className="p-5">
              {auditLogs && auditLogs.length > 0 ? (
                <div className="space-y-4">
                  {auditLogs.map((log: AuditRecord) => (
                    <div key={log.id} className="border-l-2 border-border pl-3 text-xs">
                      <p className="font-semibold text-foreground">{formatLabel(log.action || 'LOG')}</p>
                      <p className="mt-1 text-muted-foreground">{log.description}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{formatDateTime(log.created_at)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground">No manual actions logged recently.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  icon,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
  tone: 'blue' | 'green' | 'amber';
}) {
  return (
    <Card className="min-h-[132px] rounded-card border-border bg-card p-[18px] shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between">
        <div
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-[16px]',
            tone === 'blue' && 'bg-primary text-primary-foreground shadow-[0_14px_28px_rgba(37,99,235,0.24)]',
            tone === 'green' && 'bg-success/10 text-success',
            tone === 'amber' && 'bg-warning/10 text-warning'
          )}
        >
          {icon}
        </div>
      </div>
      <p className="mt-4 text-[13px] font-semibold text-foreground">{label}</p>
      <p className="mt-1 truncate text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</p>
      <p className="mt-3 border-t border-border pt-3 text-xs font-medium text-muted-foreground">{helper}</p>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-foreground">{value}</p>
    </div>
  );
}

function LedgerCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

function calculateSalesEconomics(order: OrderRecord, items: OrderItemRecord[], costEntries: any[]) {
  const quantity = Number(order.total_quantity || 0);
  const revenue = Number(order.total_amount || 0);
  const discount = Number(order.discount_amount || 0);
  const orderCosts = costEntries
    .filter((entry) => entry.order_id === order.id)
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const batchCost = items.reduce((sum, item) => {
    const batch = Array.isArray(item.egg_batches) ? item.egg_batches[0] : item.egg_batches;
    if (!batch) return sum;

    const batchCosts = costEntries
      .filter((entry) => entry.batch_id === item.batch_id)
      .reduce((entrySum, entry) => entrySum + Number(entry.amount || 0), 0);
    const baseCost = Number(batch.total_initial_cost || 0) + batchCosts;
    const costBasisQuantity = Number(batch.quantity_hatched || batch.quantity_set || batch.accepted_eggs || batch.quantity_received || 0);
    const baseCostPerChick = costBasisQuantity > 0 ? baseCost / costBasisQuantity : 0;
    const holdingDays = getHoldingDays(batch.actual_hatch_date);
    const holdingCostPerChick = holdingDays * Number(batch.daily_holding_cost_per_chick || 0);

    return sum + Number(item.quantity || 0) * (baseCostPerChick + holdingCostPerChick);
  }, 0);

  const estimatedCost = batchCost + orderCosts;
  const costPerChick = quantity > 0 ? estimatedCost / quantity : 0;
  const netSalePerChick = quantity > 0 ? revenue / quantity : 0;

  return {
    discount,
    estimatedCost,
    costPerChick,
    netSalePerChick,
    estimatedProfit: revenue - estimatedCost,
  };
}

function getRequestedBreed(description?: string | null) {
  const text = String(description || '')
  const [, breed] = text.split(' - ')
  return breed?.trim() || null
}

function getHoldingDays(actualHatchDate?: string | null) {
  if (!actualHatchDate) return 0;
  const start = new Date(actualHatchDate).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
}

function getOrderItems(order: OrderRecord): OrderItemRecord[] {
  return Array.isArray(order.order_items) ? order.order_items : [];
}

function TimelineEvent({
  icon,
  title,
  date,
  description,
  status,
  isLast = false,
}: {
  icon: ReactNode;
  title: string;
  date: string;
  description: string;
  status: 'completed' | 'active' | 'pending';
  isLast?: boolean;
}) {
  return (
    <div className="relative flex gap-4">
      {!isLast ? <div className="absolute left-[19px] top-10 h-[calc(100%+8px)] w-px bg-border" /> : null}
      <div
        className={cn(
          'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-card',
          status === 'completed' && 'border-success/30 bg-success/10 text-success',
          status === 'active' && 'border-primary/30 bg-primary/10 text-primary',
          status === 'pending' && 'border-border bg-muted/20 text-muted-foreground'
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn('text-sm font-semibold', status === 'pending' ? 'text-muted-foreground' : 'text-foreground')}>{title}</h3>
          <span className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{date}</span>
        </div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em]',
        status === 'INQUIRY' && 'border-border bg-muted text-muted-foreground',
        status === 'RESERVED' && 'border-primary/20 bg-primary/10 text-primary',
        status === 'CONFIRMED' && 'border-primary/20 bg-primary/10 text-primary',
        status === 'ALLOCATED' && 'border-info/20 bg-info/10 text-info',
        status === 'READY_FOR_DISPATCH' && 'border-warning/25 bg-warning/10 text-warning',
        status === 'DISPATCHED' && 'border-success/20 bg-success/10 text-success',
        status === 'DELIVERED' && 'border-success/20 bg-success/10 text-success',
        status === 'CANCELLED' && 'border-destructive/20 bg-destructive/10 text-destructive',
        !['INQUIRY', 'RESERVED', 'CONFIRMED', 'ALLOCATED', 'READY_FOR_DISPATCH', 'DISPATCHED', 'DELIVERED', 'CANCELLED'].includes(status) &&
          'border-border bg-muted text-muted-foreground'
      )}
    >
      {formatOrderStatus(status || 'UNSET')}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em]',
        status === 'PENDING' && 'border-destructive/20 bg-destructive/10 text-destructive',
        status === 'PARTIAL' && 'border-warning/25 bg-warning/10 text-warning',
        status === 'PAID' && 'border-success/20 bg-success/10 text-success',
        status === 'REFUNDED' && 'border-border bg-muted text-muted-foreground',
        !['PENDING', 'PARTIAL', 'PAID', 'REFUNDED'].includes(status) && 'border-border bg-muted text-muted-foreground'
      )}
    >
      {formatLabel(status || 'UNSET')}
    </span>
  );
}

function formatCurrency(value: number) {
  return `KES ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDate(value?: string | null) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleString();
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatOrderStatus(value: string) {
  if (value === 'READY_FOR_DISPATCH') return 'Ready For Pickup'
  if (value === 'DISPATCHED') return 'Out For Delivery'
  if (value === 'DELIVERED') return 'Completed'
  return formatLabel(value)
}
