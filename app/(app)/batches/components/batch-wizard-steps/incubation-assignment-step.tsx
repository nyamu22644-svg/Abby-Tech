'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle2, Factory, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { BatchIncubationAssignment } from '@/types/batch-workflow.types'

interface IncubationAssignmentStepProps {
  initialData?: BatchIncubationAssignment
  acceptedEggs: number
  incubationDays?: number
  onComplete: (data: BatchIncubationAssignment) => void
  onSkip: () => void
  formId: string
}

interface UserProfileOption {
  id: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
}

interface IncubatorOption {
  id: string
  name: string
  unit_code: string | null
  type: string | null
  capacity: number | null
}

interface ExistingAllocation {
  column_number: number
  row_number: number
  eggs_allocated: number
}

function createDefaultAssignment(incubationDays: number): BatchIncubationAssignment {
  const setDate = new Date()
  const expectedHatchDate = new Date(setDate)
  expectedHatchDate.setDate(expectedHatchDate.getDate() + incubationDays)

  return {
    incubatorId: '',
    setDate,
    expectedHatchDate,
    startColumnNumber: 1,
    startRowNumber: 1,
    autoAllocate: true,
    allocations: [],
    placementSummary: '',
  }
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function toLocalInputValue(value?: Date) {
  if (!value) return ''
  const date = new Date(value)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function toLocalDateInputValue(value?: Date) {
  return toLocalInputValue(value).slice(0, 10)
}

function toLocalTimeInputValue(value?: Date) {
  return toLocalInputValue(value).slice(11, 16)
}

function combineLocalDateAndTime(currentValue: Date, dateValue: string, timeValue: string) {
  const current = new Date(currentValue)
  const datePart = dateValue || toLocalDateInputValue(current)
  const timePart = timeValue || toLocalTimeInputValue(current)
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  return new Date(year, month - 1, day, hour, minute)
}

function buildPlacementPlan(
  incubator: IncubatorOption | undefined,
  acceptedEggs: number,
  startColumnNumber = 1,
  startRowNumber = 1,
  existingAllocations: ExistingAllocation[] = []
) {
  if (!incubator || acceptedEggs <= 0) {
    return { allocations: [], summary: '', capacity: 0, fits: false }
  }

  const columns = 6
  const rows = 2
  const eggsPerSlot = 88
  const capacity = incubator.capacity || columns * rows * eggsPerSlot
  let remaining = acceptedEggs
  const allocations: Array<{
    columnNumber: number
    rowNumber: number
    slotCapacity: number
    eggsAllocated: number
  }> = []
  const occupied = new Map<string, number>()

  for (const allocation of existingAllocations) {
    const key = `${allocation.column_number}-${allocation.row_number}`
    occupied.set(key, (occupied.get(key) || 0) + Number(allocation.eggs_allocated || 0))
  }

  const slots = []
  for (let column = 1; column <= columns; column += 1) {
    for (let row = 1; row <= rows; row += 1) {
      slots.push({ column, row })
    }
  }

  const startIndex = slots.findIndex(
    (slot) => slot.column === startColumnNumber && slot.row === startRowNumber
  )
  const usableSlots = startIndex >= 0 ? slots.slice(startIndex) : slots

  for (const slot of usableSlots) {
    if (remaining <= 0) break

    const available = Math.max(eggsPerSlot - (occupied.get(`${slot.column}-${slot.row}`) || 0), 0)
    if (available <= 0) continue

    const eggsAllocated = Math.min(remaining, available)
    allocations.push({
      columnNumber: slot.column,
      rowNumber: slot.row,
      slotCapacity: eggsPerSlot,
      eggsAllocated,
    })
    remaining -= eggsAllocated
  }

  const slotText = allocations
    .map((slot) => `Unit ${slot.columnNumber}, Tray ${slot.rowNumber}: ${slot.eggsAllocated}`)
    .join(', ')
  const summary = remaining > 0
    ? `${acceptedEggs.toLocaleString()} eggs do not fit from Unit ${startColumnNumber}, Tray ${startRowNumber}. Choose an earlier tray, clear occupied trays, or use another machine.`
    : `Place ${acceptedEggs.toLocaleString()} eggs in ${incubator.name}: ${slotText}.`

  return { allocations, summary, capacity, fits: remaining === 0 }
}

export function IncubationAssignmentStep({
  initialData,
  acceptedEggs,
  incubationDays = 21,
  onComplete,
  onSkip,
  formId,
}: IncubationAssignmentStepProps) {
  const [data, setData] = useState<BatchIncubationAssignment>(
    initialData || createDefaultAssignment(incubationDays)
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [users, setUsers] = useState<UserProfileOption[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [incubators, setIncubators] = useState<IncubatorOption[]>([])
  const [incubatorsLoading, setIncubatorsLoading] = useState(true)
  const [incubatorsError, setIncubatorsError] = useState<string | null>(null)
  const [existingAllocations, setExistingAllocations] = useState<ExistingAllocation[]>([])
  const [allocationsLoading, setAllocationsLoading] = useState(false)
  const [allocationsError, setAllocationsError] = useState<string | null>(null)

  useEffect(() => {
    const loadUsers = async () => {
      setUsersLoading(true)
      setUsersError(null)
      const supabase = createClient()
      const { data: userRows, error } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, email')
        .order('first_name', { ascending: true })

      if (error) {
        setUsersError(error.message)
        setUsers([])
      } else {
        setUsers((userRows || []) as UserProfileOption[])
      }
      setUsersLoading(false)
    }

    loadUsers()
  }, [])

  useEffect(() => {
    if (!data.incubatorId) {
      return
    }

    let mounted = true

    async function loadExistingAllocations() {
      setAllocationsLoading(true)
      setAllocationsError(null)
      const supabase = createClient()
      const { data: allocationRows, error } = await supabase
        .from('batch_incubator_allocations')
        .select('column_number, row_number, eggs_allocated')
        .eq('incubator_id', data.incubatorId)

      if (!mounted) return

      if (error) {
        setExistingAllocations([])
        setAllocationsError(error.message)
      } else {
        setExistingAllocations((allocationRows || []) as ExistingAllocation[])
      }
      setAllocationsLoading(false)
    }

    loadExistingAllocations()

    return () => {
      mounted = false
    }
  }, [data.incubatorId])

  useEffect(() => {
    const loadIncubators = async () => {
      setIncubatorsLoading(true)
      setIncubatorsError(null)
      const supabase = createClient()
      const { data: incubatorRows, error } = await supabase
        .from('incubators')
        .select('id, name, unit_code, type, capacity')
        .is('deleted_at', null)
        .eq('operational_status', 'ACTIVE')
        .order('unit_code', { ascending: true })

      if (error) {
        setIncubatorsError(error.message)
        setIncubators([])
      } else {
        setIncubators((incubatorRows || []) as IncubatorOption[])
      }
      setIncubatorsLoading(false)
    }

    loadIncubators()
  }, [])

  const selectedIncubator = incubators.find((inc) => inc.id === data.incubatorId)
  const selectedTechnician = users.find((user) => user.id === data.responsibleTechnician)
  const startColumnNumber = data.startColumnNumber || 1
  const startRowNumber = data.startRowNumber || 1
  const placement = buildPlacementPlan(
    selectedIncubator,
    acceptedEggs,
    startColumnNumber,
    startRowNumber,
    existingAllocations
  )
  const occupiedBySlot = new Map<string, number>()
  const plannedBySlot = new Map<string, number>()

  for (const allocation of existingAllocations) {
    const key = `${allocation.column_number}-${allocation.row_number}`
    occupiedBySlot.set(key, (occupiedBySlot.get(key) || 0) + Number(allocation.eggs_allocated || 0))
  }

  for (const allocation of placement.allocations) {
    plannedBySlot.set(`${allocation.columnNumber}-${allocation.rowNumber}`, allocation.eggsAllocated)
  }

  const formatUserLabel = (user: UserProfileOption) => {
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
    return name || user.email || user.id
  }

  const formatIncubatorLabel = (incubator: IncubatorOption) => {
    const name = [incubator.unit_code, incubator.name].filter(Boolean).join(' - ')
    return `${name} (${incubator.type || 'SETTER'})`
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!data.incubatorId?.trim()) newErrors.incubatorId = 'Incubator is required'
    if (!data.setDate) newErrors.setDate = 'Actual set date is required'
    if (!data.expectedHatchDate) newErrors.expectedHatchDate = 'Expected hatch date is required'
    if (acceptedEggs <= 0) newErrors.acceptedEggs = 'Accepted eggs must be greater than zero'
    if (data.incubatorId && !placement.fits) {
      newErrors.incubatorId = placement.summary || 'This incubator does not have enough capacity'
    }
    if (data.expectedHatchDate <= data.setDate) {
      newErrors.expectedHatchDate = 'Hatch date must be after the actual set date'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) {
      onComplete({
        ...data,
        incubatorName: selectedIncubator?.name || data.incubatorId,
        responsibleTechnicianName: selectedTechnician ? formatUserLabel(selectedTechnician) : undefined,
        autoAllocate: true,
        allocations: placement.allocations,
        placementSummary: placement.summary,
      })
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="min-w-0 space-y-4 overflow-hidden">
      <div className="flex items-start gap-3 rounded-card border border-primary/20 bg-primary/10 p-3">
        <Factory className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Automatic Incubator Placement</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Accepted eggs are placed into the incubator layout automatically. Hatch date is calculated using the configured {incubationDays}-day cycle
            from the actual set date.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="min-w-0 rounded-card border border-border bg-card p-3 shadow-[var(--shadow-card)]">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Accepted Eggs</p>
          <p className="truncate text-lg font-semibold tabular-nums text-primary sm:text-xl">
            {acceptedEggs.toLocaleString()}
          </p>
        </div>
        <div className="min-w-0 rounded-card border border-border bg-card p-3 shadow-[var(--shadow-card)]">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Machine Capacity</p>
          <p className="truncate text-lg font-semibold tabular-nums text-foreground sm:text-xl">
            {selectedIncubator ? `${placement.capacity.toLocaleString()} eggs` : '-'}
          </p>
        </div>
        <div className="min-w-0 rounded-card border border-border bg-card p-3 shadow-[var(--shadow-card)]">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Slots Used</p>
          <p className="truncate text-lg font-semibold tabular-nums text-foreground sm:text-xl">
            {selectedIncubator ? `${placement.allocations.length} of 12` : '-'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="incubatorId" className="text-xs font-semibold text-muted-foreground">
            Incubator Machine *
          </Label>
          <select
            id="incubatorId"
            required
            value={data.incubatorId || ''}
            onChange={(event) => {
              const nextIncubatorId = event.target.value || ''
              setData({ ...data, incubatorId: nextIncubatorId, startColumnNumber: 1, startRowNumber: 1 })
              setExistingAllocations([])
              setAllocationsError(null)
              setAllocationsLoading(Boolean(nextIncubatorId))
            }}
            className="h-9 w-full min-w-0 rounded-input border border-input bg-background px-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
          >
            <option value="" disabled>
              {incubatorsLoading ? 'Loading incubators...' : 'Select incubator'}
            </option>
            {incubators.length === 0 && !incubatorsLoading ? (
              <option value="" disabled>No active incubators available</option>
            ) : (
              incubators.map((inc) => (
                <option key={inc.id} value={inc.id}>
                  {formatIncubatorLabel(inc)}
                </option>
              ))
            )}
          </select>
          {selectedIncubator && (
            <p className="truncate text-xs text-muted-foreground" title={formatIncubatorLabel(selectedIncubator)}>
              Selected: {formatIncubatorLabel(selectedIncubator)}
            </p>
          )}
          {errors.incubatorId && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.incubatorId}
            </p>
          )}
          {incubatorsError && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {incubatorsError}
            </p>
          )}
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="responsibleTechnician" className="text-xs font-semibold text-muted-foreground">
            Link Technician (Optional)
          </Label>
          <select
            id="responsibleTechnician"
            value={data.responsibleTechnician || ''}
            onChange={(event) => setData({ ...data, responsibleTechnician: event.target.value || undefined })}
            className="h-9 w-full min-w-0 rounded-input border border-input bg-background px-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
          >
            <option value="">
              {usersLoading ? 'Loading staff...' : 'No linked technician'}
            </option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {formatUserLabel(user)}
              </option>
            ))}
          </select>
          {selectedTechnician && (
            <p className="truncate text-xs text-muted-foreground" title={formatUserLabel(selectedTechnician)}>
              Selected: {formatUserLabel(selectedTechnician)}
            </p>
          )}
          {usersError && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {usersError}
            </p>
          )}
        </div>

        <div className="min-w-0 space-y-3 rounded-card border border-border bg-card p-3 shadow-[var(--shadow-card)]">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Physical Tray Map</p>
              <p className="text-xs text-muted-foreground">
                Click the tray where the operator physically starts loading this batch.
              </p>
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              Start: Unit {startColumnNumber}, Tray {startRowNumber}
            </p>
          </div>

          {allocationsLoading && (
            <p className="text-xs text-muted-foreground">Checking existing tray use...</p>
          )}
          {allocationsError && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {allocationsError}
            </p>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((unit) => (
              <div key={unit} className="min-w-0 rounded-button border border-border bg-background p-2">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Unit {unit}</p>
                <div className="grid grid-cols-2 gap-2">
                  {[1, 2].map((tray) => {
                    const key = `${unit}-${tray}`
                    const occupied = occupiedBySlot.get(key) || 0
                    const planned = plannedBySlot.get(key) || 0
                    const isStart = unit === startColumnNumber && tray === startRowNumber
                    const isFull = occupied >= 88

                    return (
                      <button
                        key={tray}
                        type="button"
                        disabled={!selectedIncubator || isFull}
                        onClick={() =>
                          setData({ ...data, startColumnNumber: unit, startRowNumber: tray })
                        }
                        className={cn(
                          'min-h-16 rounded-button border px-2 py-2 text-left text-xs transition-colors',
                          'disabled:cursor-not-allowed disabled:opacity-55',
                          planned > 0
                            ? 'border-primary/60 bg-primary/15 text-primary'
                            : 'border-border bg-muted/20 text-muted-foreground hover:border-primary/50 hover:bg-primary/10',
                          isStart && 'ring-2 ring-primary/70',
                          isFull && 'border-destructive/40 bg-destructive/10 text-destructive'
                        )}
                      >
                        <span className="block font-medium text-foreground">Tray {tray}</span>
                        {planned > 0 ? (
                          <span className="mt-1 block font-semibold tabular-nums">
                            {planned} eggs from this batch
                          </span>
                        ) : occupied > 0 ? (
                          <span className="mt-1 block tabular-nums">{occupied}/88 occupied</span>
                        ) : (
                          <span className="mt-1 block">Empty</span>
                        )}
                        {isStart && <span className="mt-1 block text-[11px]">Start tray</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-1">Highlighted: this batch</span>
            <span className="rounded-full border border-border bg-background px-2 py-1">Empty: available</span>
            <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-1">Red: full</span>
          </div>
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">
            Actual Set Date & Time *
          </Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="setDate" className="text-xs text-muted-foreground">
                Date
              </Label>
              <Input
                id="setDate"
                type="date"
                value={toLocalDateInputValue(data.setDate)}
                onChange={(e) => {
                  const setDate = combineLocalDateAndTime(
                    data.setDate,
                    e.target.value,
                    toLocalTimeInputValue(data.setDate)
                  )
                  setData({ ...data, setDate, expectedHatchDate: addDays(setDate, incubationDays) })
                }}
                className={cn('h-9 bg-background text-sm', errors.setDate && 'border-destructive focus-visible:ring-destructive/20')}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="setTime" className="text-xs text-muted-foreground">
                Time
              </Label>
              <Input
                id="setTime"
                type="time"
                step={60}
                value={toLocalTimeInputValue(data.setDate)}
                onChange={(e) => {
                  const setDate = combineLocalDateAndTime(
                    data.setDate,
                    toLocalDateInputValue(data.setDate),
                    e.target.value
                  )
                  setData({ ...data, setDate, expectedHatchDate: addDays(setDate, incubationDays) })
                }}
                className={cn('h-9 bg-background text-sm', errors.setDate && 'border-destructive focus-visible:ring-destructive/20')}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Use the real time eggs entered the machine, even if this is being recorded later.
          </p>
          {errors.setDate && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.setDate}
            </p>
          )}
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">
            Expected Hatch Date *
          </Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="expectedHatchDate" className="text-xs text-muted-foreground">
                Date
              </Label>
              <Input
                id="expectedHatchDate"
                type="date"
                value={toLocalDateInputValue(data.expectedHatchDate)}
                readOnly
                className={cn('h-9 bg-background text-sm', errors.expectedHatchDate && 'border-destructive focus-visible:ring-destructive/20')}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="expectedHatchTime" className="text-xs text-muted-foreground">
                Time
              </Label>
              <Input
                id="expectedHatchTime"
                type="time"
                step={60}
                value={toLocalTimeInputValue(data.expectedHatchDate)}
                readOnly
                className={cn('h-9 bg-background text-sm', errors.expectedHatchDate && 'border-destructive focus-visible:ring-destructive/20')}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Auto-calculated from the actual set date.</p>
          {errors.expectedHatchDate && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.expectedHatchDate}
            </p>
          )}
        </div>

        {selectedIncubator && (
          <div className="min-w-0 space-y-3 rounded-card border border-border bg-card p-3 shadow-[var(--shadow-card)]">
            <div className="flex items-start gap-2">
              {placement.fits ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Placement Preview</p>
                <p className="mt-1 text-xs text-muted-foreground">{placement.summary}</p>
              </div>
            </div>
            {placement.allocations.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {placement.allocations.map((slot) => (
                  <div
                    key={`${slot.columnNumber}-${slot.rowNumber}`}
                    className="min-w-0 rounded-button border border-border bg-background px-3 py-2"
                  >
                    <p className="text-xs text-muted-foreground">Unit {slot.columnNumber}, Tray {slot.rowNumber}</p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {slot.eggsAllocated} eggs loaded
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Capacity {slot.slotCapacity}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="notes" className="text-xs font-semibold text-muted-foreground">
            Assignment Notes (Optional)
          </Label>
          <textarea
            id="notes"
            value={data.assignmentNotes || ''}
            onChange={(e) => setData({ ...data, assignmentNotes: e.target.value })}
            placeholder="Any special instructions or notes for this batch..."
            className="h-20 w-full rounded-input border border-input bg-background px-3 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        {errors.acceptedEggs && (
          <p className="mr-auto flex items-center gap-1 text-xs text-destructive">
            <Info className="h-3 w-3" />
            {errors.acceptedEggs}
          </p>
        )}
        <Button type="button" variant="outline" onClick={onSkip}>
          Save as Received Only
        </Button>
        <Button type="submit">
          Place in Incubator & Review
        </Button>
      </div>
    </form>
  )
}
