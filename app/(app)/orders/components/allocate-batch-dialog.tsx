'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useSubmitLock } from '@/hooks/use-submit-lock'
import { allocateOrder } from '../actions'

type BatchMin = {
  id: string;
  batch_number: string;
  breedType?: string | null;
  baseQuantity: number;
  allocated_count: number;
  status: string;
}

export function AllocateBatchDialog({
  orderId,
  orderQuantity,
  availableBatches,
  requestedBreed,
}: {
  orderId: string
  orderQuantity: number
  availableBatches: BatchMin[]
  requestedBreed?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedBatch, setSelectedBatch] = useState<string>('')
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()
  
  const router = useRouter()
  const recommendedBatch = useMemo(
    () => chooseRecommendedBatch(availableBatches, orderQuantity, requestedBreed),
    [availableBatches, orderQuantity, requestedBreed]
  )

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setSelectedBatch(recommendedBatch?.id || '')
      setError(null)
    }
    setOpen(nextOpen)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!acquireSubmitLock()) return
    if (!selectedBatch) {
       releaseSubmitLock()
       setError("Please select a hatch batch")
       return
    }
    setLoading(true)
    setError(null)
    
    try {
      const result = await allocateOrder(orderId, selectedBatch)
      if (result.success) {
        setOpen(false)
        router.refresh()
      } else {
        setError(result.error || 'Failed to allocate order')
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      releaseSubmitLock()
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" className="h-8 w-full gap-2 rounded-button px-3 text-xs font-semibold">
            <Package className="h-4 w-4" />
            Allocate from Batch
          </Button>
        }
      />
      <DialogContent className="border-border bg-popover sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-foreground tracking-tight">Allocate Chicks to Order</DialogTitle>
          <DialogDescription>
            Select a batch with enough available or projected chicks to fulfill this order of <strong className="text-foreground">{orderQuantity} chicks</strong>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 py-2">
          {error && (
            <div className="rounded-button border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div className="space-y-1.5 flex flex-col">
              <label htmlFor="batch_id" className="text-xs font-semibold text-muted-foreground">Available Batches</label>
              <select
                id="batch_id"
                name="batch_id"
                required
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" disabled>Select a hatch batch...</option>
                {availableBatches.map(batch => {
                  const availableCount = batch.baseQuantity - batch.allocated_count;
                  const breedMismatch = Boolean(requestedBreed && !isBreedMatch(batch.breedType, requestedBreed))
                  return (
                    <option 
                      key={batch.id} 
                      value={batch.id} 
                      disabled={availableCount < orderQuantity || breedMismatch}
                      className={availableCount < orderQuantity || breedMismatch ? "!text-muted-foreground/50" : ""}
                    >
                      {batch.batch_number} - {batch.status}
                      {batch.breedType ? ` - ${batch.breedType}` : ''}
                      {breedMismatch ? ` (not ${requestedBreed})` : ` (${availableCount.toLocaleString()} available)`}
                    </option>
                  );
                })}
              </select>
              {availableBatches.length === 0 && (
                 <p className="text-xs text-destructive mt-1">No batches with available inventory.</p>
              )}
              {requestedBreed && !recommendedBatch && availableBatches.length > 0 && (
                <p className="mt-1 text-xs text-destructive">
                  No available batch matches {requestedBreed}. Keep this order unallocated until the right breed is ready.
                </p>
              )}
            </div>

            {recommendedBatch && (
              <div className="rounded-button border border-primary/20 bg-primary/10 p-3 text-xs text-muted-foreground">
                <div className="flex gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">
                      Smart default{selectedBatch === recommendedBatch.id ? ' selected' : ' available'}
                    </p>
                    <p className="mt-1">
                      {recommendedBatch.batch_number}
                      {recommendedBatch.breedType ? ` (${recommendedBatch.breedType})` : ''} leaves {(getAvailableCount(recommendedBatch) - orderQuantity).toLocaleString()} chicks after this order.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
          </div>
          
          <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || availableBatches.length === 0 || !selectedBatch} aria-busy={loading}>
              {loading ? 'Allocating...' : 'Allocate Chicks'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function chooseRecommendedBatch(batches: BatchMin[], orderQuantity: number, requestedBreed?: string | null) {
  return batches
    .map((batch) => ({
      batch,
      available: getAvailableCount(batch),
      readyScore: ['COMPLETED', 'BROODER'].includes(batch.status || '') ? 0 : 1,
    }))
    .filter((item) => item.available >= orderQuantity && isBreedMatch(item.batch.breedType, requestedBreed))
    .sort((left, right) => {
      if (left.readyScore !== right.readyScore) return left.readyScore - right.readyScore
      return (left.available - orderQuantity) - (right.available - orderQuantity)
    })[0]?.batch || null
}

function getAvailableCount(batch: BatchMin) {
  return Number(batch.baseQuantity || 0) - Number(batch.allocated_count || 0)
}

function normalizeBreed(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function isBreedMatch(batchBreed?: string | null, requestedBreed?: string | null) {
  const requestedValue = normalizeBreed(requestedBreed)
  if (!requestedValue) return true
  const batchValue = normalizeBreed(batchBreed)
  if (!batchValue) return false
  return batchValue === requestedValue || batchValue.includes(requestedValue) || requestedValue.includes(batchValue)
}
