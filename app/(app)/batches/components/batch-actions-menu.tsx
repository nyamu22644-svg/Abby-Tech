'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { MoreVertical, Trash2, ArrowRight, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { updateBatchStatus, deleteBatch, hardDeleteBatch } from '../actions'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Database } from '@/types/database.types'

export function BatchActionsMenu({ batchId, onDelete }: { batchId: string; onDelete?: () => void }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)

  // Check whether a user is logged in (authenticated) — server still enforces SUPER_ADMIN for the action
  useEffect(() => {
    let mounted = true
    async function checkAuth() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!mounted) return
        setIsAuthenticated(!!user)
      } catch (err) {
        console.warn('Failed to check auth status:', err)
      } finally {
        if (mounted) setCheckingAuth(false)
      }
    }
    checkAuth()
    return () => { mounted = false }
  }, [])

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
        onDelete?.()
        router.refresh()
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
        <DropdownMenuItem asChild>
          <Link href={`/batches/${batchId}`} className="flex items-center">
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleStatusUpdate('SETTER')} disabled={loading}>
          <ArrowRight className="mr-2 h-4 w-4" />
          Assign to Setter
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusUpdate('HATCHER')} disabled={loading}>
          <ArrowRight className="mr-2 h-4 w-4" />
          Transfer to Hatcher
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusUpdate('BROODER')} disabled={loading}>
          <ArrowRight className="mr-2 h-4 w-4" />
          Move to Brooder
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusUpdate('COMPLETED')} disabled={loading}>
          <ArrowRight className="mr-2 h-4 w-4" />
          Mark Completed
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusUpdate('FAILED')} disabled={loading} className="text-red-600 focus:text-red-600">
          <ArrowRight className="mr-2 h-4 w-4" />
          Mark Failed
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusUpdate('DISCARDED')} disabled={loading} className="text-red-600 focus:text-red-600">
          <ArrowRight className="mr-2 h-4 w-4" />
          Discard Batch
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDelete} disabled={loading} className="text-red-600 focus:text-red-600 focus:bg-red-50">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
        {!checkingAuth && isAuthenticated && (
          <DropdownMenuItem onClick={async () => {
            const confirmText = prompt('Type PERMANENT to permanently delete this batch. This cannot be undone.')
            if (confirmText !== 'PERMANENT') return
            setLoading(true)
            try {
              const res = await hardDeleteBatch(batchId)
              if (res && res.success) {
                toast.success('Batch permanently deleted')
                onDelete?.()
                router.refresh()
              } else {
                toast.error(res?.error || 'Failed to permanently delete batch')
              }
            } catch (err) {
              toast.error('Unexpected error during permanent delete')
            } finally {
              setLoading(false)
            }
          }} disabled={loading} className="text-red-700 focus:text-red-700 focus:bg-red-100">
            <Trash2 className="mr-2 h-4 w-4" />
            Permanently Delete (admin)
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
