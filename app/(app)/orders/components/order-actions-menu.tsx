'use client'

import { useState } from 'react'
import { MoreVertical, Trash2, ArrowRight, Eye, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
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
}

export function OrderActionsMenu({ orderId }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleStatusUpdate(status: string) {
    if (loading) return
    setLoading(true)
    try {
      await updateOrderStatus(orderId, status)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (loading || !window.confirm('Are you sure you want to delete this order?')) return
    
    setLoading(true)
    try {
      await deleteOrder(orderId)
    } finally {
      setLoading(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" disabled={loading} />}>
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuItem 
          render={<Link href={`/orders/${orderId}`} className="cursor-pointer" />}
        >
          <Eye className="mr-2 h-4 w-4" />
          View Details
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleStatusUpdate('RESERVED')} disabled={loading}>
          <ArrowRight className="mr-2 h-4 w-4" />
          Mark as Reserved
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusUpdate('DEPOSIT_PAID')} disabled={loading}>
          <ArrowRight className="mr-2 h-4 w-4" />
          Log Deposit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusUpdate('READY_FOR_DISPATCH')} disabled={loading}>
          <ArrowRight className="mr-2 h-4 w-4" />
          Ready for Dispatch
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusUpdate('DISPATCHED')} disabled={loading}>
          <ArrowRight className="mr-2 h-4 w-4" />
          Mark Dispatched
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusUpdate('COMPLETED')} disabled={loading}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Complete Order
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleStatusUpdate('CANCELLED')} disabled={loading} className="text-destructive focus:text-destructive focus:bg-destructive/10">
          Cancel Order
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDelete} disabled={loading} className="text-destructive focus:text-destructive focus:bg-destructive/10">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
