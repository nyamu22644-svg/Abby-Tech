import { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { ShoppingCart, Download, CheckCircle, Package, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { CreateOrderDialog } from './components/create-order-dialog';
import { OrderActionsMenu } from './components/order-actions-menu';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Orders | Smart Hatchery OS',
  description: 'Manage customer chick orders and dispatch.',
};

export default async function OrdersPage() {
  const supabase = await createClient();

  // Explicit type safety is tricky here without generating the updated types,
  // but we can query safely.
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  const displayOrders = orders || [];

  const totalOrders = displayOrders.length;
  const pendingDispatches = displayOrders.filter(o => o.status === 'READY_FOR_DISPATCH' || o.dispatch_status === 'PENDING').length;
  const reservedChicks = displayOrders.reduce((acc, o) => {
    if (['RESERVED', 'DEPOSIT_PAID', 'ALLOCATED', 'READY_FOR_DISPATCH'].includes(o.status || '')) {
      return acc + (o.quantity || 0);
    }
    return acc;
  }, 0);

  const expectedRevenue = displayOrders.reduce((acc, o) => acc + (o.total_amount || 0), 0);
  const totalBalanceDue = displayOrders.reduce((acc, o) => acc + (o.balance_due || 0), 0);

  const chicksSold = displayOrders.reduce((acc, o) => {
    if (['COMPLETED', 'DISPATCHED'].includes(o.status || '')) {
      return acc + (o.quantity || 0);
    }
    return acc;
  }, 0);

  // Additional stats for the commercial dashboard
  const { data: customers } = await supabase
    .from('customers')
    .select('name, business_name');

  const topCustomers = (customers || []).length; // Placeholder for actual top customers logic if needed
  
  const { data: activeBatches } = await supabase
    .from('egg_batches')
    .select('id, batch_number, quantity_received, quantity_hatched, quantity_culled, mortality_count, status')
    .not('status', 'eq', 'SOLD')
    .not('status', 'eq', 'DISCARDED')
    .not('status', 'eq', 'ARCHIVED');

  const batchAllocations = displayOrders.reduce((acc: any, curr) => {
    if (curr.allocated_batch_id) {
      acc[curr.allocated_batch_id] = (acc[curr.allocated_batch_id] || 0) + curr.quantity;
    }
    return acc;
  }, {});

  let fulfillmentRisks = 0;
  (activeBatches || []).forEach(b => {
    const allocated = batchAllocations[b.id] || 0;
    if (allocated > 0) {
      const projectedLoss = (b.quantity_culled || 0) + (b.mortality_count || 0);
      const baseQuantity = b.status === 'COMPLETED' ? (b.quantity_hatched || 0) : ((b.quantity_received || 0) - projectedLoss);
      if (baseQuantity < allocated) {
        fulfillmentRisks++;
      }
    }
  });

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Orders & Fulfillment</h1>
          <p className="text-sm text-muted-foreground mt-1 tracking-tight">
            Manage commercial chick sales, reservations, and customer logistics.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2 h-9 px-4 rounded-md font-medium text-secondary-foreground border-border bg-card hover:bg-muted/50 shadow-sm">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <CreateOrderDialog />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-4 border-border shadow-sm flex flex-col justify-between bg-card">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium tracking-tight text-muted-foreground">Est. Total Revenue</div>
            <ShoppingCart className="w-4 h-4 text-primary" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <div className="text-2xl font-semibold text-primary tabular-nums">KES {expectedRevenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Expected overall</div>
        </Card>
        
        <Card className="p-4 border-border shadow-sm flex flex-col justify-between bg-card">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium tracking-tight text-muted-foreground">Outstanding Balances</div>
            <ShoppingCart className="w-4 h-4 text-destructive" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <div className="text-2xl font-semibold text-destructive tabular-nums">KES {totalBalanceDue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Pending payments</div>
        </Card>

        <Card className="p-4 border-border shadow-sm flex flex-col justify-between bg-card">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium tracking-tight text-muted-foreground">Reserved Chicks</div>
            <Package className="w-4 h-4 text-primary/70" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <div className="text-2xl font-semibold text-foreground tabular-nums">{reservedChicks.toLocaleString()}</div>
            <div className="text-sm font-medium text-muted-foreground">pending</div>
          </div>
          <div className="text-xs text-muted-foreground mt-1">{chicksSold.toLocaleString()} already completed</div>
        </Card>

        <Card className="p-4 border-border shadow-sm flex flex-col justify-between bg-card">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium tracking-tight text-muted-foreground">Upcoming Pickups</div>
            <CheckCircle className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <div className="text-2xl font-semibold text-foreground tabular-nums">{pendingDispatches}</div>
            <div className="text-sm font-medium text-muted-foreground">ready</div>
          </div>
          <div className="text-xs text-muted-foreground mt-1">{totalOrders} total orders</div>
        </Card>

        <Card className={cn("p-4 border-border shadow-sm flex flex-col justify-between", fulfillmentRisks > 0 ? "bg-destructive/5 border-destructive/20" : "bg-card")}>
          <div className="flex items-center justify-between mb-2">
            <div className={cn("text-sm font-medium tracking-tight", fulfillmentRisks > 0 ? "text-destructive" : "text-muted-foreground")}>Fulfillment Risks</div>
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <div className={cn("text-2xl font-semibold tabular-nums", fulfillmentRisks > 0 ? "text-destructive" : "text-foreground")}>{fulfillmentRisks}</div>
            <div className="text-sm font-medium text-muted-foreground">batches</div>
          </div>
          <div className="text-xs text-muted-foreground mt-1">With deficit inventory</div>
        </Card>
      </div>

      <Card className="border-border shadow-sm rounded-lg overflow-hidden bg-card flex flex-col">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Filter by order number or customer..."
              className="w-full h-9 bg-muted/30 border border-border rounded-md pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
            />
          </div>
        </div>

        {displayOrders.length === 0 ? (
          <div className="p-16 text-center max-w-sm mx-auto">
            <ShoppingCart className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-primary tracking-tight mb-2">No Active Orders</h3>
            <p className="text-sm text-muted-foreground">
              Customer order tracking and dispatch workflows will appear here once orders are created.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-xs text-muted-foreground bg-muted/30 uppercase font-semibold tracking-wider border-b border-border">
                <tr>
                  <th className="px-6 py-4">Order ID</th>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Volume</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Payment</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {displayOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-muted/10 transition-colors group">
                    <td className="px-6 py-4 font-mono font-medium text-primary">
                      <Link href={`/orders/${order.id}`} className="hover:underline">
                        {order.order_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 font-medium text-foreground">
                      {order.customer_name}
                      {order.customer_phone && <div className="text-xs text-muted-foreground font-normal mt-0.5">{order.customer_phone}</div>}
                    </td>
                    <td className="px-6 py-4 text-primary font-medium">
                      {(order.quantity || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <OrderStatusBadge status={order.status || ''} />
                    </td>
                    <td className="px-6 py-4">
                      <PaymentStatusBadge status={order.payment_status || ''} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end relative">
                        <OrderActionsMenu orderId={order.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-semibold tracking-wide uppercase border",
      status === 'INQUIRY' && "bg-muted text-muted-foreground border-border",
      status === 'RESERVED' && "bg-primary/10 text-primary border-primary/20",
      status === 'ALLOCATED' && "bg-primary/10 text-primary border-primary/20",
      status === 'READY_FOR_DISPATCH' && "bg-status-hatcher text-status-hatcher-text border-status-hatcher/50",
      status === 'DISPATCHED' && "bg-success/10 text-success border-success/20",
      status === 'COMPLETED' && "bg-success/10 text-success border-success/20",
      status === 'CANCELLED' && "bg-destructive/10 text-destructive border-destructive/20",
      !['INQUIRY', 'RESERVED', 'ALLOCATED', 'READY_FOR_DISPATCH', 'DISPATCHED', 'COMPLETED', 'CANCELLED'].includes(status) && "bg-muted text-muted-foreground border-border"
    )}>
      {status}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium tracking-wide uppercase border",
      status === 'UNPAID' && "bg-destructive/5 text-destructive border-destructive/20",
      status === 'DEPOSIT_PAID' && "bg-status-setter text-status-setter-text border-status-setter/50",
      status === 'FULLY_PAID' && "bg-success/10 text-success border-success/20",
      status === 'REFUNDED' && "bg-muted text-muted-foreground border-border",
      !['UNPAID', 'DEPOSIT_PAID', 'FULLY_PAID', 'REFUNDED'].includes(status) && "bg-muted text-muted-foreground border-border"
    )}>
      {status}
    </span>
  );
}
