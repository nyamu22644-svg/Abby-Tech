'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Archive, Eye, MoreVertical, RotateCcw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useSubmitLock } from '@/hooks/use-submit-lock'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { deleteBatch, restoreBatch } from '../actions'

export function BatchActionsMenu({
  batchId,
  isArchived = false,
  onDelete,
  onRestore,
}: {
  batchId: string
  isArchived?: boolean
  onDelete?: () => void
  onRestore?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()
  const router = useRouter()

  async function handleArchive() {
    if (!confirm('Archive this batch? You can restore it from the Archived view.')) return
    if (!acquireSubmitLock()) return

    setLoading(true)
    try {
      const result = await deleteBatch(batchId)
      if (result.success) {
        toast.success('Batch archived successfully')
        onDelete?.()
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to archive batch')
      }
    } catch (error) {
      toast.error('An unexpected error occurred')
    } finally {
      releaseSubmitLock()
      setLoading(false)
    }
  }

  async function handleRestore() {
    if (!acquireSubmitLock()) return
    setLoading(true)
    try {
      const result = await restoreBatch(batchId)
      if (result.success) {
        toast.success('Batch restored successfully')
        onRestore?.()
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to restore batch')
      }
    } catch (error) {
      toast.error('An unexpected error occurred')
    } finally {
      releaseSubmitLock()
      setLoading(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            disabled={loading}
          />
        }
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          render={
            <Link href={`/batches/${batchId}`} className="flex items-center">
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </Link>
          }
        />
        <DropdownMenuSeparator />
        {isArchived ? (
          <DropdownMenuItem onClick={handleRestore} disabled={loading}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Restore Batch
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={handleArchive} disabled={loading} className="text-amber-300 focus:text-amber-300">
            <Archive className="mr-2 h-4 w-4" />
            Archive Batch
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
