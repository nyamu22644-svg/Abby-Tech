'use client'

import { useState } from 'react'
import { MoreVertical, Trash2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { updateBatchStatus, deleteBatch } from '../actions'
import { toast } from 'sonner'
import type { Database } from '@/types/database.types'

export function BatchActionsMenu({ batchId }: { batchId: string }) {
  const [loading, setLoading] = useState(false)

  async function handleStatusUpdate(newStatus: Database['public']['Tables']['egg_batches']['Row']['status']) {
    setLoading(true)
    try {
      const result = await updateBatchStatus(batchId, newStatus)
      if (result.success) {
        toast.success(`Batch status updated to ${newStatus}`)
      } else {
        toast.error(result.error || 'Failed to update status')
      }
    } catch (error) {
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this batch? This action cannot be undone.')) return
    
    setLoading(true)
    try {
      const result = await deleteBatch(batchId)
      if (result.success) {
        toast.success('Batch deleted successfully')
      } else {
        toast.error(result.error || 'Failed to delete batch')
      }
    } catch (error) {
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" disabled={loading} />}>
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]">
        <DropdownMenuItem onClick={() => handleStatusUpdate('EARLY_INCUBATION')} disabled={loading}>
          <ArrowRight className="mr-2 h-4 w-4" />
          Assign to Incubator
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusUpdate('CANDLING')} disabled={loading}>
          <ArrowRight className="mr-2 h-4 w-4" />
          Mark for Candling
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusUpdate('LOCKDOWN')} disabled={loading}>
          <ArrowRight className="mr-2 h-4 w-4" />
          Transfer to Lockdown
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusUpdate('HATCHING')} disabled={loading}>
          <ArrowRight className="mr-2 h-4 w-4" />
          Hatching Started
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusUpdate('COMPLETED')} disabled={loading}>
          <ArrowRight className="mr-2 h-4 w-4" />
          Mark Completed
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusUpdate('DISCARDED')} disabled={loading} className="text-red-600 focus:text-red-600">
          Discard Batch
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDelete} disabled={loading} className="text-red-600 focus:text-red-600 focus:bg-red-50">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
