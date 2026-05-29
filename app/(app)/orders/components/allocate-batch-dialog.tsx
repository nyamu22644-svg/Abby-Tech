'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { allocateOrder } from '../actions'

type BatchMin = {
  id: string;
  batch_number: string;
  baseQuantity: number;
  allocated_count: number;
  status: string;
}

export function AllocateBatchDialog({ orderId, orderQuantity, availableBatches }: { orderId: string, orderQuantity: number, availableBatches: BatchMin[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedBatch, setSelectedBatch] = useState<string>('')
  
  const router = useRouter()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedBatch) {
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
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="gap-2 h-9 px-4 rounded-md font-medium text-xs w-full">
            <Package className="h-4 w-4" />
            Allocate from Batch
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[425px] border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-primary tracking-tight">Allocate Chicks to Order</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Select a completed hatch batch to fulfill this order of <strong className="text-foreground">{orderQuantity} chicks</strong>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 py-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md border border-destructive/20 font-medium">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div className="space-y-1.5 flex flex-col">
              <label htmlFor="batch_id" className="text-sm font-medium text-muted-foreground">Available Hatched Batches</label>
              <select
                id="batch_id"
                name="batch_id"
                required
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" disabled>Select a hatch batch...</option>
                {availableBatches.map(batch => {
                  const availableCount = batch.baseQuantity - batch.allocated_count;
                  return (
                    <option 
                      key={batch.id} 
                      value={batch.id} 
                      disabled={availableCount < orderQuantity}
                      className={availableCount < orderQuantity ? "!text-muted-foreground/50" : ""}
                    >
                      {batch.batch_number} - {batch.status} ({availableCount.toLocaleString()} available)
                    </option>
                  );
                })}
              </select>
              {availableBatches.length === 0 && (
                 <p className="text-xs text-destructive mt-1">No batches with available inventory.</p>
              )}
            </div>
            
          </div>
          
          <div className="flex justify-end pt-4 gap-2 border-t border-border mt-6">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading} className="text-muted-foreground hover:text-foreground">
              Cancel
            </Button>
            <Button type="submit" disabled={loading || availableBatches.length === 0 || !selectedBatch} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {loading ? 'Allocating...' : 'Allocate Chicks'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
