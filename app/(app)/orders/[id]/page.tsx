import { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit3, Package, CreditCard, Truck, User } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { cn } from '@/lib/utils';
import { OrderActionsMenu } from '../components/order-actions-menu';

import { RecordPaymentDialog } from '../components/record-payment-dialog';

import { AllocateBatchDialog } from '../components/allocate-batch-dialog';

export const metadata: Metadata = {
  title: 'Order Details | Smart Hatchery OS',
  description: 'Detailed operational view of a chick order.',
};

export default async function OrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: order } = await supabase
    .from('orders')
    .select(`
      *,
      customers (
        name,
        phone,
        location,
        business_name,
        is_repeat_customer
      ),
      allocated_batch:egg_batches!orders_allocated_batch_id_fkey(
        batch_number
      )
    `)
    .eq('id', id)
    .single();

  if (!order) {
    notFound();
  }

  const { data: auditLogs } = await supabase
    .from('order_audit_logs')
    .select('*')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false });

  // Get available generic batches
  const { data: batches } = await supabase
    .from('egg_batches')
    .select('id, batch_number, quantity_hatched, quantity_received, quantity_culled, mortality_count, status')
    .not('status', 'eq', 'DISCARDED')
    .not('status', 'eq', 'ARCHIVED');

  const { data: allocations } = await supabase
    .from('orders')
    .select('allocated_batch_id, quantity')
    .not('allocated_batch_id', 'is', null);

  const batchAllocations = (allocations || []).reduce((acc: any, curr) => {
    if (curr.allocated_batch_id) {
      acc[curr.allocated_batch_id] = (acc[curr.allocated_batch_id] || 0) + curr.quantity;
    }
    return acc;
  }, {});

  const availableBatches = (batches || []).map(b => {
    const projectedLoss = (b.quantity_culled || 0) + (b.mortality_count || 0)
    const baseQuantity = ['COMPLETED', 'SOLD', 'STORED'].includes(b.status) ? (b.quantity_hatched || 0) : ((b.quantity_received || 0) - projectedLoss)
    return {
      id: b.id,
      batch_number: b.batch_number,
      status: b.status,
      baseQuantity,
      allocated_count: batchAllocations[b.id] || 0
    }
  }).filter(b => b.baseQuantity - b.allocated_count > 0);

  const quantity = order.quantity || 0;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200 pb-10">
      
      {/* Top Banner Navigation */}
      <div className="flex items-center justify-between mb-2">
        <Link href="/orders" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group">
          <ArrowLeft className="w-4 h-4 mr-1 transition-transform group-hover:-translate-x-1" />
          Back to Orders
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Order ID:</span>
          <span className="font-mono text-xs text-muted-foreground select-all">{order.id}</span>
        </div>
      </div>

      {/* Header Profile */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-primary font-mono">{order.order_number}</h1>
            <OrderStatusBadge status={order.status || ''} />
            <PaymentStatusBadge status={order.payment_status || ''} />
          </div>
          <p className="text-sm text-muted-foreground mt-1.5 tracking-tight flex items-center gap-2">
            Customer: <span className="font-medium text-foreground">{order.customer_name}</span> • 
            Created <span className="text-foreground">{new Date(order.created_at).toLocaleDateString()}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 h-9 px-4 rounded-md font-medium text-secondary-foreground border-border bg-card hover:bg-muted/50 shadow-sm">
            <Edit3 className="h-4 w-4" />
            Edit Metadata
          </Button>
          <OrderActionsMenu orderId={order.id} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Main Stage & Timeline Panel */}
        <div className="md:col-span-3 space-y-6">
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 border-border shadow-sm bg-card">
              <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase">Reserved Volume</div>
              <div className="text-2xl font-bold text-primary tabular-nums flex items-end gap-2">
                {quantity.toLocaleString()} <span className="text-sm font-medium text-muted-foreground mb-1">chicks</span>
              </div>
            </Card>
            <Card className="p-4 border-border shadow-sm bg-card">
              <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase">Allocated Batch</div>
              {order.allocated_batch_id ? (
                <div className="text-2xl font-bold text-primary tabular-nums font-mono mt-1">
                  {(order as any).allocated_batch?.batch_number || order.allocated_batch_id}
                </div>
              ) : (
                <div className="mt-2 text-center text-xs text-muted-foreground">
                   <div className="mb-2 italic text-left">PENDING ALLOCATION</div>
                   <AllocateBatchDialog orderId={order.id} orderQuantity={quantity} availableBatches={availableBatches} />
                </div>
              )}
            </Card>
            <Card className="p-4 border-border shadow-sm bg-card">
              <div className="text-xs font-semibold tracking-tight text-muted-foreground mb-1 uppercase">Outstanding Balance</div>
              <div className="text-2xl font-bold text-primary tabular-nums">
                KES {order.balance_due ? order.balance_due.toLocaleString() : '0'}
              </div>
            </Card>
          </div>

          {order.notes && (
            <Card className="p-4 border-border shadow-sm bg-muted/30 border-dashed">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Order Notes & Requirements</h4>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{order.notes}</p>
            </Card>
          )}

          {/* Operational Workflow Map */}
          <Card className="border-border shadow-sm bg-card">
            <div className="p-5 border-b border-border bg-muted/10">
              <h3 className="font-medium tracking-tight text-primary">Fulfillment Lifecycle</h3>
            </div>
            <div className="p-6 relative">
              <div className="absolute left-10 top-6 bottom-6 w-0.5 bg-border z-0"></div>
              
              <div className="space-y-8 relative z-10">
                <TimelineEvent 
                  icon={<User className="w-5 h-5 text-primary" />}
                  title="Reservation Confirmed"
                  date={new Date(order.created_at).toLocaleDateString()}
                  description="Customer request received and logged in the system."
                  status="completed"
                />
                <TimelineEvent 
                  icon={<CreditCard className="w-5 h-5 text-primary" />}
                  title="Deposit Logged"
                  date="Pending"
                  description="Initial payment recorded to secure the order."
                  status={['DEPOSIT_PAID', 'FULLY_PAID'].includes(order.payment_status || '') ? 'completed' : 'pending'}
                />
                <TimelineEvent 
                  icon={<Package className="w-5 h-5 text-primary" />}
                  title="Batch Allocation"
                  date="Pending"
                  description="Chicks allocated from a completed hatch batch."
                  status={['ALLOCATED', 'READY_FOR_DISPATCH', 'DISPATCHED', 'COMPLETED'].includes(order.status || '') ? 'completed' : (order.status === 'DEPOSIT_PAID' ? 'active' : 'pending')}
                />
                <TimelineEvent 
                  icon={<Truck className="w-5 h-5 text-primary" />}
                  title="Dispatch / Pickup"
                  date={order.pickup_date || 'Pending Scheduling'}
                  description="Order dispatched to logistics or picked up by customer."
                  status={['DISPATCHED', 'COMPLETED'].includes(order.status || '') ? 'completed' : (order.status === 'READY_FOR_DISPATCH' ? 'active' : 'pending')}
                  isLast
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Action & Linked Data Sidebar */}
        <div className="md:col-span-1 space-y-6">
          <Card className="border-border shadow-sm bg-card">
            <div className="p-4 border-b border-border bg-muted/10">
              <h3 className="font-medium tracking-tight text-primary text-sm">Customer Profile</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Name</p>
                <p className="font-medium text-sm text-foreground">{order.customer_name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Contact</p>
                <p className="font-medium text-sm text-foreground">{order.customer_phone || 'None provided'}</p>
              </div>
              {order.customers && (order.customers as any).location && (
                <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Location</p>
                    <p className="font-medium text-sm text-foreground">{(order.customers as any).location}</p>
                </div>
              )}
              {order.customers && (order.customers as any).business_name && (
                <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Business</p>
                    <p className="font-medium text-sm text-foreground">{(order.customers as any).business_name}</p>
                </div>
              )}
              <div className="pt-2 border-t border-border">
                <Button variant="ghost" className="w-full text-xs h-8 text-muted-foreground hover:text-foreground">View Customer History</Button>
              </div>
            </div>
          </Card>

          {order.balance_due && order.balance_due > 0 ? (
            <Card className="border-border shadow-sm bg-card">
              <div className="p-4 border-b border-border bg-muted/10">
                <h3 className="font-medium tracking-tight text-primary text-sm">Financial Actions</h3>
              </div>
              <div className="p-4 text-center">
                <RecordPaymentDialog orderId={order.id} balanceDue={order.balance_due} />
              </div>
            </Card>
          ) : null}

          <Card className="border-border shadow-sm bg-card">
            <div className="p-4 border-b border-border bg-muted/10">
              <h3 className="font-medium tracking-tight text-primary text-sm">Action Logs</h3>
            </div>
            <div className="p-4">
              {auditLogs && auditLogs.length > 0 ? (
                <div className="space-y-4">
                  {auditLogs.map((log: any) => (
                    <div key={log.id} className="text-xs border-l-2 border-border pl-3 mt-4 first:mt-0">
                      <p className="font-medium text-foreground">{log.action.replace(/_/g, ' ')}</p>
                      <p className="text-muted-foreground mt-0.5">{log.description}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{new Date(log.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground font-medium text-center">No manual actions logged recently.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
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
      "inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-semibold tracking-wide uppercase border",
      status === 'UNPAID' && "bg-destructive/10 text-destructive border-destructive/20",
      status === 'DEPOSIT_PAID' && "bg-status-setter text-status-setter-text border-status-setter/50",
      status === 'FULLY_PAID' && "bg-success/10 text-success border-success/20",
      status === 'REFUNDED' && "bg-muted text-muted-foreground border-border",
      !['UNPAID', 'DEPOSIT_PAID', 'FULLY_PAID', 'REFUNDED'].includes(status) && "bg-muted text-muted-foreground border-border"
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
