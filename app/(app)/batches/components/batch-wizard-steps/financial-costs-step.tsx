'use client'

import { useMemo, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
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
    const total = data.eggPurchaseCost + data.transportCost + data.loadingOffloadingCost + data.miscellaneousCost
    const perEgg = acceptedEggs > 0 ? total / acceptedEggs : 0
    return { total, perEgg }
  }, [data, acceptedEggs])

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (data.eggPurchaseCost < 0) newErrors.eggPurchaseCost = 'Cannot be negative'
    if (data.transportCost < 0) newErrors.transportCost = 'Cannot be negative'
    if (data.loadingOffloadingCost < 0) newErrors.loadingOffloadingCost = 'Cannot be negative'
    if (data.miscellaneousCost < 0) newErrors.miscellaneousCost = 'Cannot be negative'
    if (totals.total <= 0) newErrors.total = 'At least one cost must be greater than zero'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (validate()) {
      onComplete({
        ...data,
        totalAcquisitionCost: totals.total,
        costPerAcceptedEgg: totals.perEgg,
      })
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CostInput
          id="eggPurchaseCost"
          label="Egg Purchase Cost (KES)"
          value={data.eggPurchaseCost}
          error={errors.eggPurchaseCost}
          onChange={(value) => setData({ ...data, eggPurchaseCost: value })}
        />
        <CostInput
          id="transportCost"
          label="Transport Cost (KES)"
          value={data.transportCost}
          error={errors.transportCost}
          onChange={(value) => setData({ ...data, transportCost: value })}
        />
        <CostInput
          id="loadingOffloadingCost"
          label="Loading / Offloading Cost (KES)"
          value={data.loadingOffloadingCost}
          error={errors.loadingOffloadingCost}
          onChange={(value) => setData({ ...data, loadingOffloadingCost: value })}
        />
        <CostInput
          id="miscellaneousCost"
          label="Miscellaneous Cost (KES)"
          value={data.miscellaneousCost}
          error={errors.miscellaneousCost}
          onChange={(value) => setData({ ...data, miscellaneousCost: value })}
        />
      </div>

      {errors.total ? (
        <div className="flex gap-3 rounded-button border border-destructive/20 bg-destructive/10 p-3">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{errors.total}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="rounded-card border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Total Acquisition Cost</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-primary">KES {totals.total.toFixed(2)}</p>
        </Card>
        <Card className="rounded-card border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Cost per Accepted Egg</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-warning">KES {totals.perEgg.toFixed(2)}</p>
          {acceptedEggs > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Based on {acceptedEggs.toLocaleString()} accepted eggs</p>
          ) : null}
        </Card>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Cost Breakdown</p>
        <div className="space-y-1 rounded-card border border-border bg-card p-3 text-sm">
          <BreakdownRow label="Egg Purchase" value={data.eggPurchaseCost} />
          <BreakdownRow label="Transport" value={data.transportCost} />
          <BreakdownRow label="Loading / Offloading" value={data.loadingOffloadingCost} />
          <BreakdownRow label="Miscellaneous" value={data.miscellaneousCost} />
          <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
            <span>Total</span>
            <span>KES {totals.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit">Continue to Incubation Assignment</Button>
      </div>
    </form>
  )
}

function CostInput({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string
  label: string
  value: number
  error?: string
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        step="0.01"
        min="0"
        value={value || ''}
        onChange={(event) => onChange(parseFloat(event.target.value) || 0)}
        placeholder="0.00"
        className={cn('h-9 bg-background text-sm', error && 'border-destructive focus-visible:ring-destructive/20')}
      />
      {error ? (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      ) : null}
    </div>
  )
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span>KES {value.toFixed(2)}</span>
    </div>
  )
}
