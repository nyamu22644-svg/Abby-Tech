'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { BatchInspectionData } from '@/types/batch-workflow.types'
import { cn } from '@/lib/utils'

interface InspectionStepProps {
  initialData: BatchInspectionData
  totalEggsReceived: number
  onComplete: (data: BatchInspectionData) => void
  formId: string
  photos: File[]
  onPhotosChange: (files: File[]) => void
}

export function InspectionStep({
  initialData,
  totalEggsReceived,
  onComplete,
  formId,
  photos,
  onPhotosChange,
}: InspectionStepProps) {
  const [data, setData] = useState<BatchInspectionData>(initialData)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const acceptedEggs = useMemo(() => {
    return totalEggsReceived - (data.crackedEggs + data.dirtyEggs + data.rejectedEggs)
  }, [totalEggsReceived, data.crackedEggs, data.dirtyEggs, data.rejectedEggs])

  const rejectPercentage = useMemo(() => {
    if (totalEggsReceived === 0) return 0
    const rejected = data.crackedEggs + data.dirtyEggs + data.rejectedEggs
    return ((rejected / totalEggsReceived) * 100).toFixed(1)
  }, [totalEggsReceived, data.crackedEggs, data.dirtyEggs, data.rejectedEggs])

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    const totalRejected = data.crackedEggs + data.dirtyEggs + data.rejectedEggs

    if (data.crackedEggs < 0) newErrors.crackedEggs = 'Cannot be negative'
    if (data.dirtyEggs < 0) newErrors.dirtyEggs = 'Cannot be negative'
    if (data.rejectedEggs < 0) newErrors.rejectedEggs = 'Cannot be negative'
    if (totalRejected > totalEggsReceived) {
      newErrors.total = 'Total rejected eggs exceed eggs received'
    }
    if (acceptedEggs <= 0) {
      newErrors.total = 'Must have at least 1 accepted egg'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) {
      onComplete({
        ...data,
        acceptedEggs,
        inspectionStatus: 'COMPLETED',
        inspectionCompletedAt: new Date(),
      })
    }
  }

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || [])
    if (selected.length === 0) return
    onPhotosChange([...photos, ...selected])
    event.target.value = ''
  }

  const removePhoto = (index: number) => {
    onPhotosChange(photos.filter((_, idx) => idx !== index))
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      {/* Summary Card */}
      <Card className="rounded-card border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Total Eggs Received</p>
          <p className="text-2xl font-semibold tabular-nums text-primary">{totalEggsReceived.toLocaleString()}</p>
        </div>
      </Card>

      {/* Inspection Inputs */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="crackedEggs" className="text-xs font-semibold text-muted-foreground">
              Cracked Eggs
            </Label>
            <Input
              id="crackedEggs"
              type="number"
              min="0"
              value={data.crackedEggs}
              onChange={(e) => setData({ ...data, crackedEggs: parseInt(e.target.value) || 0 })}
              placeholder="0"
              className={cn('h-9 bg-background text-sm', errors.crackedEggs && 'border-destructive focus-visible:ring-destructive/20')}
            />
            {errors.crackedEggs && (
              <p className="text-xs text-destructive">{errors.crackedEggs}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dirtyEggs" className="text-xs font-semibold text-muted-foreground">
              Dirty Eggs
            </Label>
            <Input
              id="dirtyEggs"
              type="number"
              min="0"
              value={data.dirtyEggs}
              onChange={(e) => setData({ ...data, dirtyEggs: parseInt(e.target.value) || 0 })}
              placeholder="0"
              className={cn('h-9 bg-background text-sm', errors.dirtyEggs && 'border-destructive focus-visible:ring-destructive/20')}
            />
            {errors.dirtyEggs && (
              <p className="text-xs text-destructive">{errors.dirtyEggs}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rejectedEggs" className="text-xs font-semibold text-muted-foreground">
              Other Rejected
            </Label>
            <Input
              id="rejectedEggs"
              type="number"
              min="0"
              value={data.rejectedEggs}
              onChange={(e) => setData({ ...data, rejectedEggs: parseInt(e.target.value) || 0 })}
              placeholder="0"
              className={cn('h-9 bg-background text-sm', errors.rejectedEggs && 'border-destructive focus-visible:ring-destructive/20')}
            />
            {errors.rejectedEggs && (
              <p className="text-xs text-destructive">{errors.rejectedEggs}</p>
            )}
          </div>
        </div>

        {errors.total && (
          <div className="flex gap-3 rounded-button border border-destructive/20 bg-destructive/10 p-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{errors.total}</p>
          </div>
        )}
      </div>

      {/* Accepted Eggs Summary */}
      <Card className="rounded-card border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Accepted Eggs</span>
            <span className="text-2xl font-semibold tabular-nums text-success">{acceptedEggs.toLocaleString()}</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Rejection Rate: {rejectPercentage}%</p>
            <p className="font-medium text-success">
              These eggs will proceed to incubation
            </p>
          </div>
        </div>
      </Card>

      {/* Inspection Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes" className="text-xs font-semibold text-muted-foreground">
          Inspection Notes (Optional)
        </Label>
        <textarea
          id="notes"
          value={data.inspectionNotes || ''}
          onChange={(e) => setData({ ...data, inspectionNotes: e.target.value })}
          placeholder="Document any special observations or conditions..."
          className="h-20 w-full rounded-input border border-input bg-background px-3 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
        />
      </div>

      {/* Photo Upload */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground">Inspection Photos (Optional)</Label>
        <div className="rounded-card border border-dashed border-input bg-card/50 p-4 text-center transition hover:bg-muted/30">
          <input
            id="inspection-photos"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handlePhotoChange}
          />
          <Label
            htmlFor="inspection-photos"
            className="cursor-pointer justify-center text-sm text-muted-foreground"
          >
            Click to upload inspection photos
          </Label>
          <p className="text-xs text-muted-foreground mt-1">Photos will be attached to this batch record</p>
        </div>
        {photos.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Selected files</p>
            <ul className="space-y-1 text-xs">
              {photos.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="text-destructive hover:text-destructive/80"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="submit">
          Continue to Acquisition Costs
        </Button>
      </div>
    </form>
  )
}
