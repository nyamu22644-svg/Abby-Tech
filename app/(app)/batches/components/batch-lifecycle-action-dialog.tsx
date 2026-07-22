'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Eye, Lock, PackageCheck } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { moveBatchToHatcher, recordCandling, recordHatch } from '../actions'

type LifecycleAction = 'candling' | 'lockdown' | 'hatch'

type Props = {
  action: LifecycleAction
  batchId: string
  batchNumber: string
  loadedEggs: number
  currentCulled?: number | null
  triggerLabel?: string
  compact?: boolean
}

const actionCopy = {
  candling: {
    title: 'Record Candling',
    description: 'Record infertile or removed eggs. The batch stays in the incubator until lockdown.',
    button: 'Save Candling',
    icon: Eye,
  },
  lockdown: {
    title: 'Move to Lockdown',
    description: 'Move this batch into hatch preparation and stop turning for final hatch days.',
    button: 'Move to Hatch Prep',
    icon: Lock,
  },
  hatch: {
    title: 'Record Hatch',
    description: 'Record final chick count and move the batch into the brooder stage for post-hatch management.',
    button: 'Record Hatch',
    icon: PackageCheck,
  },
} as const

export function BatchLifecycleActionDialog({
  action,
  batchId,
  batchNumber,
  loadedEggs,
  currentCulled = 0,
  triggerLabel,
  compact = false,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removedCount, setRemovedCount] = useState(Number(currentCulled || 0))
  const [hatchedCount, setHatchedCount] = useState(Math.max(loadedEggs - Number(currentCulled || 0), 0))
  const [finalCulledCount, setFinalCulledCount] = useState(0)
  const [actualHatchDate, setActualHatchDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()

  const copy = actionCopy[action]
  const Icon = copy.icon
  const viableAfterCandling = useMemo(
    () => Math.max(loadedEggs - removedCount, 0),
    [loadedEggs, removedCount]
  )
  const hatchBalance = useMemo(
    () => Math.max(loadedEggs - Number(currentCulled || 0) - finalCulledCount - hatchedCount, 0),
    [currentCulled, finalCulledCount, hatchedCount, loadedEggs]
  )

  function resetState(nextOpen: boolean) {
    if (nextOpen) {
      setError(null)
      setRemovedCount(Number(currentCulled || 0))
      setHatchedDefaults()
      setActualHatchDate(new Date().toISOString().slice(0, 10))
      setNotes('')
    }
    setOpen(nextOpen)
  }

  function setHatchedDefaults() {
    setHatchedCountSafe(Math.max(loadedEggs - Number(currentCulled || 0), 0))
    setFinalCulledCount(0)
  }

  function setHatchedCountSafe(value: number) {
    setHatchedCount(Number.isFinite(value) ? value : 0)
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!acquireSubmitLock()) return
    setLoading(true)
    setError(null)

    try {
      const result =
        action === 'candling'
          ? await recordCandling(batchId, removedCount, notes)
          : action === 'lockdown'
            ? await moveBatchToHatcher(batchId, notes)
            : await recordHatch(batchId, hatchedCount, finalCulledCount, notes, actualHatchDate)

      if (!result.success) {
        setError(result.error || 'Action failed')
        toast.error(result.error || 'Action failed')
        return
      }

      toast.success(action === 'candling' ? 'Candling recorded' : action === 'lockdown' ? 'Batch moved to hatch prep' : 'Hatch recorded')
      setOpen(false)
      router.refresh()
    } finally {
      releaseSubmitLock()
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={resetState}>
      <DialogTrigger
        render={
          <Button
            size={compact ? 'sm' : 'default'}
            variant={action === 'lockdown' ? 'outline' : 'default'}
            className={cn(compact && 'h-8 gap-1.5 rounded-button px-3 text-xs font-semibold')}
          >
            <Icon className="h-4 w-4" />
            {triggerLabel || copy.button}
          </Button>
        }
      />
      <DialogContent className="max-h-[86vh] overflow-y-auto border-border bg-popover p-5 sm:max-w-[520px]">
        <DialogHeader className="gap-1.5">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Icon className="h-4 w-4 text-primary" />
            {copy.title}
          </DialogTitle>
          <DialogDescription className="text-[13px]">{copy.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 pt-2">
          {error ? (
            <div className="rounded-button border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-card border border-border bg-card p-3 shadow-[var(--shadow-card)]">
              <p className="text-xs font-medium text-muted-foreground">Batch</p>
              <p className="mt-1 truncate font-mono text-sm font-semibold text-foreground">{batchNumber}</p>
            </div>
            <div className="rounded-card border border-border bg-card p-3 shadow-[var(--shadow-card)]">
              <p className="text-xs font-medium text-muted-foreground">Loaded Eggs</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-primary">{loadedEggs.toLocaleString()}</p>
            </div>
          </div>

          {action === 'candling' ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="removedCount" className="text-xs font-semibold text-muted-foreground">
                  Infertile / Removed Eggs
                </label>
                <input
                  id="removedCount"
                  type="number"
                  min="0"
                  max={loadedEggs}
                  required
                  value={removedCount}
                  onChange={(event) => setRemovedCount(Number(event.target.value))}
                  className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </div>
              <div className="rounded-button border border-success/20 bg-success/10 p-3 text-sm">
                <span className="font-medium text-foreground">Viable after candling: </span>
                <span className="font-semibold tabular-nums text-success">{viableAfterCandling.toLocaleString()} eggs</span>
              </div>
            </div>
          ) : null}

          {action === 'lockdown' ? (
            <div className="rounded-button border border-primary/20 bg-primary/10 p-3 text-sm text-muted-foreground">
              This will move the batch from incubation into hatch prep. Candling remains recorded separately.
            </div>
          ) : null}

          {action === 'hatch' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="hatchedCount" className="text-xs font-semibold text-muted-foreground">
                    Chicks Hatched
                  </label>
                  <input
                    id="hatchedCount"
                    type="number"
                    min="0"
                    max={loadedEggs}
                    required
                    value={hatchedCount}
                    onChange={(event) => setHatchedCountSafe(Number(event.target.value))}
                    className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="finalCulledCount" className="text-xs font-semibold text-muted-foreground">
                    Final Unhatched / Culled
                  </label>
                  <input
                    id="finalCulledCount"
                    type="number"
                    min="0"
                    max={loadedEggs}
                    value={finalCulledCount}
                    onChange={(event) => setFinalCulledCount(Number(event.target.value))}
                    className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                  />
                </div>
              </div>
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
                  <p className="text-xs text-muted-foreground">
                    Enter the real hatch day when recording or correcting hatch counts.
                  </p>
                </div>
              </div>
              <div className="rounded-button border border-border bg-muted/30 p-3 text-sm">
                <span className="font-medium text-muted-foreground">Unaccounted balance: </span>
                <span className="font-semibold tabular-nums text-foreground">{hatchBalance.toLocaleString()} eggs</span>
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="notes" className="text-xs font-semibold text-muted-foreground">
              Notes <span className="font-medium">(optional)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Operational notes..."
              className="h-20 w-full rounded-input border border-input bg-background px-3 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} aria-busy={loading}>
              {loading ? 'Saving...' : copy.button}
              {!loading && <CheckCircle2 className="h-4 w-4" />}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
