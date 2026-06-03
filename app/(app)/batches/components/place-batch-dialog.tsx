'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { useSubmitLock } from '@/hooks/use-submit-lock'
import { createClient } from '@/lib/supabase/client'
import { assignBatchToIncubator } from '../../incubation/actions'
import { Loader2, MoveRight } from 'lucide-react'
import { toast } from 'sonner'

interface IncubatorOption {
  id: string
  name: string
  unit_code: string | null
  type: string | null
  capacity: number | null
}

interface PlaceBatchDialogProps {
  batchId: string
  batchNumber: string
  acceptedEggs: number
  onPlaced?: () => void
}

function toLocalDateTimeInputValue(date: Date) {
  const next = new Date(date)
  next.setMinutes(next.getMinutes() - next.getTimezoneOffset())
  return next.toISOString().slice(0, 16)
}

function updateLocalDateTimeValue(currentValue: string, dateValue: string, timeValue: string) {
  const currentDate = currentValue.slice(0, 10)
  const currentTime = currentValue.slice(11, 16)
  return `${dateValue || currentDate}T${timeValue || currentTime}`
}

export function PlaceBatchDialog({
  batchId,
  batchNumber,
  acceptedEggs,
  onPlaced,
}: PlaceBatchDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [incubatorsLoading, setIncubatorsLoading] = useState(false)
  const [incubators, setIncubators] = useState<IncubatorOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actualSetDate, setActualSetDate] = useState(() => toLocalDateTimeInputValue(new Date()))
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()

  useEffect(() => {
    if (!open) return

    let mounted = true
    async function loadIncubators() {
      setIncubatorsLoading(true)
      setError(null)

      const supabase = createClient()
      const { data, error: loadError } = await supabase
        .from('incubators')
        .select('id, name, unit_code, type, capacity')
        .is('deleted_at', null)
        .eq('operational_status', 'ACTIVE')
        .order('unit_code', { ascending: true })

      if (!mounted) return

      if (loadError) {
        setError(loadError.message)
        setIncubators([])
      } else {
        setIncubators((data || []) as IncubatorOption[])
      }

      setIncubatorsLoading(false)
    }

    loadIncubators()
    return () => {
      mounted = false
    }
  }, [open])

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setActualSetDate(toLocalDateTimeInputValue(new Date()))
    }
    setOpen(nextOpen)
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!acquireSubmitLock()) return
    setLoading(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    formData.set('batch_id', batchId)
    formData.set('phase', 'SETTER')
    const enteredSetDate = formData.get('actual_set_date') as string | null
    if (enteredSetDate) {
      formData.set('actual_set_date', new Date(enteredSetDate).toISOString())
    }

    try {
      const result = await assignBatchToIncubator(formData)

      if (result?.error) {
        setError(result.error)
        toast.error(result.error)
        return
      }

      toast.success('Batch placed in incubator')
      setOpen(false)
      onPlaced?.()
      router.refresh()
    } finally {
      releaseSubmitLock()
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button size="sm" className="h-7 gap-1.5 rounded px-2.5 text-xs">
            <MoveRight className="h-3.5 w-3.5" />
            Place Now
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Place Batch in Incubator</DialogTitle>
          <DialogDescription>
            Select the incubator. The system will assign the accepted eggs into available slots and set the hatch date.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Batch</p>
              <p className="truncate font-mono text-sm font-medium text-foreground">{batchNumber}</p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Accepted Eggs</p>
              <p className="text-sm font-semibold tabular-nums text-primary">{acceptedEggs.toLocaleString()}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="incubator_id">Incubator</Label>
            <select
              id="incubator_id"
              name="incubator_id"
              required
              defaultValue=""
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
            >
              <option value="" disabled>
                {incubatorsLoading ? 'Loading incubators...' : 'Select incubator'}
              </option>
              {incubators.map((incubator) => (
                <option key={incubator.id} value={incubator.id}>
                  {[incubator.unit_code, incubator.name].filter(Boolean).join(' - ')}
                  {' '}
                  ({incubator.type || 'SETTER'})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Actual Set Date & Time</Label>
            <input type="hidden" name="actual_set_date" value={actualSetDate} />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="actual_set_date_day" className="text-xs text-muted-foreground">
                  Date
                </Label>
                <input
                  id="actual_set_date_day"
                  type="date"
                  required
                  value={actualSetDate.slice(0, 10)}
                  onChange={(event) =>
                    setActualSetDate(updateLocalDateTimeValue(actualSetDate, event.target.value, ''))
                  }
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="actual_set_date_time" className="text-xs text-muted-foreground">
                  Time
                </Label>
                <input
                  id="actual_set_date_time"
                  type="time"
                  step={60}
                  required
                  value={actualSetDate.slice(11, 16)}
                  onChange={(event) =>
                    setActualSetDate(updateLocalDateTimeValue(actualSetDate, '', event.target.value))
                  }
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Use the real time eggs entered the machine, even if this is being recorded later.
            </p>
          </div>

          <div className="rounded-md border border-primary/20 bg-primary/10 p-3 text-xs text-muted-foreground">
            Placement will use the incubator slot map automatically. Expected hatch date is set to day 21 from
            the actual set date.
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || incubatorsLoading || incubators.length === 0} aria-busy={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Place Batch
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
