'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Syringe } from 'lucide-react'
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
import { markVaccinationDone } from '../actions'

type MarkVaccinationDoneDialogProps = {
  batchId: string
  batchNumber: string
  vaccineName: string
  dueDay: number
  dueDate: string
  costPerChick: number
  disabled?: boolean
}

export function MarkVaccinationDoneDialog({
  batchId,
  batchNumber,
  vaccineName,
  dueDay,
  dueDate,
  costPerChick,
  disabled = false,
}: MarkVaccinationDoneDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!acquireSubmitLock()) return
    setLoading(true)
    setError(null)

    try {
      const result = await markVaccinationDone({
        batchId,
        vaccineName,
        dueDay,
        dueDate,
        costPerChick,
        notes,
      })

      if (!result.success) {
        setError(result.error || 'Failed to record vaccination.')
        return
      }

      setNotes('')
      setOpen(false)
      router.refresh()
    } catch {
      setError('An unexpected error occurred.')
    } finally {
      releaseSubmitLock()
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            disabled={disabled}
            className="h-8 gap-2 rounded-button px-3 text-xs font-semibold"
          >
            <CheckCircle2 className="h-4 w-4" />
            Mark Done
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground tracking-tight">
            <Syringe className="h-4 w-4 text-primary" />
            Mark Vaccine Done
          </DialogTitle>
          <DialogDescription>
            Record that this vaccine was given for the selected batch.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 py-2">
          {error ? (
            <div className="rounded-button border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {error}
            </div>
          ) : null}

          <div className="rounded-button border border-border bg-muted/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Batch</p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">{batchNumber}</p>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vaccine</p>
                <p className="mt-1 font-medium text-foreground">{vaccineName}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Due Date</p>
                <p className="mt-1 font-medium text-foreground">{formatDate(dueDate)}</p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="vaccination_notes" className="text-xs font-semibold text-muted-foreground">
              Note <span className="font-medium">(optional)</span>
            </label>
            <textarea
              id="vaccination_notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="w-full rounded-input border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
              placeholder="Dose, staff member, or any issue noticed"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {loading ? 'Saving...' : 'Save Done'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function formatDate(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '--' : parsed.toLocaleDateString()
}
