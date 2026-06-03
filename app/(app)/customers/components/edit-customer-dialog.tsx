'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PencilLine } from 'lucide-react'

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
import { updateCustomerRelationship } from '../actions'

type CustomerFormData = {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  preferred_breed?: string | null
  preferred_payment_method?: string | null
  relationship_notes?: string | null
  follow_up_at?: string | null
  follow_up_reason?: string | null
  customer_status?: string | null
}

export function EditCustomerDialog({ customer }: { customer: CustomerFormData }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()

  async function onSubmit(formData: FormData) {
    if (!acquireSubmitLock()) return
    setLoading(true)
    setError(null)

    try {
      const result = await updateCustomerRelationship(customer.id, formData)
      if (!result.success) {
        setError(result.error || 'Failed to update customer')
        return
      }

      setOpen(false)
      router.refresh()
    } catch {
      setError('An unexpected error occurred')
    } finally {
      releaseSubmitLock()
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="h-8 gap-2 rounded-button px-3 text-xs font-semibold">
            <PencilLine className="h-4 w-4" />
            Update Customer
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-foreground tracking-tight">Customer Relationship</DialogTitle>
          <DialogDescription>
            Keep preferences, contact details, and follow-up reminders current.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="space-y-4 py-2">
          {error ? (
            <div className="rounded-button border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field name="name" label="Customer Name" defaultValue={customer.name} required />
            <Field name="phone" label="Phone" defaultValue={customer.phone || ''} />
            <Field name="email" label="Email" defaultValue={customer.email || ''} type="email" />
            <Field name="address" label="Location / Address" defaultValue={customer.address || ''} />
            <Field name="city" label="Town" defaultValue={customer.city || ''} />
            <Field name="country" label="Country" defaultValue={customer.country || ''} />
            <Field name="preferredBreed" label="Preferred Breed" defaultValue={customer.preferred_breed || ''} />

            <div className="space-y-1.5">
              <label htmlFor="preferredPaymentMethod" className="text-xs font-semibold text-muted-foreground">
                Preferred Payment
              </label>
              <select
                id="preferredPaymentMethod"
                name="preferredPaymentMethod"
                defaultValue={customer.preferred_payment_method || ''}
                className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
              >
                <option value="">Not set</option>
                <option value="M_PESA">M-Pesa</option>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CARD">Card</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="customerStatus" className="text-xs font-semibold text-muted-foreground">
                Relationship Status
              </label>
              <select
                id="customerStatus"
                name="customerStatus"
                defaultValue={customer.customer_status || 'ACTIVE'}
                className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
              >
                <option value="ACTIVE">Active</option>
                <option value="WATCHLIST">Watchlist</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>

            <Field
              name="followUpAt"
              label="Follow-up Date & Time"
              defaultValue={toDateTimeLocal(customer.follow_up_at)}
              type="datetime-local"
            />
            <Field name="followUpReason" label="Follow-up Reason" defaultValue={customer.follow_up_reason || ''} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="relationshipNotes" className="text-xs font-semibold text-muted-foreground">
              Relationship Notes
            </label>
            <textarea
              id="relationshipNotes"
              name="relationshipNotes"
              defaultValue={customer.relationship_notes || ''}
              placeholder="Preferences, payment behavior, delivery notes, usual quantities..."
              className="min-h-[96px] w-full rounded-input border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} aria-busy={loading}>
              {loading ? 'Saving...' : 'Save Customer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  name,
  label,
  defaultValue,
  type = 'text',
  required = false,
}: {
  name: string
  label: string
  defaultValue: string
  type?: string
  required?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
      />
    </div>
  )
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
