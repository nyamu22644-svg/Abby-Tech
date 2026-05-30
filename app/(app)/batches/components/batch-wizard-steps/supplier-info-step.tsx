'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle } from 'lucide-react'
import type { BatchSupplierInfo } from '@/types/batch-workflow.types'

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
    if (!data.contactPerson?.trim()) newErrors.contactPerson = 'Contact person is required'
    if (!data.phone?.trim()) newErrors.phone = 'Phone number is required'
    if (!data.location?.trim()) newErrors.location = 'Location is required'
    if (!data.invoiceNumber?.trim()) newErrors.invoiceNumber = 'Invoice number is required'
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
    <form id={formId} onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="supplierName" className="text-sm font-medium">
            Supplier Name *
          </Label>
          <Input
            id="supplierName"
            value={data.supplierName}
            onChange={(e) => setData({ ...data, supplierName: e.target.value })}
            placeholder="e.g. Kenchic Ltd"
            className={errors.supplierName ? 'border-red-500' : ''}
          />
          {errors.supplierName && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.supplierName}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="contactPerson" className="text-sm font-medium">
            Contact Person *
          </Label>
          <Input
            id="contactPerson"
            value={data.contactPerson}
            onChange={(e) => setData({ ...data, contactPerson: e.target.value })}
            placeholder="e.g. John Doe"
            className={errors.contactPerson ? 'border-red-500' : ''}
          />
          {errors.contactPerson && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.contactPerson}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="text-sm font-medium">
            Phone Number *
          </Label>
          <Input
            id="phone"
            type="tel"
            value={data.phone}
            onChange={(e) => setData({ ...data, phone: e.target.value })}
            placeholder="e.g. +254 712 345 678"
            className={errors.phone ? 'border-red-500' : ''}
          />
          {errors.phone && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.phone}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            Email (Optional)
          </Label>
          <Input
            id="email"
            type="email"
            value={data.email || ''}
            onChange={(e) => setData({ ...data, email: e.target.value })}
            placeholder="e.g. contact@supplier.com"
            className={errors.email ? 'border-red-500' : ''}
          />
          {errors.email && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.email}
            </p>
          )}
        </div>

        <div className="col-span-2 space-y-2">
          <Label htmlFor="location" className="text-sm font-medium">
            Location *
          </Label>
          <Input
            id="location"
            value={data.location}
            onChange={(e) => setData({ ...data, location: e.target.value })}
            placeholder="e.g. Nairobi, Kenya"
            className={errors.location ? 'border-red-500' : ''}
          />
          {errors.location && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.location}
            </p>
          )}
        </div>

        <div className="col-span-2 space-y-2">
          <Label htmlFor="invoiceNumber" className="text-sm font-medium">
            Invoice Number *
          </Label>
          <Input
            id="invoiceNumber"
            value={data.invoiceNumber}
            onChange={(e) => setData({ ...data, invoiceNumber: e.target.value })}
            placeholder="e.g. INV-2024-001"
            className={errors.invoiceNumber ? 'border-red-500' : ''}
          />
          {errors.invoiceNumber && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.invoiceNumber}
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" className="bg-primary">
          Continue to Reception Details
        </Button>
      </div>
    </form>
  )
}
