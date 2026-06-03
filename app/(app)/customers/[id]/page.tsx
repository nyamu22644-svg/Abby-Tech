import type { ComponentType } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  ShoppingCart,
  Truck,
  UserRound,
  Wallet,
} from 'lucide-react'

import { Card } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { EditCustomerDialog } from '../components/edit-customer-dialog'

export const metadata: Metadata = {
  title: 'Customer Profile | Smart Hatchery OS',
  description: 'Customer relationship, order, payment, and follow-up history.',
}

type CustomerRecord = any
type OrderRecord = any
type PaymentRecord = any
type DispatchRecord = any

export default async function CustomerDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const db = supabase as any

  const { data: customer } = await db
    .from('customers')
    .select(`
      id,
      name,
      email,
      phone,
      address,
      city,
      country,
      preferred_breed,
      preferred_payment_method,
      relationship_notes,
      follow_up_at,
      follow_up_reason,
      customer_status,
      created_at,
      updated_at,
      orders (
        id,
        order_number,
        status,
        payment_status,
        dispatch_status,
        total_quantity,
        subtotal_amount,
        discount_amount,
        total_amount,
        amount_paid,
        balance_due,
        required_by_date,
        notes,
        created_at,
        order_items (
          id,
          batch_id,
          quantity,
          unit_price,
          total_price,
          status,
          egg_batches (batch_number)
        )
      )
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!customer) {
    notFound()
  }

  const orders = Array.isArray(customer.orders)
    ? [...customer.orders].sort((a: OrderRecord, b: OrderRecord) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    : []
  const orderIds = orders.map((order: OrderRecord) => order.id)

  const [{ data: payments }, { data: dispatches }] = orderIds.length > 0
    ? await Promise.all([
        db
          .from('order_payments')
          .select('id, order_id, amount, payment_method, transaction_reference, paid_at, recorded_at')
          .in('order_id', orderIds)
          .order('recorded_at', { ascending: false }),
        db
          .from('order_dispatches')
          .select('id, order_id, carrier, driver_name, driver_phone, vehicle_number, handover_quantity, delivered_at, dispatched_at, notes')
          .in('order_id', orderIds)
          .order('created_at', { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }]

  const stats = buildCustomerStats(customer, orders, payments || [], dispatches || [])
  const latestOrder = orders[0]
  const whatsappMessage = buildCustomerMessage(customer, stats, latestOrder)

  return (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Link href="/customers" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Customers
        </Link>
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-[0.08em]">Customer ID:</span>{' '}
          <span className="font-mono">{customer.id}</span>
        </div>
      </div>

      <Card className="rounded-card border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{customer.name}</h1>
              <StatusBadge status={customer.customer_status || 'ACTIVE'} />
              {stats.repeatCustomer ? <MiniBadge tone="blue" label="Repeat buyer" /> : null}
              {stats.outstandingBalance > 0 ? <MiniBadge tone="red" label="Has balance" /> : null}
              {stats.followUpDue ? <MiniBadge tone="amber" label="Follow-up due" /> : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {customer.phone ? <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4" />{customer.phone}</span> : null}
              {customer.email ? <span className="inline-flex items-center gap-1.5"><Mail className="h-4 w-4" />{customer.email}</span> : null}
              {stats.location ? <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{stats.location}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {customer.phone ? (
              <a
                href={`https://wa.me/${normalizePhoneForWhatsApp(customer.phone)}?text=${encodeURIComponent(whatsappMessage)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center justify-center rounded-button border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-sm hover:border-primary/40 hover:bg-muted"
              >
                WhatsApp
              </a>
            ) : null}
            {customer.phone ? (
              <a
                href={`tel:${customer.phone}`}
                className="inline-flex h-8 items-center justify-center rounded-button border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-sm hover:border-primary/40 hover:bg-muted"
              >
                Call
              </a>
            ) : null}
            <EditCustomerDialog customer={customer} />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total Orders" value={stats.orderCount.toLocaleString()} helper="Bookings recorded" icon={ShoppingCart} tone="blue" />
        <MetricCard label="Chicks Sold" value={stats.totalChicks.toLocaleString()} helper={`${stats.completedChicks.toLocaleString()} taken`} icon={CheckCircle2} tone="green" />
        <MetricCard label="Revenue" value={formatCurrency(stats.totalRevenue)} helper="Expected value" icon={Banknote} tone="blue" />
        <MetricCard label="Outstanding" value={formatCurrency(stats.outstandingBalance)} helper="Unpaid balance" icon={Wallet} tone={stats.outstandingBalance > 0 ? 'red' : 'green'} />
        <MetricCard label="Last Order" value={latestOrder ? formatShortDate(latestOrder.created_at) : 'None'} helper={latestOrder?.order_number || 'No order history'} icon={Clock} tone="amber" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
            <div className="border-b border-border bg-muted/10 px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">Order History</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Bookings, payments, allocation, and sale status.</p>
            </div>
            {orders.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="No orders yet" text="Orders created for this customer will appear here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-border bg-muted/20 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Order</th>
                      <th className="px-5 py-3 font-semibold">Volume</th>
                      <th className="px-5 py-3 font-semibold">Amount</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">Payment</th>
                      <th className="px-5 py-3 font-semibold">Batch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {orders.map((order: OrderRecord) => {
                      const item = getOrderItems(order)[0]
                      const batch = getBatchNumber(item)
                      return (
                        <tr key={order.id} className="transition-colors hover:bg-muted/15">
                          <td className="px-5 py-3.5">
                            <Link href={`/orders/${order.id}`} className="font-mono text-[13px] font-semibold text-primary hover:underline">
                              {order.order_number}
                            </Link>
                            <div className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(order.created_at)}</div>
                          </td>
                          <td className="px-5 py-3.5 font-semibold tabular-nums text-foreground">
                            {Number(order.total_quantity || 0).toLocaleString()} chicks
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="font-semibold text-foreground">{formatCurrency(order.total_amount || 0)}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">Balance {formatCurrency(order.balance_due || 0)}</div>
                          </td>
                          <td className="px-5 py-3.5"><OrderStatusBadge status={order.status || ''} /></td>
                          <td className="px-5 py-3.5"><PaymentStatusBadge status={order.payment_status || ''} /></td>
                          <td className="px-5 py-3.5 text-sm text-muted-foreground">{batch || 'Not allocated'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <HistoryCard
              title="Payment History"
              icon={ReceiptText}
              emptyTitle="No payments recorded"
              rows={(payments || []).map((payment: PaymentRecord) => ({
                id: payment.id,
                title: formatCurrency(payment.amount || 0),
                meta: `${formatLabel(payment.payment_method || 'Other')} / ${payment.transaction_reference || 'No reference'}`,
                time: formatDateTime(payment.paid_at || payment.recorded_at),
              }))}
            />
            <HistoryCard
              title="Pickup / Delivery History"
              icon={Truck}
              emptyTitle="No handovers recorded"
              rows={(dispatches || []).map((dispatch: DispatchRecord) => ({
                id: dispatch.id,
                title: `${formatLabel(dispatch.carrier || 'Completed')} / ${Number(dispatch.handover_quantity || 0).toLocaleString()} chicks`,
                meta: [dispatch.driver_name, dispatch.driver_phone, dispatch.vehicle_number].filter(Boolean).join(' / ') || 'No contact details',
                time: formatDateTime(dispatch.delivered_at || dispatch.dispatched_at),
              }))}
            />
          </div>
        </div>

        <div className="space-y-4">
          <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
            <div className="border-b border-border bg-muted/10 px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">Relationship Assistant</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">What the system knows about this customer.</p>
            </div>
            <div className="space-y-4 p-5 text-sm">
              <InfoRow label="Preferred Breed" value={customer.preferred_breed || inferPreference(orders)} />
              <InfoRow label="Preferred Payment" value={formatLabel(customer.preferred_payment_method || stats.commonPaymentMethod || 'Not captured')} />
              <InfoRow label="Typical Quantity" value={stats.typicalQuantity ? `${stats.typicalQuantity.toLocaleString()} chicks` : 'Not enough history'} />
              <InfoRow label="Payment Reliability" value={stats.outstandingBalance > 0 ? 'Has unpaid balance' : stats.collectedAmount > 0 ? 'No unpaid balance' : 'No payment history'} />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Follow-up</p>
                <p className={cn('mt-1 font-medium', stats.followUpDue ? 'text-warning' : 'text-foreground')}>
                  {customer.follow_up_at ? formatDateTime(customer.follow_up_at) : 'Not scheduled'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{customer.follow_up_reason || 'No follow-up note'}</p>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
            <div className="border-b border-border bg-muted/10 px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">Notes</h2>
            </div>
            <div className="p-5">
              {customer.relationship_notes ? (
                <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{customer.relationship_notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No relationship notes yet.</p>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
            <div className="border-b border-border bg-muted/10 px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">Next Best Action</h2>
            </div>
            <div className="space-y-3 p-5 text-sm">
              {stats.outstandingBalance > 0 ? (
                <ActionHint tone="red" title="Collect balance" text={`${formatCurrency(stats.outstandingBalance)} is still unpaid.`} />
              ) : stats.followUpDue ? (
                <ActionHint tone="amber" title="Follow up today" text={customer.follow_up_reason || 'A reminder is due for this customer.'} />
              ) : latestOrder && latestOrder.status !== 'DELIVERED' && latestOrder.status !== 'CANCELLED' ? (
                <ActionHint tone="blue" title="Continue active order" text={`${latestOrder.order_number} still needs completion.`} />
              ) : (
                <ActionHint tone="green" title="Ready for next sale" text="No urgent customer action is pending." />
              )}
              <Link
                href="/orders"
                className="inline-flex h-8 w-full items-center justify-center rounded-button bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                Create or manage order
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function buildCustomerStats(customer: CustomerRecord, orders: OrderRecord[], payments: PaymentRecord[], dispatches: DispatchRecord[]) {
  const location = [customer.address, customer.city, customer.country].filter(Boolean).join(', ')
  const orderCount = orders.length
  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
  const collectedAmount = orders.reduce((sum, order) => sum + Number(order.amount_paid || 0), 0)
  const outstandingBalance = orders.reduce((sum, order) => sum + Number(order.balance_due || 0), 0)
  const totalChicks = orders.reduce((sum, order) => sum + Number(order.total_quantity || 0), 0)
  const completedChicks = orders.reduce((sum, order) => order.status === 'DELIVERED' ? sum + Number(order.total_quantity || 0) : sum, 0)
  const typicalQuantity = orderCount > 0 ? Math.round(totalChicks / orderCount) : 0
  const followUpAt = customer.follow_up_at ? new Date(customer.follow_up_at).getTime() : null
  const commonPaymentMethod = mostCommon(payments.map((payment) => payment.payment_method).filter(Boolean))

  return {
    location,
    orderCount,
    totalRevenue,
    collectedAmount,
    outstandingBalance,
    totalChicks,
    completedChicks,
    typicalQuantity,
    repeatCustomer: orderCount > 1,
    followUpDue: Boolean(followUpAt && followUpAt <= Date.now()),
    commonPaymentMethod,
    dispatchCount: dispatches.length,
  }
}

function buildCustomerMessage(customer: CustomerRecord, stats: ReturnType<typeof buildCustomerStats>, latestOrder?: OrderRecord) {
  if (stats.outstandingBalance > 0) {
    return `Hello ${customer.name}, this is Abbye Chicks. Your current outstanding balance is ${formatCurrency(stats.outstandingBalance)}. Kindly confirm payment when convenient.`
  }

  if (stats.followUpDue) {
    return `Hello ${customer.name}, this is Abbye Chicks following up: ${customer.follow_up_reason || 'we wanted to check in with you'}.`
  }

  if (latestOrder && !['DELIVERED', 'CANCELLED'].includes(latestOrder.status || '')) {
    return `Hello ${customer.name}, this is Abbye Chicks. Your order ${latestOrder.order_number} for ${Number(latestOrder.total_quantity || 0).toLocaleString()} chicks is currently ${formatLabel(latestOrder.status || 'in progress')}.`
  }

  return `Hello ${customer.name}, this is Abbye Chicks. Thank you for choosing us for premium day-old chicks.`
}

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  helper: string
  icon: ComponentType<{ className?: string }>
  tone: 'blue' | 'green' | 'amber' | 'red'
}) {
  return (
    <Card className="min-h-[138px] rounded-card border-border bg-card p-[18px] shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-[16px]',
            tone === 'blue' && 'bg-primary text-primary-foreground shadow-[0_14px_28px_rgba(37,99,235,0.24)]',
            tone === 'green' && 'bg-success/10 text-success',
            tone === 'amber' && 'bg-warning/10 text-warning',
            tone === 'red' && 'bg-destructive/10 text-destructive'
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
  )
}

function HistoryCard({
  title,
  icon: Icon,
  emptyTitle,
  rows,
}: {
  title: string
  icon: ComponentType<{ className?: string }>
  emptyTitle: string
  rows: { id: string; title: string; meta: string; time: string }[]
}) {
  return (
    <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
      <div className="border-b border-border bg-muted/10 px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </h2>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Icon} title={emptyTitle} text="Records will appear after order activity." compact />
      ) : (
        <div className="divide-y divide-border/70">
          {rows.slice(0, 6).map((row) => (
            <div key={row.id} className="px-5 py-3.5">
              <div className="font-semibold text-foreground">{row.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{row.meta}</div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">{row.time}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function EmptyState({
  icon: Icon,
  title,
  text,
  compact = false,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  text: string
  compact?: boolean
}) {
  return (
    <div className={compact ? 'px-5 py-8 text-center' : 'px-6 py-14 text-center'}>
      <Icon className="mx-auto mb-3 h-9 w-9 text-muted-foreground/40" />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{text}</p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-foreground">{value}</p>
    </div>
  )
}

function ActionHint({ tone, title, text }: { tone: 'blue' | 'green' | 'amber' | 'red'; title: string; text: string }) {
  return (
    <div
      className={cn(
        'rounded-button border p-3',
        tone === 'blue' && 'border-primary/20 bg-primary/5',
        tone === 'green' && 'border-success/20 bg-success/5',
        tone === 'amber' && 'border-warning/25 bg-warning/5',
        tone === 'red' && 'border-destructive/20 bg-destructive/5'
      )}
    >
      <div className="font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{text}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return <MiniBadge tone={status === 'WATCHLIST' ? 'amber' : status === 'INACTIVE' ? 'muted' : 'green'} label={formatLabel(status)} />
}

function MiniBadge({ tone, label }: { tone: 'blue' | 'green' | 'amber' | 'red' | 'muted'; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em]',
        tone === 'blue' && 'border-primary/20 bg-primary/10 text-primary',
        tone === 'green' && 'border-success/20 bg-success/10 text-success',
        tone === 'amber' && 'border-warning/25 bg-warning/10 text-warning',
        tone === 'red' && 'border-destructive/20 bg-destructive/10 text-destructive',
        tone === 'muted' && 'border-border bg-muted text-muted-foreground'
      )}
    >
      {label}
    </span>
  )
}

function OrderStatusBadge({ status }: { status: string }) {
  const label = status === 'DELIVERED' ? 'Completed' : status === 'READY_FOR_DISPATCH' ? 'Ready' : status === 'DISPATCHED' ? 'Out For Delivery' : formatLabel(status || 'Unset')
  return <MiniBadge tone={status === 'CANCELLED' ? 'red' : status === 'DELIVERED' ? 'green' : status === 'INQUIRY' ? 'muted' : 'blue'} label={label} />
}

function PaymentStatusBadge({ status }: { status: string }) {
  return <MiniBadge tone={status === 'PAID' ? 'green' : status === 'PARTIAL' ? 'amber' : 'red'} label={formatLabel(status || 'Unset')} />
}

function getOrderItems(order: OrderRecord) {
  return Array.isArray(order.order_items) ? order.order_items : []
}

function getBatchNumber(item: any) {
  if (!item?.egg_batches) return ''
  const batch = Array.isArray(item.egg_batches) ? item.egg_batches[0] : item.egg_batches
  return batch?.batch_number || ''
}

function inferPreference(orders: OrderRecord[]) {
  const recentNote = orders.find((order) => order.notes)?.notes
  return recentNote ? 'See order notes' : 'Not captured'
}

function mostCommon(values: string[]) {
  if (values.length === 0) return ''
  const counts = values.reduce((acc: Record<string, number>, value) => {
    acc[value] = (acc[value] || 0) + 1
    return acc
  }, {})
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
}

function normalizePhoneForWhatsApp(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) return `254${digits.slice(1)}`
  if (digits.startsWith('254')) return digits
  return digits
}

function formatCurrency(value: number) {
  return `KES ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function formatShortDate(value?: string | null) {
  if (!value) return 'None'
  return new Date(value).toLocaleDateString()
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleString()
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
}
