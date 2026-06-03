'use client'

import { useState } from 'react'
import { CheckCircle2, Printer, ReceiptText, Share2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

type ReceiptItem = {
  description?: string | null
  quantity?: number | null
  unit_price?: number | null
  total_price?: number | null
}

type ReceiptPayment = {
  amount?: number | null
  payment_method?: string | null
  transaction_reference?: string | null
  paid_at?: string | null
  recorded_at?: string | null
}

type ReceiptDispatch = {
  carrier?: string | null
  handover_quantity?: number | null
  driver_name?: string | null
  driver_phone?: string | null
  vehicle_number?: string | null
  delivered_at?: string | null
  dispatched_at?: string | null
  notes?: string | null
}

type ReceiptBranding = {
  business_name?: string | null
  receipt_title?: string | null
  receipt_tagline?: string | null
  receipt_phone?: string | null
  receipt_location?: string | null
  receipt_footer?: string | null
  receipt_show_system_branding?: boolean | null
} | null

export function OrderReceiptCard({
  orderNumber,
  customerName,
  customerPhone,
  customerLocation,
  orderDate,
  items,
  subtotalAmount,
  discountAmount,
  totalAmount,
  amountPaid,
  balanceDue,
  payments,
  dispatches,
  branding,
}: {
  orderNumber: string
  customerName: string
  customerPhone?: string | null
  customerLocation?: string | null
  orderDate?: string | null
  items: ReceiptItem[]
  subtotalAmount: number
  discountAmount: number
  totalAmount: number
  amountPaid: number
  balanceDue: number
  payments: ReceiptPayment[]
  dispatches: ReceiptDispatch[]
  branding?: ReceiptBranding
}) {
  const [copied, setCopied] = useState(false)
  const latestPayment = payments[0]
  const latestDispatch = dispatches[0]
  const receiptText = buildReceiptText({
    orderNumber,
    customerName,
    customerPhone,
    totalAmount,
    amountPaid,
    balanceDue,
    items,
    latestPayment,
    latestDispatch,
    branding,
  })

  function printReceipt() {
    const printable = window.open('', '_blank', 'width=720,height=900')
    if (!printable) return

    printable.document.write(buildReceiptHtml({
      orderNumber,
      customerName,
      customerPhone,
      customerLocation,
      orderDate,
      items,
      subtotalAmount,
      discountAmount,
      totalAmount,
      amountPaid,
      balanceDue,
      payments,
      dispatches,
      branding,
    }))
    printable.document.close()
    printable.focus()
    printable.print()
  }

  async function shareReceipt() {
    if (navigator.share) {
      await navigator.share({
        title: `Receipt ${orderNumber}`,
        text: receiptText,
      })
      return
    }

    await navigator.clipboard.writeText(receiptText)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <Card className="overflow-hidden rounded-card border-border bg-card shadow-[var(--shadow-card)]">
      <div className="border-b border-border bg-muted/10 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <ReceiptText className="h-4 w-4 text-primary" />
              Receipt & Invoice
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Print or share the customer sale record.</p>
          </div>
          {balanceDue === 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2 py-1 text-[11px] font-semibold text-success">
              <CheckCircle2 className="h-3 w-3" />
              Paid
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="rounded-button border border-border bg-background/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Invoice</p>
              <p className="mt-1 font-mono text-sm font-semibold text-primary">{orderNumber}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Balance</p>
              <p className={balanceDue > 0 ? 'mt-1 text-sm font-bold text-destructive' : 'mt-1 text-sm font-bold text-success'}>
                KES {balanceDue.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 text-sm">
            <ReceiptRow label="Customer" value={customerName} />
            <ReceiptRow label="Paid" value={`KES ${amountPaid.toLocaleString()}`} />
            <ReceiptRow label="Total" value={`KES ${totalAmount.toLocaleString()}`} />
            <ReceiptRow label="Method" value={formatLabel(latestPayment?.payment_method || 'Not recorded')} />
            <ReceiptRow
              label="Handover"
              value={latestDispatch ? `${formatLabel(latestDispatch.carrier || 'Completed')} / ${Number(latestDispatch.handover_quantity || 0).toLocaleString()} chicks` : 'Not completed'}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={printReceipt} className="gap-2">
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button type="button" variant="outline" onClick={shareReceipt} className="gap-2">
            <Share2 className="h-4 w-4" />
            {copied ? 'Copied' : 'Share'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-foreground">{value}</span>
    </div>
  )
}

function buildReceiptText({
  orderNumber,
  customerName,
    customerPhone,
    totalAmount,
    amountPaid,
    balanceDue,
    items,
    latestPayment,
    latestDispatch,
    branding,
}: {
  orderNumber: string
  customerName: string
  customerPhone?: string | null
  totalAmount: number
  amountPaid: number
  balanceDue: number
  items: ReceiptItem[]
  latestPayment?: ReceiptPayment
  latestDispatch?: ReceiptDispatch
  branding?: ReceiptBranding
}) {
  const brand = getReceiptBrand(branding)
  return [
    `${brand.title} Receipt`,
    brand.tagline,
    `Invoice: ${orderNumber}`,
    `Customer: ${customerName}`,
    customerPhone ? `Phone: ${customerPhone}` : null,
    ...items.map((item) => `${item.description || 'Day-old chicks'} x ${Number(item.quantity || 0).toLocaleString()}`),
    `Total: KES ${totalAmount.toLocaleString()}`,
    `Paid: KES ${amountPaid.toLocaleString()}`,
    `Balance: KES ${balanceDue.toLocaleString()}`,
    latestPayment?.payment_method ? `Payment: ${formatLabel(latestPayment.payment_method)}` : null,
    latestPayment?.transaction_reference ? `Reference: ${latestPayment.transaction_reference}` : null,
    latestDispatch ? `Handover: ${formatLabel(latestDispatch.carrier || 'Completed')} / ${Number(latestDispatch.handover_quantity || 0).toLocaleString()} chicks` : null,
    brand.phone ? `Contact: ${brand.phone}` : null,
    brand.location ? `Location: ${brand.location}` : null,
    brand.footer,
  ].filter(Boolean).join('\n')
}

function buildReceiptHtml({
  orderNumber,
  customerName,
  customerPhone,
  customerLocation,
  orderDate,
  items,
  subtotalAmount,
  discountAmount,
  totalAmount,
  amountPaid,
  balanceDue,
  payments,
  dispatches,
  branding,
}: {
  orderNumber: string
  customerName: string
  customerPhone?: string | null
  customerLocation?: string | null
  orderDate?: string | null
  items: ReceiptItem[]
  subtotalAmount: number
  discountAmount: number
  totalAmount: number
  amountPaid: number
  balanceDue: number
  payments: ReceiptPayment[]
  dispatches: ReceiptDispatch[]
  branding?: ReceiptBranding
}) {
  const brand = getReceiptBrand(branding)
  const rows = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.description || 'Day-old chicks')}</td>
      <td>${Number(item.quantity || 0).toLocaleString()}</td>
      <td>KES ${Number(item.unit_price || 0).toLocaleString()}</td>
      <td>KES ${Number(item.total_price || 0).toLocaleString()}</td>
    </tr>
  `).join('')
  const paymentRows = payments.map((payment) => `
    <tr>
      <td>${formatDateTime(payment.paid_at || payment.recorded_at)}</td>
      <td>${formatLabel(payment.payment_method || 'Other')}</td>
      <td>${escapeHtml(payment.transaction_reference || '-')}</td>
      <td>KES ${Number(payment.amount || 0).toLocaleString()}</td>
    </tr>
  `).join('')
  const latestDispatch = dispatches[0]
  const systemBranding = brand.showSystemBranding
    ? '<div class="muted">Powered by Smart Hatchery OS</div>'
    : ''

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt ${escapeHtml(orderNumber)}</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; margin: 32px; color: #0f172a; }
          .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #2563eb; padding-bottom: 18px; }
          h1 { margin: 0; font-size: 24px; }
          .muted { color: #64748b; font-size: 12px; }
          .section { margin-top: 22px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 8px; text-align: left; font-size: 13px; }
          th { color: #64748b; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; }
          .totals { margin-left: auto; width: 280px; }
          .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
          .total { font-weight: 800; font-size: 18px; border-top: 1px solid #e2e8f0; margin-top: 6px; padding-top: 10px !important; }
          .paid { color: #16a34a; font-weight: 700; }
          .due { color: #dc2626; font-weight: 700; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="muted">${systemBranding ? 'SMART HATCHERY OPERATIONS' : 'POULTRY OPERATIONS'}</div>
            <h1>Receipt / Invoice</h1>
            <div><strong>${escapeHtml(brand.title)}</strong></div>
            <div class="muted">${escapeHtml(brand.tagline || '')}</div>
            ${systemBranding}
          </div>
          <div>
            <div><strong>${escapeHtml(orderNumber)}</strong></div>
            <div class="muted">${formatDateTime(orderDate)}</div>
            <div class="muted">${escapeHtml([brand.phone, brand.location].filter(Boolean).join(' / '))}</div>
          </div>
        </div>
        <div class="section">
          <strong>Customer</strong>
          <div>${escapeHtml(customerName)}</div>
          <div class="muted">${escapeHtml([customerPhone, customerLocation].filter(Boolean).join(' / ') || 'No contact details')}</div>
        </div>
        <div class="section">
          <strong>Items</strong>
          <table>
            <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="section totals">
          <div><span>Subtotal</span><strong>KES ${subtotalAmount.toLocaleString()}</strong></div>
          <div><span>Discount</span><strong>KES ${discountAmount.toLocaleString()}</strong></div>
          <div class="total"><span>Total</span><span>KES ${totalAmount.toLocaleString()}</span></div>
          <div class="paid"><span>Paid</span><span>KES ${amountPaid.toLocaleString()}</span></div>
          <div class="due"><span>Balance</span><span>KES ${balanceDue.toLocaleString()}</span></div>
        </div>
        <div class="section">
          <strong>Payments</strong>
          <table>
            <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead>
            <tbody>${paymentRows || '<tr><td colspan="4">No payments recorded.</td></tr>'}</tbody>
          </table>
        </div>
        <div class="section">
          <strong>Pickup / Delivery</strong>
          <div>${latestDispatch ? `${formatLabel(latestDispatch.carrier || 'Completed')} / ${Number(latestDispatch.handover_quantity || 0).toLocaleString()} chicks` : 'Not completed'}</div>
          <div class="muted">${latestDispatch ? escapeHtml([latestDispatch.driver_name, latestDispatch.driver_phone, latestDispatch.vehicle_number].filter(Boolean).join(' / ')) : ''}</div>
          <div class="muted">${latestDispatch ? formatDateTime(latestDispatch.delivered_at || latestDispatch.dispatched_at) : ''}</div>
        </div>
        ${brand.footer ? `<div class="section muted">${escapeHtml(brand.footer)}</div>` : ''}
      </body>
    </html>
  `
}

function getReceiptBrand(branding?: ReceiptBranding) {
  return {
    title: branding?.receipt_title || branding?.business_name || 'Abbye Chicks',
    tagline: branding?.receipt_tagline || 'Premium poultry operations',
    phone: branding?.receipt_phone || '',
    location: branding?.receipt_location || '',
    footer: branding?.receipt_footer || '',
    showSystemBranding: branding?.receipt_show_system_branding !== false,
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleString()
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
}
