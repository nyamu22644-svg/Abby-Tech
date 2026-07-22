'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

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
import { repairBatchHatchDate } from '../actions'

export function RepairHatchDateDialog({
  batchId,
  batchNumber,
  currentHatchDate,
}: {
  batchId: string
  batchNumber: string
  currentHatchDate?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actualHatchDate, setActualHatchDate] = useState(() =>
    currentHatchDate ? new Date(currentHatchDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  )
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!acquireSubmitLock()) return
    setLoading(true)
    setError(null)

    try {
      const result = await repairBatchHatchDate(batchId, actualHatchDate)
      if (!result.success) {
        setError(result.error || 'Failed to repair hatch date')
        toast.error(result.error || 'Failed to repair hatch date')
        return
      }

      toast.success('Hatch date repaired')
      setOpen(false)
      window.location.reload()
    } finally {
      releaseSubmitLock()
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className="w-full">
            Repair Hatch Date
          </Button>
        }
      />
      <DialogContent className="max-h-[86vh] overflow-y-auto border-border bg-popover p-5 sm:max-w-[520px]">
        <DialogHeader className="gap-1.5">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Repair Hatch Date
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            Correct the recorded hatch date for {batchNumber}. This updates vaccinations and age calculations.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 pt-2">
          {error ? (
            <div className="rounded-button border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="actualHatchDate" className="text-xs font-semibold text-muted-foreground">
                Actual Hatch Date
              </label>
              <input
                id="actualHatchDate"
                type="date"
                required
                value={actualHatchDate}
                onChange={(event) => setActualHatchDate(event.target.value)}
                className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Use this only if the recorded hatch date is incorrect. This preserves the existing hatch count.
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} aria-busy={loading}>
              {loading ? 'Saving...' : 'Save Hatch Date'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
