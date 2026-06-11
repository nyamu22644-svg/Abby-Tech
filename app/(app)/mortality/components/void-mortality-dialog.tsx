'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useSubmitLock } from '@/hooks/use-submit-lock'
import { voidMortalityEvent } from '../actions'

type VoidMortalityDialogProps = {
  eventId: string
  batchNumber: string
  count: number
  estimatedLoss: number
}

export function VoidMortalityDialog({
  eventId,
  batchNumber,
  count,
  estimatedLoss,
}: VoidMortalityDialogProps) {
  const router = useRouter()
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!acquireSubmitLock()) return

    setLoading(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    formData.set('event_id', eventId)

    try {
      const result = await voidMortalityEvent(formData)

      if (result?.error) {
        setError(result.error)
        return
      }

      setOpen(false)
      setReason('')
      router.refresh()
    } finally {
      releaseSubmitLock()
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 gap-2 rounded-button px-3 text-xs font-semibold">
            <RotateCcw className="h-3.5 w-3.5" />
            Void
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Void Mortality Record</DialogTitle>
          <DialogDescription>
            Use this only for an entry mistake. The original record stays in history, but it will no longer count in reports.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          {error ? (
            <div className="rounded-button border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="rounded-button border border-warning/25 bg-warning/10 p-3 text-sm text-foreground">
            <p className="font-semibold">This correction will reverse:</p>
            <p className="mt-1 text-muted-foreground">
              {count.toLocaleString()} birds from {batchNumber}, and KES{' '}
              {estimatedLoss.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} estimated loss.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`void-reason-${eventId}`}>Correction Reason</Label>
            <Textarea
              id={`void-reason-${eventId}`}
              name="reason"
              required
              minLength={8}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Example: Recorded as mortality by mistake; this was candling removal."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="h-9 rounded-button px-4" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              className="h-9 rounded-button px-4"
              disabled={loading || reason.trim().length < 8}
              aria-busy={loading}
            >
              {loading ? 'Voiding...' : 'Void & Reverse Totals'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
