'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { BatchSupplierInfo } from '@/types/batch-workflow.types'
import { cn } from '@/lib/utils'

type SupplierOption = {
  id: string
  name: string
  contactName?: string | null
  phone?: string | null
  email?: string | null
  location?: string | null
  batchCount?: number
  hatchRate?: number | null
  rejectionRate?: number | null
  averageCostPerAcceptedEgg?: number | null
}

interface SupplierInfoStepProps {
  initialData: BatchSupplierInfo
  supplierOptions?: SupplierOption[]
  onComplete: (data: BatchSupplierInfo) => void
  formId: string
}

export function SupplierInfoStep({
  initialData,
  supplierOptions = [],
  onComplete,
  formId,
}: SupplierInfoStepProps) {
  const [data, setData] = useState<BatchSupplierInfo>(initialData)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const selectedSupplier = supplierOptions.find((supplier) => supplier.id === data.supplierId)
  const supplierSearch = normalizeSearch([data.supplierName, data.phone].filter(Boolean).join(' '))

  const suggestedSuppliers = useMemo(() => {
    if (!supplierSearch) return supplierOptions.slice(0, 5)

    return supplierOptions
      .map((supplier) => {
        const haystack = normalizeSearch([
          supplier.name,
          supplier.phone,
          supplier.email,
          supplier.location,
          supplier.contactName,
        ].filter(Boolean).join(' '))
        const exactName = normalizeSearch(supplier.name) === normalizeSearch(data.supplierName)
        const exactPhone = data.phone && normalizeSearch(supplier.phone) === normalizeSearch(data.phone)
        const score = exactName || exactPhone ? 0 : haystack.includes(supplierSearch) ? 1 : 2
        return { supplier, score }
      })
      .filter((entry) => entry.score < 2)
      .sort((left, right) => left.score - right.score || left.supplier.name.localeCompare(right.supplier.name))
      .slice(0, 5)
      .map((entry) => entry.supplier)
  }, [data.phone, data.supplierName, supplierOptions, supplierSearch])

  function applySupplier(supplier: SupplierOption) {
    setData({
      ...data,
      supplierId: supplier.id,
      supplierName: supplier.name,
      contactPerson: supplier.contactName || data.contactPerson || '',
      phone: supplier.phone || data.phone || '',
      email: supplier.email || data.email || '',
      location: supplier.location || data.location || '',
    })
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    const emailValue = data.email?.trim()
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!data.supplierName?.trim()) newErrors.supplierName = 'Supplier name is required'
    if (emailValue && !emailPattern.test(emailValue)) newErrors.email = 'Enter a valid email address'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) {
      onComplete(data)
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="supplierName" className="text-xs font-semibold text-muted-foreground">
            Supplier Name *
          </Label>
          <Input
            id="supplierName"
            value={data.supplierName}
            onChange={(e) => setData({ ...data, supplierId: undefined, supplierName: e.target.value })}
            placeholder="e.g. Kenchic Ltd"
            className={cn('h-9 bg-background text-sm', errors.supplierName && 'border-destructive focus-visible:ring-destructive/20')}
          />
          {errors.supplierName && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.supplierName}
            </p>
          )}
        </div>

        {supplierOptions.length > 0 && (
          <div className="space-y-2 sm:col-span-2">
            {selectedSupplier ? (
              <div className="flex items-start gap-2 rounded-button border border-success/20 bg-success/5 px-3 py-2 text-xs text-success">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Reusing existing supplier record for <span className="font-semibold">{selectedSupplier.name}</span>.
                </span>
              </div>
            ) : suggestedSuppliers.length > 0 ? (
              <div className="rounded-button border border-border bg-muted/20 p-2">
                <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Supplier matches
                </p>
                <div className="space-y-1">
                  {suggestedSuppliers.map((supplier) => (
                    <button
                      key={supplier.id}
                      type="button"
                      onClick={() => applySupplier(supplier)}
                      className="flex w-full items-center justify-between gap-3 rounded-button px-2 py-2 text-left text-xs transition-colors hover:bg-background"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-foreground">{supplier.name}</span>
                        <span className="block truncate text-muted-foreground">
                          {[supplier.phone, supplier.location].filter(Boolean).join(' / ') || 'No contact details'}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span>{supplier.batchCount || 0} batches</span>
                          {supplier.hatchRate !== null && supplier.hatchRate !== undefined ? (
                            <span>Hatch {supplier.hatchRate.toFixed(1)}%</span>
                          ) : null}
                          {supplier.rejectionRate !== null && supplier.rejectionRate !== undefined ? (
                            <span>Reject {supplier.rejectionRate.toFixed(1)}%</span>
                          ) : null}
                          {supplier.averageCostPerAcceptedEgg !== null && supplier.averageCostPerAcceptedEgg !== undefined ? (
                            <span>KES {supplier.averageCostPerAcceptedEgg.toFixed(0)}/egg</span>
                          ) : null}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold text-primary">Reuse</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="contactPerson" className="text-xs font-semibold text-muted-foreground">
            Contact Person
          </Label>
          <Input
            id="contactPerson"
            value={data.contactPerson}
            onChange={(e) => setData({ ...data, contactPerson: e.target.value })}
            placeholder="e.g. John Doe"
            className={cn('h-9 bg-background text-sm', errors.contactPerson && 'border-destructive focus-visible:ring-destructive/20')}
          />
          {errors.contactPerson && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.contactPerson}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone" className="text-xs font-semibold text-muted-foreground">
            Phone Number
          </Label>
          <Input
            id="phone"
            type="tel"
            value={data.phone}
            onChange={(e) => setData({ ...data, phone: e.target.value })}
            placeholder="e.g. +254 712 345 678"
            className={cn('h-9 bg-background text-sm', errors.phone && 'border-destructive focus-visible:ring-destructive/20')}
          />
          {errors.phone && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.phone}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-semibold text-muted-foreground">
            Email (Optional)
          </Label>
          <Input
            id="email"
            type="email"
            value={data.email || ''}
            onChange={(e) => setData({ ...data, email: e.target.value })}
            placeholder="e.g. contact@supplier.com"
            className={cn('h-9 bg-background text-sm', errors.email && 'border-destructive focus-visible:ring-destructive/20')}
          />
          {errors.email && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.email}
            </p>
          )}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="location" className="text-xs font-semibold text-muted-foreground">
            Location
          </Label>
          <Input
            id="location"
            value={data.location}
            onChange={(e) => setData({ ...data, location: e.target.value })}
            placeholder="e.g. Nairobi, Kenya"
            className={cn('h-9 bg-background text-sm', errors.location && 'border-destructive focus-visible:ring-destructive/20')}
          />
          {errors.location && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.location}
            </p>
          )}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="invoiceNumber" className="text-xs font-semibold text-muted-foreground">
            Invoice Number
          </Label>
          <Input
            id="invoiceNumber"
            value={data.invoiceNumber}
            onChange={(e) => setData({ ...data, invoiceNumber: e.target.value })}
            placeholder="e.g. INV-2024-001"
            className={cn('h-9 bg-background text-sm', errors.invoiceNumber && 'border-destructive focus-visible:ring-destructive/20')}
          />
          {errors.invoiceNumber && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.invoiceNumber}
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit">
          Continue to Receipt
        </Button>
      </div>
    </form>
  )
}

function normalizeSearch(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
}
