import type { ComponentType } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Banknote, Clock, MapPin, Phone, Search, TrendingUp, UsersRound, Wallet } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { CreateCustomerDialog } from './components/create-customer-dialog'

export const metadata: Metadata = {
  title: 'Customers | Smart Hatchery OS',
  description: 'Customer relationship records and sales history.',
}

type CustomersPageProps = {
  searchParams?: Promise<{ q?: string }>
}

type CustomerRecord = any
type OrderRecord = any

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const supabase = await createClient()
  const db = supabase as any
  const params = searchParams ? await searchParams : {}
  const query = (params.q || '').trim()

  const { data: customers } = await db
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
      orders (
        id,
        order_number,
        status,
        payment_status,
        total_quantity,
        total_amount,
        amount_paid,
        balance_due,
        created_at,
        required_by_date
      )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const allCustomers = (customers || []).map(enrichCustomer)
  const normalizedQuery = query.toLowerCase()
  const displayCustomers = normalizedQuery
    ? allCustomers.filter((customer: CustomerRecord) =>
        [
          customer.name,
          customer.phone,
          customer.email,
          customer.address,
          customer.city,
          customer.country,
          customer.preferred_breed,
          customer.customer_status,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery))
      )
    : allCustomers

  const totalCustomers = allCustomers.length
  const repeatCustomers = allCustomers.filter((customer: CustomerRecord) => customer.orderCount > 1).length
  const totalRevenue = allCustomers.reduce((sum: number, customer: CustomerRecord) => sum + customer.totalRevenue, 0)
  const totalOutstanding = allCustomers.reduce((sum: number, customer: CustomerRecord) => sum + customer.outstandingBalance, 0)
  const followUpsDue = allCustomers.filter((customer: CustomerRecord) => customer.followUpDue).length

  return (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Customer Relationships</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Customer history, balances, preferences, and follow-up reminders.
          </p>
        </div>
        <CreateCustomerDialog />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Customers" value={totalCustomers.toLocaleString()} helper="Known buyers" icon={UsersRound} tone="blue" />
        <MetricCard label="Repeat Buyers" value={repeatCustomers.toLocaleString()} helper="More than one order" icon={TrendingUp} tone="green" />
        <MetricCard label="Lifetime Revenue" value={formatCurrency(totalRevenue)} helper="Expected order value" icon={Banknote} tone="blue" />
        <MetricCard label="Outstanding" value={formatCurrency(totalOutstanding)} helper="Customer debt" icon={Wallet} tone={totalOutstanding > 0 ? 'red' : 'green'} />
        <MetricCard label="Follow-ups Due" value={followUpsDue.toLocaleString()} helper="Needs attention" icon={Clock} tone={followUpsDue > 0 ? 'amber' : 'green'} />
      </div>

      <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-3 border-b border-border bg-muted/10 px-5 py-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">Customer Book</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {displayCustomers.length.toLocaleString()} shown{query ? ` for "${query}"` : ''}.
            </p>
          </div>
          <form action="/customers" className="relative w-full max-w-[420px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search customer, phone, location, breed..."
              className="h-9 w-full rounded-input border border-input bg-background px-3 pl-9 text-[13px] font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
            />
          </form>
        </div>

        {displayCustomers.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <UsersRound className="mx-auto mb-4 h-10 w-10 text-muted-foreground/40" />
            <h3 className="text-base font-semibold text-foreground">{query ? 'No matching customers' : 'No customers yet'}</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Customers are created automatically when orders are recorded.
            </p>
            {query ? (
              <Link href="/customers" className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">
                Clear search
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-border bg-muted/20 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Relationship</th>
                  <th className="px-5 py-3 font-semibold">Sales</th>
                  <th className="px-5 py-3 font-semibold">Balance</th>
                  <th className="px-5 py-3 font-semibold">Preference</th>
                  <th className="px-5 py-3 font-semibold">Follow-up</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {displayCustomers.map((customer: CustomerRecord) => (
                  <tr key={customer.id} className="group transition-colors hover:bg-muted/15">
                    <td className="px-5 py-3.5">
                      <Link href={`/customers/${customer.id}`} className="font-semibold text-foreground hover:text-primary hover:underline">
                        {customer.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {customer.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</span> : null}
                        {customer.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{customer.location}</span> : null}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={customer.customer_status || 'ACTIVE'} />
                      <div className="mt-1 text-xs text-muted-foreground">
                        {customer.orderCount > 1 ? 'Repeat buyer' : customer.orderCount === 1 ? 'First order recorded' : 'No orders yet'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold tabular-nums text-foreground">{formatCurrency(customer.totalRevenue)}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {customer.orderCount} orders / {customer.totalChicks.toLocaleString()} chicks
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className={cn('font-semibold tabular-nums', customer.outstandingBalance > 0 ? 'text-destructive' : 'text-success')}>
                        {formatCurrency(customer.outstandingBalance)}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Collected {formatCurrency(customer.collectedAmount)}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-foreground">{customer.preferred_breed || inferPreference(customer.orders)}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {formatLabel(customer.preferred_payment_method || 'Payment not set')}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className={cn('font-medium', customer.followUpDue ? 'text-warning' : 'text-foreground')}>
                        {customer.follow_up_at ? formatDateTime(customer.follow_up_at) : 'Not scheduled'}
                      </div>
                      <div className="mt-0.5 max-w-[220px] truncate text-xs text-muted-foreground">
                        {customer.follow_up_reason || 'No reminder note'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="inline-flex h-8 items-center justify-center rounded-button border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-sm hover:border-primary/40 hover:bg-muted"
                      >
                        Open Profile
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function enrichCustomer(customer: CustomerRecord) {
  const orders = Array.isArray(customer.orders) ? customer.orders : []
  const location = [customer.address, customer.city, customer.country].filter(Boolean).join(', ')
  const totalRevenue = orders.reduce((sum: number, order: OrderRecord) => sum + Number(order.total_amount || 0), 0)
  const collectedAmount = orders.reduce((sum: number, order: OrderRecord) => sum + Number(order.amount_paid || 0), 0)
  const outstandingBalance = orders.reduce((sum: number, order: OrderRecord) => sum + Number(order.balance_due || 0), 0)
  const totalChicks = orders.reduce((sum: number, order: OrderRecord) => sum + Number(order.total_quantity || 0), 0)
  const followUpAt = customer.follow_up_at ? new Date(customer.follow_up_at).getTime() : null

  return {
    ...customer,
    orders,
    location,
    orderCount: orders.length,
    totalRevenue,
    collectedAmount,
    outstandingBalance,
    totalChicks,
    followUpDue: Boolean(followUpAt && followUpAt <= Date.now()),
  }
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em]',
        status === 'ACTIVE' && 'border-success/20 bg-success/10 text-success',
        status === 'WATCHLIST' && 'border-warning/25 bg-warning/10 text-warning',
        status === 'INACTIVE' && 'border-border bg-muted text-muted-foreground'
      )}
    >
      {formatLabel(status)}
    </span>
  )
}

function inferPreference(orders: OrderRecord[]) {
  const recentNote = orders.find((order) => order.notes)?.notes
  return recentNote ? 'See order notes' : 'Not captured'
}

function formatCurrency(value: number) {
  return `KES ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleString()
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
}
