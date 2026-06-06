import type { ComponentType } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  Package,
  Search,
  ShoppingCart,
  Wallet,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { isPaymentFollowUpDue, runOrderAutomation } from '@/lib/automation/order-automation';
import { calculateBatchCostSnapshot } from '@/lib/costing/batch-costing';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { CreateOrderDialog } from './components/create-order-dialog';
import { OrderNextAction } from './components/order-next-action';
import { OrderActionsMenu } from './components/order-actions-menu';

export const metadata: Metadata = {
  title: 'Orders | Smart Hatchery OS',
  description: 'Manage customer chick orders and dispatch.',
};

type OrdersPageProps = {
  searchParams?: Promise<{ q?: string }>;
};

type OrderRecord = any;
type OrderItemRecord = any;
type BatchRecord = any;
type CustomerRecord = any;

const DEFAULT_BREEDS = [
  'KARI Improved Kienyeji',
  'Improved Kienyeji',
  'Broiler',
  'Layer',
  'Local Kienyeji',
];

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const supabase = await createClient();
  const db = supabase as any;
  const params = searchParams ? await searchParams : {};
  const query = (params.q || '').trim();

  await runOrderAutomation(db);

  const { data: orders } = await db
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
        quantity,
        unit_price,
        total_price,
        status
      ),
      order_dispatches (
        handover_quantity
      )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const allOrders: OrderRecord[] = orders || [];
  const normalizedQuery = query.toLowerCase();
  const displayOrders = normalizedQuery
    ? allOrders.filter((order: OrderRecord) =>
        [
          order.order_number,
          getCustomerName(order),
          getCustomerPhone(order),
          getCustomerLocation(order),
          order.status,
          order.payment_status,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery))
      )
    : allOrders;

  const totalOrders = allOrders.length;
  const committedChicks = allOrders.reduce((acc: number, order: OrderRecord) => {
    if (['RESERVED', 'CONFIRMED', 'ALLOCATED', 'READY_FOR_DISPATCH'].includes(order.status || '')) {
      return acc + getOrderQuantity(order);
    }
    return acc;
  }, 0);
  const paidAwaitingPickup = allOrders.reduce((acc: number, order: OrderRecord) => {
    if (order.payment_status === 'PAID' && !['DELIVERED', 'CANCELLED'].includes(order.status || '')) {
      return acc + getRemainingQuantity(order);
    }
    return acc;
  }, 0);
  const totalBalanceDue = allOrders.reduce((acc: number, order: OrderRecord) => acc + (order.balance_due || 0), 0);
  const chicksTaken = allOrders.reduce((acc: number, order: OrderRecord) => {
    if (order.status === 'DELIVERED') {
      return acc + getOrderQuantity(order);
    }
    return acc;
  }, 0);

  const { data: activeBatches } = await db
    .from('egg_batches')
    .select('id, batch_number, breed_type, quantity_received, quantity_set, accepted_eggs, quantity_hatched, quantity_culled, mortality_count, status, set_date, expected_hatch_date, actual_hatch_date, total_initial_cost')
    .not('status', 'eq', 'DISCARDED')
    .not('status', 'eq', 'FAILED')
    .not('status', 'eq', 'CANCELLED');

  const { data: batchCosts } = await db
    .from('cost_entries')
    .select('batch_id, amount')
    .is('deleted_at', null);

  const { data: customers } = await db
    .from('customers')
    .select('id, name, phone, address, city, country, preferred_breed, preferred_payment_method, relationship_notes')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(250);

  const { data: settings } = await db
    .from('business_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  const defaultChickPrice = Number(settings?.default_chick_price ?? 130);
  const reservationExpiryDays = Number(settings?.reservation_expiry_days ?? 3);
  const breedOptions = Array.isArray(settings?.breed_options) && settings.breed_options.length > 0
    ? settings.breed_options
    : DEFAULT_BREEDS;

  const batchAllocations = allOrders.reduce((acc: Record<string, number>, order: OrderRecord) => {
    if (order.status === 'CANCELLED') return acc;
    getOrderItems(order).forEach((item: OrderItemRecord) => {
      if (item.batch_id && item.status !== 'CANCELLED') {
        acc[item.batch_id] = (acc[item.batch_id] || 0) + (item.quantity || 0);
      }
    });
    return acc;
  }, {});

  const manualCostByBatch = (batchCosts || []).reduce((acc: Record<string, number>, entry: any) => {
    if (!entry.batch_id) return acc;
    acc[entry.batch_id] = (acc[entry.batch_id] || 0) + Number(entry.amount || 0);
    return acc;
  }, {});

  const inventorySummary = (activeBatches || []).reduce(
    (acc: {
      projectedAvailableChicks: number;
      readyNowChicks: number;
      allocationCandidates: Array<{
        id: string;
        batchNumber: string;
        breedType?: string | null;
        status: string;
        expectedHatchDate?: string | null;
        available: number;
        baseQuantity: number;
        allocated: number;
        estimatedCostPerChick: number | null;
      }>;
    }, batch: BatchRecord) => {
      const allocated = batchAllocations[batch.id] || 0;
      const projectedLoss = (batch.quantity_culled || 0) + (batch.mortality_count || 0);
      const incubationBase = batch.quantity_set ?? batch.accepted_eggs ?? batch.quantity_received ?? 0;
      const isReadyBatch = ['COMPLETED', 'BROODER'].includes(batch.status || '');
      const baseQuantity = isReadyBatch
        ? batch.quantity_hatched || 0
        : Math.max(0, incubationBase - projectedLoss);
      const available = Math.max(0, baseQuantity - allocated);
      const costBasisQuantity = Number(batch.quantity_set ?? batch.accepted_eggs ?? batch.quantity_received ?? 0);
      const costSnapshot = calculateBatchCostSnapshot(batch, manualCostByBatch[batch.id] || 0, settings);
      const estimatedCostPerChick = costSnapshot.costPerChick > 0
        ? costSnapshot.costPerChick
        : costBasisQuantity > 0
          ? Number(batch.total_initial_cost || 0) / costBasisQuantity
          : null;

      return {
        projectedAvailableChicks: acc.projectedAvailableChicks + available,
        readyNowChicks: acc.readyNowChicks + (isReadyBatch ? available : 0),
        allocationCandidates: [
          ...acc.allocationCandidates,
          {
            id: batch.id,
            batchNumber: batch.batch_number,
            breedType: batch.breed_type,
            status: batch.status,
            expectedHatchDate: batch.expected_hatch_date,
            available,
            baseQuantity,
            allocated,
            estimatedCostPerChick,
          },
        ],
      };
    },
    {
      projectedAvailableChicks: 0,
      readyNowChicks: 0,
      allocationCandidates: [],
    }
  );

  const {
    projectedAvailableChicks,
    readyNowChicks,
    allocationCandidates,
  } = inventorySummary;

  const lastPriceByCustomer = new Map<string, number>();
  allOrders.forEach((order: OrderRecord) => {
    const customerId = getCustomerId(order);
    if (!customerId || lastPriceByCustomer.has(customerId)) return;
    const item = getOrderItems(order).find((entry: OrderItemRecord) => Number(entry.unit_price || 0) > 0);
    if (item) lastPriceByCustomer.set(customerId, Number(item.unit_price));
  });

  const customerOptions = (customers || []).map((customer: CustomerRecord) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone || '',
    location: customer.address || customer.city || customer.country || '',
    preferredBreed: customer.preferred_breed || '',
    preferredPaymentMethod: customer.preferred_payment_method || '',
    notes: customer.relationship_notes || '',
    lastPricePerChick: lastPriceByCustomer.get(customer.id) || null,
  }));
  const followUp = buildOrderFollowUp(allOrders, reservationExpiryDays);

  return (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Orders & Fulfillment</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Manage chick reservations, payments, allocations, and customer dispatch.
          </p>
        </div>
        <CreateOrderDialog
          projectedAvailableChicks={projectedAvailableChicks}
          readyNowChicks={readyNowChicks}
          defaultChickPrice={defaultChickPrice}
          breedOptions={breedOptions}
          customers={customerOptions}
          allocationCandidates={allocationCandidates.filter((batch: any) => batch.available > 0)}
        />
      </div>

      <FollowUpQueue followUp={followUp} />

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          label="Outstanding Balance"
          value={formatCurrency(totalBalanceDue)}
          helper="Pending customer payments"
          icon={Wallet}
          iconTone={totalBalanceDue > 0 ? 'red' : 'green'}
        />
        <MetricCard
          label="Committed Chicks"
          value={committedChicks.toLocaleString()}
          helper="Reserved, confirmed, or allocated"
          icon={Package}
          iconTone="blue"
        />
        <MetricCard
          label="Paid Awaiting Pickup"
          value={paidAwaitingPickup.toLocaleString()}
          helper={`${chicksTaken.toLocaleString()} already taken`}
          icon={CheckCircle2}
          iconTone="green"
        />
      </div>

      <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-3 border-b border-border bg-muted/10 px-5 py-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">Customer Orders</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {displayOrders.length.toLocaleString()} shown
              {query ? ` for "${query}"` : ''}.
            </p>
          </div>
          <form action="/orders" className="relative w-full max-w-[420px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search order number, customer, phone..."
              className="h-9 w-full rounded-input border border-input bg-background px-3 pl-9 text-[13px] font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
            />
          </form>
        </div>

        {displayOrders.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <ShoppingCart className="mx-auto mb-4 h-10 w-10 text-muted-foreground/40" />
            <h3 className="text-base font-semibold text-foreground">
              {query ? 'No matching orders' : 'No active orders'}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {query
                ? 'Try another order number, customer name, phone number, or status.'
                : 'Customer bookings, payment status, allocations, and dispatch workflows will appear here.'}
            </p>
            {query ? (
              <Link href="/orders" className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">
                Clear search
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-border bg-muted/20 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">Order ID</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Volume</th>
                  <th className="px-5 py-3 font-semibold">Revenue</th>
                  <th className="px-5 py-3 font-semibold">Order State</th>
                  <th className="px-5 py-3 font-semibold">Payment</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {displayOrders.map((order: OrderRecord) => (
                  (() => {
                    const hasAllocatedBatch = getOrderItems(order).some((item: OrderItemRecord) => Boolean(item.batch_id));
                    const remainingQuantity = getRemainingQuantity(order);
                    return (
                  <tr key={order.id} className="group transition-colors hover:bg-muted/15">
                    <td className="px-5 py-3.5">
                      <Link href={`/orders/${order.id}`} className="font-mono text-[13px] font-semibold text-primary hover:underline">
                        {order.order_number || order.id}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      {getCustomerId(order) ? (
                        <Link href={`/customers/${getCustomerId(order)}`} className="font-semibold text-foreground hover:text-primary hover:underline">
                          {getCustomerName(order)}
                        </Link>
                      ) : (
                        <div className="font-semibold text-foreground">{getCustomerName(order)}</div>
                      )}
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {[getCustomerPhone(order), getCustomerLocation(order)].filter(Boolean).join(' / ') || 'No contact details'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-semibold tabular-nums text-foreground">
                      {getOrderQuantity(order).toLocaleString()} chicks
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold tabular-nums text-foreground">{formatCurrency(order.total_amount || 0)}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Balance {formatCurrency(order.balance_due || 0)}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <OrderStatusBadge status={order.status || ''} />
                    </td>
                    <td className="px-5 py-3.5">
                      <PaymentStatusBadge status={order.payment_status || ''} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-2">
                        <OrderNextAction
                          orderId={order.id}
                          customerName={getCustomerName(order)}
                          customerPhone={getCustomerPhone(order)}
                          customerLocation={getCustomerLocation(order)}
                          balanceDue={order.balance_due || 0}
                          paymentStatus={order.payment_status}
                          status={order.status}
                          hasAllocatedBatch={hasAllocatedBatch}
                          remainingQuantity={remainingQuantity}
                        />
                        <OrderActionsMenu
                          orderId={order.id}
                          status={order.status}
                          paymentStatus={order.payment_status}
                          hasAllocatedBatch={hasAllocatedBatch}
                        />
                      </div>
                    </td>
                  </tr>
                    );
                  })()
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  iconTone,
}: {
  label: string;
  value: string;
  helper: string;
  icon: ComponentType<{ className?: string }>;
  iconTone: 'blue' | 'green' | 'amber' | 'red';
}) {
  return (
    <Card className="rounded-card border-border bg-card p-3.5 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]',
            iconTone === 'blue' && 'bg-primary text-primary-foreground shadow-[0_14px_28px_rgba(37,99,235,0.24)]',
            iconTone === 'green' && 'bg-success/10 text-success',
            iconTone === 'amber' && 'bg-warning/10 text-warning',
            iconTone === 'red' && 'bg-destructive/10 text-destructive'
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</p>
        </div>
      </div>
      <div className="mt-3 border-t border-border pt-2.5 text-xs font-medium text-muted-foreground">{helper}</div>
    </Card>
  );
}

function FollowUpQueue({ followUp }: { followUp: ReturnType<typeof buildOrderFollowUp> }) {
  const groups = [
    {
      label: 'Payment Follow-up',
      shortLabel: 'Payment Due',
      helper: 'Customers with balance due',
      count: followUp.paymentDue.length,
      items: followUp.paymentDue,
      icon: Wallet,
      tone: followUp.paymentDue.length > 0 ? 'amber' : 'green',
    },
    {
      label: 'Ready for Pickup',
      shortLabel: 'Pickup Ready',
      helper: 'Paid orders with allocated chicks',
      count: followUp.readyForHandover.length,
      items: followUp.readyForHandover,
      icon: CheckCircle2,
      tone: 'green',
    },
    {
      label: 'Needs Allocation',
      shortLabel: 'Stock Match',
      helper: 'Orders waiting for stock match',
      count: followUp.needsAllocation.length,
      items: followUp.needsAllocation,
      icon: Package,
      tone: followUp.needsAllocation.length > 0 ? 'blue' : 'green',
    },
    {
      label: 'Unpaid Hold Release',
      shortLabel: 'Hold Release',
      helper: 'Reserved stock near release',
      count: followUp.expiringHolds.length,
      items: followUp.expiringHolds,
      icon: Clock,
      tone: followUp.expiringHolds.length > 0 ? 'red' : 'green',
    },
  ] as const

  const actionItems = groups
    .flatMap((group) =>
      group.items.slice(0, 2).map((item) => ({
        ...item,
        groupLabel: group.label,
        tone: group.tone,
      }))
    )
    .slice(0, 3)

  return (
    <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-1 border-b border-border bg-muted/10 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Order Follow-up</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Payments, allocations, pickups, and unpaid holds that need attention.
          </p>
        </div>
        <span className={cn(
          'w-fit rounded-button px-2.5 py-1 text-xs font-semibold',
          followUp.totalActions > 0 ? 'bg-warning/12 text-warning' : 'bg-success/12 text-success'
        )}>
          {followUp.totalActions > 0 ? `${followUp.totalActions} action${followUp.totalActions === 1 ? '' : 's'}` : 'Clear'}
        </span>
      </div>
      <div className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {groups.map((group) => {
            const Icon = group.icon
            return (
              <div key={group.label} className="rounded-button border border-border bg-muted/10 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    group.tone === 'blue' && 'bg-primary text-primary-foreground shadow-[0_10px_20px_rgba(37,99,235,0.22)]',
                    group.tone === 'green' && 'bg-success/10 text-success',
                    group.tone === 'amber' && 'bg-warning/10 text-warning',
                    group.tone === 'red' && 'bg-destructive/10 text-destructive'
                  )}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                      {group.shortLabel}
                    </p>
                    <p className="text-xl font-semibold leading-none tracking-tight text-foreground">
                      {group.count.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="rounded-button border border-border bg-muted/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Next actions</p>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
              followUp.totalActions > 0 ? 'bg-warning/12 text-warning' : 'bg-success/12 text-success'
            )}>
              {followUp.totalActions > 0 ? `${followUp.totalActions} open` : 'Clear'}
            </span>
          </div>
          {actionItems.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {actionItems.map((item) => (
                <Link
                  key={`${item.groupLabel}-${item.id}`}
                  href={`/orders/${item.id}`}
                  className="block rounded-button bg-background/60 px-2.5 py-2 text-xs transition hover:bg-muted/35"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-foreground">{item.title}</span>
                    <span className={cn(
                      'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                      item.tone === 'blue' && 'bg-primary/10 text-primary',
                      item.tone === 'green' && 'bg-success/10 text-success',
                      item.tone === 'amber' && 'bg-warning/12 text-warning',
                      item.tone === 'red' && 'bg-destructive/10 text-destructive'
                    )}>
                      {item.groupLabel}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-muted-foreground">{item.detail}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-button bg-success/10 px-2.5 py-2 text-xs font-medium text-success">
              No action needed
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

function getCustomer(order: OrderRecord) {
  return Array.isArray(order.customers) ? order.customers[0] : order.customers;
}

function getOrderItems(order: OrderRecord): OrderItemRecord[] {
  return Array.isArray(order.order_items) ? order.order_items : [];
}

function getOrderQuantity(order: OrderRecord) {
  return order.total_quantity ?? order.quantity ?? getOrderItems(order).reduce((sum: number, item: OrderItemRecord) => sum + (item.quantity || 0), 0);
}

function getTakenQuantity(order: OrderRecord) {
  const dispatches = Array.isArray(order.order_dispatches) ? order.order_dispatches : [];
  return dispatches.reduce((sum: number, dispatch: any) => sum + Number(dispatch.handover_quantity || 0), 0);
}

function getRemainingQuantity(order: OrderRecord) {
  return Math.max(0, getOrderQuantity(order) - getTakenQuantity(order));
}

function buildOrderFollowUp(orders: OrderRecord[], reservationExpiryDays: number) {
  const openOrders = orders.filter((order) => !['DELIVERED', 'CANCELLED'].includes(order.status || ''))
  const toItem = (order: OrderRecord, detail: string) => ({
    id: order.id,
    title: `${order.order_number || order.id} / ${getCustomerName(order)}`,
    detail,
  })

  const paymentDue = openOrders
    .filter((order) => isPaymentFollowUpDue(order))
    .map((order) => toItem(order, `Balance ${formatCurrency(Number(order.balance_due || 0))}`))

  const readyForHandover = openOrders
    .filter((order) => order.payment_status === 'PAID')
    .filter((order) => getOrderItems(order).some((item) => item.batch_id && item.status !== 'CANCELLED'))
    .map((order) => toItem(order, `${getRemainingQuantity(order).toLocaleString()} chicks remaining`))

  const needsAllocation = openOrders
    .filter((order) => ['INQUIRY', 'RESERVED', 'CONFIRMED'].includes(order.status || ''))
    .filter((order) => !getOrderItems(order).some((item) => item.batch_id && item.status !== 'CANCELLED'))
    .map((order) => toItem(order, `${getOrderQuantity(order).toLocaleString()} chicks requested`))

  const expiringHolds = openOrders
    .filter((order) => order.payment_status === 'PENDING')
    .filter((order) => ['RESERVED', 'CONFIRMED', 'ALLOCATED'].includes(order.status || ''))
    .filter((order) => getOrderItems(order).some((item) => item.batch_id && item.status !== 'CANCELLED'))
    .map((order) => {
      const daysUsed = getElapsedWholeDays(order.created_at)
      const daysLeft = Math.max(0, reservationExpiryDays - daysUsed)
      return { order, daysLeft }
    })
    .filter(({ daysLeft }) => daysLeft <= 1)
    .map(({ order, daysLeft }) => toItem(order, daysLeft === 0 ? 'Release window reached' : '1 day left before release'))

  return {
    paymentDue,
    readyForHandover,
    needsAllocation,
    expiringHolds,
    totalActions: paymentDue.length + readyForHandover.length + needsAllocation.length + expiringHolds.length,
  }
}

function getElapsedWholeDays(value?: string | null) {
  if (!value) return 0
  const createdAt = new Date(value)
  if (Number.isNaN(createdAt.getTime())) return 0
  const elapsed = Date.now() - createdAt.getTime()
  return Math.max(0, Math.floor(elapsed / (24 * 60 * 60 * 1000)))
}

function getCustomerName(order: OrderRecord) {
  return getCustomer(order)?.name || order.customer_name || 'Unnamed customer';
}

function getCustomerId(order: OrderRecord) {
  return getCustomer(order)?.id || order.customer_id || '';
}

function getCustomerPhone(order: OrderRecord) {
  return getCustomer(order)?.phone || order.customer_phone || '';
}

function getCustomerLocation(order: OrderRecord) {
  const customer = getCustomer(order);
  return customer?.address || customer?.city || customer?.country || order.location || '';
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

function formatLabel(value: string) {
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatOrderStatus(value: string) {
  if (value === 'READY_FOR_DISPATCH') return 'Ready For Pickup'
  if (value === 'DISPATCHED') return 'Out For Delivery'
  if (value === 'DELIVERED') return 'Completed'
  return formatLabel(value)
}
