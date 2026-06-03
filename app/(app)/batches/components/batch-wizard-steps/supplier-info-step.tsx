'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle } from 'lucide-react'
import type { BatchSupplierInfo } from '@/types/batch-workflow.types'
import { cn } from '@/lib/utils'

interface SupplierInfoStepProps {
  initialData: BatchSupplierInfo
  onComplete: (data: BatchSupplierInfo) => void
  formId: string
}

export function SupplierInfoStep({ initialData, onComplete, formId }: SupplierInfoStepProps) {
  const [data, setData] = useState<BatchSupplierInfo>(initialData)
  const [errors, setErrors] = useState<Record<string, string>>({})

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
            onChange={(e) => setData({ ...data, supplierName: e.target.value })}
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
