'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { BatchInspectionData } from '@/types/batch-workflow.types'

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
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {/* Summary Card */}
      <Card className="p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Total Eggs Received</p>
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{totalEggsReceived}</p>
        </div>
      </Card>

      {/* Inspection Inputs */}
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="crackedEggs" className="text-sm font-medium">
              Cracked Eggs
            </Label>
            <Input
              id="crackedEggs"
              type="number"
              min="0"
              value={data.crackedEggs}
              onChange={(e) => setData({ ...data, crackedEggs: parseInt(e.target.value) || 0 })}
              placeholder="0"
              className={errors.crackedEggs ? 'border-red-500' : ''}
            />
            {errors.crackedEggs && (
              <p className="text-xs text-red-500">{errors.crackedEggs}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="dirtyEggs" className="text-sm font-medium">
              Dirty Eggs
            </Label>
            <Input
              id="dirtyEggs"
              type="number"
              min="0"
              value={data.dirtyEggs}
              onChange={(e) => setData({ ...data, dirtyEggs: parseInt(e.target.value) || 0 })}
              placeholder="0"
              className={errors.dirtyEggs ? 'border-red-500' : ''}
            />
            {errors.dirtyEggs && (
              <p className="text-xs text-red-500">{errors.dirtyEggs}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="rejectedEggs" className="text-sm font-medium">
              Other Rejected
            </Label>
            <Input
              id="rejectedEggs"
              type="number"
              min="0"
              value={data.rejectedEggs}
              onChange={(e) => setData({ ...data, rejectedEggs: parseInt(e.target.value) || 0 })}
              placeholder="0"
              className={errors.rejectedEggs ? 'border-red-500' : ''}
            />
            {errors.rejectedEggs && (
              <p className="text-xs text-red-500">{errors.rejectedEggs}</p>
            )}
          </div>
        </div>

        {errors.total && (
          <div className="flex gap-3 rounded-lg bg-red-500/10 border border-red-500/30 p-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-500">{errors.total}</p>
          </div>
        )}
      </div>

      {/* Accepted Eggs Summary */}
      <Card className="p-4 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Accepted Eggs</span>
            <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{acceptedEggs}</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Rejection Rate: {rejectPercentage}%</p>
            <p className="text-emerald-600 dark:text-emerald-400 font-medium">
              These eggs will proceed to incubation
            </p>
          </div>
        </div>
      </Card>

      {/* Inspection Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes" className="text-sm font-medium">
          Inspection Notes (Optional)
        </Label>
        <textarea
          id="notes"
          value={data.inspectionNotes || ''}
          onChange={(e) => setData({ ...data, inspectionNotes: e.target.value })}
          placeholder="Document any special observations or conditions..."
          className="w-full h-20 px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Photo Upload */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Inspection Photos (Optional)</Label>
        <div className="border border-dashed border-input rounded-lg p-6 text-center hover:bg-accent/50 transition">
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
            className="cursor-pointer text-sm text-muted-foreground"
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
                    className="text-red-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" className="bg-primary">
          Continue to Acquisition Costs
        </Button>
      </div>
    </form>
  )
}
