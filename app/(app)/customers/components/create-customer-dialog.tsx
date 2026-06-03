'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'

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
import { createCustomerRelationship } from '../actions'

export function CreateCustomerDialog() {
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
      const result = await createCustomerRelationship(formData)
      if (!result.success) {
        setError(result.error || 'Failed to create customer')
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
          <Button className="h-9 gap-2 rounded-button px-4 text-sm font-semibold shadow-[var(--shadow-card)]">
            <UserPlus className="h-4 w-4" />
            Add Customer
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="text-foreground tracking-tight">Add Customer</DialogTitle>
          <DialogDescription>
            Create a customer profile before or outside an order.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="space-y-4 py-2">
          {error ? (
            <div className="rounded-button border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field name="name" label="Customer Name" required />
            <Field name="phone" label="Phone" />
            <Field name="email" label="Email" type="email" />
            <Field name="address" label="Location / Address" />
            <Field name="city" label="Town" />
            <Field name="country" label="Country" />
            <Field name="preferredBreed" label="Preferred Breed" />

            <div className="space-y-1.5">
              <label htmlFor="preferredPaymentMethodCreate" className="text-xs font-semibold text-muted-foreground">
                Preferred Payment
              </label>
              <select
                id="preferredPaymentMethodCreate"
                name="preferredPaymentMethod"
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
          </div>

          <div className="space-y-1.5">
            <label htmlFor="relationshipNotesCreate" className="text-xs font-semibold text-muted-foreground">
              Relationship Notes
            </label>
            <textarea
              id="relationshipNotesCreate"
              name="relationshipNotes"
              placeholder="Preferences, delivery notes, usual quantities..."
              className="min-h-[88px] w-full rounded-input border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} aria-busy={loading}>
              {loading ? 'Creating...' : 'Create Customer'}
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
  type = 'text',
  required = false,
}: {
  name: string
  label: string
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
        className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
      />
    </div>
  )
}
