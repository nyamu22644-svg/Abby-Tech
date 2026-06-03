import type { ComponentType } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Banknote,
  CheckCircle2,
  Package,
  Search,
  ShoppingCart,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
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

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const supabase = await createClient();
  const db = supabase as any;
  const params = searchParams ? await searchParams : {};
  const query = (params.q || '').trim();

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
  const expectedRevenue = allOrders.reduce((acc: number, order: OrderRecord) => acc + (order.total_amount || 0), 0);
  const totalBalanceDue = allOrders.reduce((acc: number, order: OrderRecord) => acc + (order.balance_due || 0), 0);
  const chicksTaken = allOrders.reduce((acc: number, order: OrderRecord) => {
    if (order.status === 'DELIVERED') {
      return acc + getOrderQuantity(order);
    }
    return acc;
  }, 0);

  const { data: activeBatches } = await db
    .from('egg_batches')
    .select('id, batch_number, quantity_received, quantity_set, accepted_eggs, quantity_hatched, quantity_culled, mortality_count, status')
    .not('status', 'eq', 'DISCARDED')
    .not('status', 'eq', 'FAILED')
    .not('status', 'eq', 'CANCELLED');

  const batchAllocations = allOrders.reduce((acc: Record<string, number>, order: OrderRecord) => {
    if (order.status === 'CANCELLED') return acc;
    getOrderItems(order).forEach((item: OrderItemRecord) => {
      if (item.batch_id && item.status !== 'CANCELLED') {
        acc[item.batch_id] = (acc[item.batch_id] || 0) + (item.quantity || 0);
      }
    });
    return acc;
  }, {});

  let fulfillmentRisks = 0;
  let projectedAvailableChicks = 0;
  let readyNowChicks = 0;
  (activeBatches || []).forEach((batch: BatchRecord) => {
    const allocated = batchAllocations[batch.id] || 0;
    const projectedLoss = (batch.quantity_culled || 0) + (batch.mortality_count || 0);
    const incubationBase = batch.quantity_set ?? batch.accepted_eggs ?? batch.quantity_received ?? 0;
    const isReadyBatch = ['COMPLETED', 'BROODER'].includes(batch.status || '');
    const baseQuantity = isReadyBatch
      ? batch.quantity_hatched || 0
      : Math.max(0, incubationBase - projectedLoss);
    const available = Math.max(0, baseQuantity - allocated);

    projectedAvailableChicks += available;
    if (isReadyBatch) {
      readyNowChicks += available;
    }

    if (allocated > 0) {
      if (baseQuantity < allocated) {
        fulfillmentRisks++;
      }
    }
  });

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
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Estimated Revenue"
          value={formatCurrency(expectedRevenue)}
          helper="Expected order value"
          icon={Banknote}
          iconTone="blue"
        />
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
        <MetricCard
          label="Fulfillment Risks"
          value={fulfillmentRisks.toLocaleString()}
          helper="Allocated batches with deficit risk"
          icon={TriangleAlert}
          iconTone={fulfillmentRisks > 0 ? 'amber' : 'green'}
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
    <Card className="min-h-[138px] rounded-card border-border bg-card p-[18px] shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-[16px]',
            iconTone === 'blue' && 'bg-primary text-primary-foreground shadow-[0_14px_28px_rgba(37,99,235,0.24)]',
            iconTone === 'green' && 'bg-success/10 text-success',
            iconTone === 'amber' && 'bg-warning/10 text-warning',
            iconTone === 'red' && 'bg-destructive/10 text-destructive'
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">Live</span>
      </div>
      <div className="mt-5">
        <p className="text-[13px] font-semibold text-foreground">{label}</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground tabular-nums">{value}</p>
      </div>
      <div className="mt-4 border-t border-border pt-3 text-xs font-medium text-muted-foreground">{helper}</div>
    </Card>
  );
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
