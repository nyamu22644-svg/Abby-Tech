'use client'

import { useState } from 'react'
import { MoreVertical, Trash2, Eye, Ban } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useSubmitLock } from '@/hooks/use-submit-lock'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { updateOrderStatus, deleteOrder } from '../actions'

interface Props {
  orderId: string;
  status?: string | null;
  paymentStatus?: string | null;
  hasAllocatedBatch?: boolean;
}

export function OrderActionsMenu({ orderId, status = 'INQUIRY', paymentStatus = 'PENDING', hasAllocatedBatch = false }: Props) {
  const [loading, setLoading] = useState(false)
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()
  const currentStatus = status || 'INQUIRY'
  const canCancel = !['DELIVERED', 'CANCELLED'].includes(currentStatus)
  const canDelete = currentStatus === 'CANCELLED'

  void paymentStatus
  void hasAllocatedBatch

  async function handleStatusUpdate(status: string) {
    if (!acquireSubmitLock()) return
    setLoading(true)
    try {
      await updateOrderStatus(orderId, status)
    } finally {
      releaseSubmitLock()
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Are you sure you want to delete this order?')) return
    if (!acquireSubmitLock()) return
    
    setLoading(true)
    try {
      await deleteOrder(orderId)
    } finally {
      releaseSubmitLock()
      setLoading(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground transition-colors hover:text-foreground" disabled={loading} />}>
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px] rounded-card border-border bg-popover shadow-[var(--shadow-elevated)]">
        <DropdownMenuItem 
          render={<Link href={`/orders/${orderId}`} className="cursor-pointer" />}
        >
          <Eye className="mr-2 h-4 w-4" />
          View Details
        </DropdownMenuItem>
        {(canCancel || canDelete) ? <DropdownMenuSeparator /> : null}
        {canCancel ? (
          <DropdownMenuItem onClick={() => handleStatusUpdate('CANCELLED')} disabled={loading} className="text-destructive focus:text-destructive focus:bg-destructive/10">
            <Ban className="mr-2 h-4 w-4" />
            Cancel Order
          </DropdownMenuItem>
        ) : null}
        {canDelete ? (
          <DropdownMenuItem onClick={handleDelete} disabled={loading} className="text-destructive focus:text-destructive focus:bg-destructive/10">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Cancelled Order
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
