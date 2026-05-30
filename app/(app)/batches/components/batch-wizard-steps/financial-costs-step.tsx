'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'
import type { BatchFinancialCosts } from '@/types/batch-workflow.types'

interface FinancialCostsStepProps {
  initialData: BatchFinancialCosts
  acceptedEggs?: number
  onComplete: (data: BatchFinancialCosts) => void
  formId: string
}

export function FinancialCostsStep({
  initialData,
  acceptedEggs = 0,
  onComplete,
  formId,
}: FinancialCostsStepProps) {
  const [data, setData] = useState<BatchFinancialCosts>(initialData)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const totals = useMemo(() => {
    const total = (
      data.eggPurchaseCost +
      data.transportCost +
      data.loadingOffloadingCost +
      data.miscellaneousCost
    )
    const perEgg = acceptedEggs > 0 ? total / acceptedEggs : 0
    return { total, perEgg }
  }, [data, acceptedEggs])

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (data.eggPurchaseCost < 0) newErrors.eggPurchaseCost = 'Cannot be negative'
    if (data.transportCost < 0) newErrors.transportCost = 'Cannot be negative'
    if (data.loadingOffloadingCost < 0) newErrors.loadingOffloadingCost = 'Cannot be negative'
    if (data.miscellaneousCost < 0) newErrors.miscellaneousCost = 'Cannot be negative'

    if (totals.total <= 0) {
      newErrors.total = 'At least one cost must be greater than zero'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) {
      onComplete({
        ...data,
        totalAcquisitionCost: totals.total,
        costPerAcceptedEgg: totals.perEgg,
      })
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {/* Cost Input Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="eggPurchaseCost" className="text-sm font-medium">
            Egg Purchase Cost (KES)
          </Label>
          <Input
            id="eggPurchaseCost"
            type="number"
            step="0.01"
            min="0"
            value={data.eggPurchaseCost || ''}
            onChange={(e) => setData({ ...data, eggPurchaseCost: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
            className={errors.eggPurchaseCost ? 'border-red-500' : ''}
          />
          {errors.eggPurchaseCost && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.eggPurchaseCost}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="transportCost" className="text-sm font-medium">
            Transport Cost (KES)
          </Label>
          <Input
            id="transportCost"
            type="number"
            step="0.01"
            min="0"
            value={data.transportCost || ''}
            onChange={(e) => setData({ ...data, transportCost: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
            className={errors.transportCost ? 'border-red-500' : ''}
          />
          {errors.transportCost && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.transportCost}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="loadingOffloadingCost" className="text-sm font-medium">
            Loading/Offloading Cost (KES)
          </Label>
          <Input
            id="loadingOffloadingCost"
            type="number"
            step="0.01"
            min="0"
            value={data.loadingOffloadingCost || ''}
            onChange={(e) =>
              setData({ ...data, loadingOffloadingCost: parseFloat(e.target.value) || 0 })
            }
            placeholder="0.00"
            className={errors.loadingOffloadingCost ? 'border-red-500' : ''}
          />
          {errors.loadingOffloadingCost && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.loadingOffloadingCost}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="miscellaneousCost" className="text-sm font-medium">
            Miscellaneous Cost (KES)
          </Label>
          <Input
            id="miscellaneousCost"
            type="number"
            step="0.01"
            min="0"
            value={data.miscellaneousCost || ''}
            onChange={(e) =>
              setData({ ...data, miscellaneousCost: parseFloat(e.target.value) || 0 })
            }
            placeholder="0.00"
            className={errors.miscellaneousCost ? 'border-red-500' : ''}
          />
          {errors.miscellaneousCost && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.miscellaneousCost}
            </p>
          )}
        </div>
      </div>

      {errors.total && (
        <div className="flex gap-3 rounded-lg bg-red-500/10 border border-red-500/30 p-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-500">{errors.total}</p>
        </div>
      )}

      {/* Cost Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4 bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total Acquisition Cost</p>
            <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">
              KES {totals.total.toFixed(2)}
            </p>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/20">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Cost per Accepted Egg</p>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              KES {totals.perEgg.toFixed(2)}
            </p>
            {acceptedEggs > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                ÷ {acceptedEggs} accepted eggs
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Cost Breakdown */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Cost Breakdown</p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Egg Purchase</span>
            <span>KES {data.eggPurchaseCost.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Transport</span>
            <span>KES {data.transportCost.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Loading/Offloading</span>
            <span>KES {data.loadingOffloadingCost.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Miscellaneous</span>
            <span>KES {data.miscellaneousCost.toFixed(2)}</span>
          </div>
          <div className="border-t border-input mt-2 pt-2 flex justify-between font-medium">
            <span>Total</span>
            <span>KES {totals.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" className="bg-primary">
          Continue to Incubation Assignment
        </Button>
      </div>
    </form>
  )
}
