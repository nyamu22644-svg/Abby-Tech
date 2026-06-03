'use client'

import Link from 'next/link'
import { PackageCheck, ReceiptText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CompleteHandoverDialog } from './complete-handover-dialog'
import { RecordPaymentDialog } from './record-payment-dialog'

export function OrderNextAction({
  orderId,
  customerName,
  balanceDue,
  paymentStatus,
  status,
  hasAllocatedBatch,
  remainingQuantity,
}: {
  orderId: string
  customerName: string
  balanceDue: number
  paymentStatus?: string | null
  status?: string | null
  hasAllocatedBatch: boolean
  remainingQuantity?: number
}) {
  const closed = ['DELIVERED', 'CANCELLED'].includes(status || '')

  if (closed) {
    return (
      <Button
        render={<Link href={`/orders/${orderId}`} />}
        variant="outline"
        className="h-8 gap-2 rounded-button px-3 text-xs font-semibold"
      >
        <ReceiptText className="h-4 w-4" />
        View Record
      </Button>
    )
  }

  if (balanceDue > 0) {
    return <RecordPaymentDialog orderId={orderId} balanceDue={balanceDue} />
  }

  if (paymentStatus === 'PAID' && hasAllocatedBatch) {
    return <CompleteHandoverDialog orderId={orderId} customerName={customerName} remainingQuantity={remainingQuantity} compact />
  }

  return (
    <Button
      render={<Link href={`/orders/${orderId}`} />}
      variant="outline"
      className="h-8 gap-2 rounded-button px-3 text-xs font-semibold"
    >
      <PackageCheck className="h-4 w-4" />
      Allocate Chicks
    </Button>
  )
}
