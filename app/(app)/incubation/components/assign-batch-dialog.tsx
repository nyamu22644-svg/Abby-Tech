'use client'

import { useMemo, useState } from 'react'
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
import { Activity, Sparkles } from 'lucide-react'
import { assignBatchToIncubator } from '../actions'

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

export function AssignBatchDialog({ 
  incubators, 
  placementBatches,
  incubatorAllocations = [],
}: { 
  incubators: any[], 
  placementBatches: any[]
  incubatorAllocations?: any[]
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actualSetDate, setActualSetDate] = useState(() => toLocalDateTimeInputValue(new Date()))
  const [selectedBatch, setSelectedBatch] = useState('')
  const [selectedIncubator, setSelectedIncubator] = useState('')
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()
  
  const router = useRouter()
  const waitingBatches = useMemo(() => placementBatches.filter(
    (batch, index, source) => source.findIndex((item) => item.id === batch.id) === index
  ).sort((left, right) =>
    new Date(left.date_received || left.created_at || 0).getTime() -
    new Date(right.date_received || right.created_at || 0).getTime()
  ), [placementBatches])

  const incubatorOccupancy = useMemo(() => incubatorAllocations.reduce((acc: Record<string, number>, allocation) => {
    if (!allocation.incubator_id) return acc
    acc[allocation.incubator_id] = (acc[allocation.incubator_id] || 0) + Number(allocation.eggs_allocated || 0)
    return acc
  }, {}), [incubatorAllocations])

  const recommendation = useMemo(() => {
    const batch = waitingBatches[0] || null
    const eggsToPlace = batch ? getEggsToPlace(batch) : 0
    const candidates = incubators
      .filter((incubator) => incubator.operational_status === 'ACTIVE' && incubator.type === 'SETTER')
      .map((incubator) => {
        const capacity = getIncubatorCapacity(incubator)
        const occupied = incubatorOccupancy[incubator.id] || 0
        const available = Math.max(capacity - occupied, 0)
        return { incubator, capacity, occupied, available }
      })
      .sort((left, right) => {
        const leftFits = left.available >= eggsToPlace
        const rightFits = right.available >= eggsToPlace
        if (leftFits !== rightFits) return leftFits ? -1 : 1
        if (leftFits && rightFits) return (left.available - eggsToPlace) - (right.available - eggsToPlace)
        return right.available - left.available
      })

    return {
      batch,
      incubator: candidates[0]?.incubator || null,
      eggsToPlace,
      available: candidates[0]?.available || 0,
    }
  }, [incubatorOccupancy, incubators, waitingBatches])

  const selectedRecommendationMatches = Boolean(
    recommendation.batch?.id &&
    recommendation.incubator?.id &&
    selectedBatch === recommendation.batch.id &&
    selectedIncubator === recommendation.incubator.id
  )

  const formatStatus = (status?: string) => {
    if (status === 'LOGGED') return 'Needs placement'
    if (status === 'SETTER') return 'Needs placement'
    if (status === 'HATCHER') return 'Hatch prep'
    if (status === 'BROODER') return 'Brooder'
    return status || 'Batch'
  }

  const formatMachineRole = (type?: string) => {
    if (type === 'SETTER') return 'Incubator'
    if (type === 'HATCHER') return 'Hatch prep'
    if (type === 'BROODER') return 'Brooder'
    return type || 'Machine'
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setActualSetDate(toLocalDateTimeInputValue(new Date()))
      setSelectedBatch(recommendation.batch?.id || '')
      setSelectedIncubator(recommendation.incubator?.id || '')
      setError(null)
    }
    setOpen(nextOpen)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!acquireSubmitLock()) return
    setLoading(true)
    setError(null)
    
    const formData = new FormData(e.currentTarget)
    const enteredSetDate = formData.get('actual_set_date') as string | null
    if (enteredSetDate) {
      formData.set('actual_set_date', new Date(enteredSetDate).toISOString())
    }

    try {
      const result = await assignBatchToIncubator(formData)

      if (result?.error) {
        setError(result.error)
      } else {
        setOpen(false)
        router.refresh()
      }
    } finally {
      releaseSubmitLock()
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button disabled={waitingBatches.length === 0 || incubators.length === 0}>
            <Activity className="w-4 h-4 mr-2"/>
            Place Waiting Batch
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Place Batch in Incubator</DialogTitle>
          <DialogDescription>
            Select a waiting batch and the physical incubator machine it will be loaded into.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 py-4">
          <input type="hidden" name="phase" value="SETTER" />

          {error && (
            <div className="rounded-card bg-destructive/15 p-3 text-sm text-destructive">{error}</div>
          )}
          
          <div className="grid gap-2">
            <Label htmlFor="batch_id">Waiting Batch</Label>
            <select
              id="batch_id"
              name="batch_id"
              required
              value={selectedBatch}
              onChange={(event) => setSelectedBatch(event.target.value)}
              className="h-10 w-full rounded-input border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-4 focus:ring-ring/20"
            >
              <option value="" disabled>Select a batch</option>
              {waitingBatches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_number} - {formatStatus(b.status)} ({getEggsToPlace(b).toLocaleString()} eggs)
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="incubator_id">Incubator Machine</Label>
            <select
              id="incubator_id"
              name="incubator_id"
              required
              value={selectedIncubator}
              onChange={(event) => setSelectedIncubator(event.target.value)}
              className="h-10 w-full rounded-input border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-4 focus:ring-ring/20"
            >
              <option value="" disabled>Select machine</option>
              {incubators.map((i) => {
                const capacity = getIncubatorCapacity(i)
                const occupied = incubatorOccupancy[i.id] || 0
                const available = Math.max(capacity - occupied, 0)
                const inactive = i.operational_status !== 'ACTIVE' || i.type !== 'SETTER'
                return (
                <option key={i.id} value={i.id} disabled={inactive}>
                  {i.name} ({formatMachineRole(i.type)}) - {available.toLocaleString()} free
                </option>
              )})}
            </select>
          </div>

          {recommendation.batch && recommendation.incubator && (
            <div className="rounded-card border border-primary/20 bg-primary/10 p-3 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold text-foreground">
                    Smart default{selectedRecommendationMatches ? ' selected' : ' available'}
                  </p>
                  <p className="mt-1">
                    {recommendation.batch.batch_number} into {recommendation.incubator.name}: {recommendation.eggsToPlace.toLocaleString()} eggs, {recommendation.available.toLocaleString()} free spaces.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label>Actual Set Date & Time</Label>
            <input type="hidden" name="actual_set_date" value={actualSetDate} />
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
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
                  className="h-10 w-full rounded-input border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-4 focus:ring-ring/20"
                />
              </div>
              <div className="grid gap-1">
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
                  className="h-10 w-full rounded-input border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-4 focus:ring-ring/20"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Use the real time eggs entered the machine, even if this is being recorded later.
            </p>
          </div>

          <div className="rounded-card border border-primary/20 bg-primary/10 p-3 text-xs text-muted-foreground">
            The system will load accepted eggs into available XD slots and calculate day 21 from the actual set date.
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={loading || incubators.length === 0 || waitingBatches.length === 0} aria-busy={loading}>
              {loading ? 'Placing...' : 'Place Batch'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function getEggsToPlace(batch: any) {
  return Number(batch.accepted_eggs ?? batch.quantity_received ?? 0)
}

function getIncubatorCapacity(incubator: any) {
  const layoutCapacity = Number(incubator.columns_count || 0) * Number(incubator.tray_rows || 0) * Number(incubator.eggs_per_slot || 0)
  return layoutCapacity > 0 ? layoutCapacity : Number(incubator.capacity || 0)
}
