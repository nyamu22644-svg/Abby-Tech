'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
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
import { createOrder } from '../actions'

type CreateOrderDialogProps = {
  projectedAvailableChicks?: number
  readyNowChicks?: number
}

export function CreateOrderDialog({
  projectedAvailableChicks = 0,
  readyNowChicks = 0,
}: CreateOrderDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()
  const router = useRouter()

  const [pricePerChick, setPricePerChick] = useState(130)
  const [quantity, setQuantity] = useState<number>()
  const [discountAmount, setDiscountAmount] = useState(0)
  const subtotal = (quantity || 0) * pricePerChick
  const safeDiscount = Math.min(discountAmount || 0, subtotal)
  const total = Math.max(0, subtotal - safeDiscount)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!acquireSubmitLock()) return

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData(event.currentTarget)
      const result = await createOrder(formData)
      if (result.success) {
        setOpen(false)
        router.refresh()
      } else {
        setError(result.error || 'Failed to create order')
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      releaseSubmitLock()
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger 
        render={<Button className="h-9 gap-2 rounded-button px-4 text-sm font-semibold shadow-[var(--shadow-card)]"><Plus className="h-4 w-4" />Create Order</Button>}
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-foreground tracking-tight">New Booking / Order</DialogTitle>
          <DialogDescription>
            Capture the customer request, target date, and expected value.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 py-2">
          {error && (
            <div className="rounded-button border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 col-span-2">
                <label htmlFor="customer_name" className="text-xs font-semibold text-muted-foreground">Customer Name</label>
                <input 
                  id="customer_name" 
                  name="customer_name"
                  required
                  className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
                  placeholder="e.g. John Doe Farms" 
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="customer_phone" className="text-xs font-semibold text-muted-foreground">Phone Number</label>
                <input 
                  id="customer_phone" 
                  name="customer_phone"
                  className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
                  placeholder="e.g. +254..." 
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="location" className="text-xs font-semibold text-muted-foreground">Location <span className="font-medium">(optional)</span></label>
                <input 
                  id="location" 
                  name="location"
                  className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
                  placeholder="e.g. Kiambu" 
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="discount_amount" className="text-xs font-semibold text-muted-foreground">Discount / Bargain (KES)</label>
                <input
                  id="discount_amount"
                  name="discount_amount"
                  type="number"
                  min="0"
                  max={subtotal}
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(Number(e.target.value))}
                  className="h-9 w-full rounded-input border border-input bg-background px-3 font-mono text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
                  placeholder="0"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="quantity" className="text-xs font-semibold text-muted-foreground">Chick Quantity</label>
                <input 
                  id="quantity" 
                  name="quantity"
                  type="number" 
                  required
                  min="1"
                  value={quantity || ''}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="h-9 w-full rounded-input border border-input bg-background px-3 font-mono text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
                  placeholder="0" 
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="breed_type" className="text-xs font-semibold text-muted-foreground">Breed / Type <span className="font-medium">(optional)</span></label>
                <input
                  id="breed_type"
                  name="breed_type"
                  className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
                  placeholder="e.g. Kuroiler, Kenbro"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="price_per_chick" className="text-xs font-semibold text-muted-foreground">Price/Chick (KES)</label>
                <input 
                  id="price_per_chick" 
                  name="price_per_chick"
                  type="number" 
                  required
                  min="1"
                  value={pricePerChick}
                  onChange={(e) => setPricePerChick(Number(e.target.value))}
                  className="h-9 w-full rounded-input border border-input bg-background px-3 font-mono text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
                  placeholder="0" 
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="expected_hatch_date" className="text-xs font-semibold text-muted-foreground">Target Date / Hatch Date <span className="font-medium">(optional)</span></label>
              <input 
                id="expected_hatch_date" 
                name="expected_hatch_date"
                type="date"
                className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="notes" className="text-xs font-semibold text-muted-foreground">Notes</label>
              <textarea 
                id="notes" 
                name="notes"
                className="min-h-[72px] w-full rounded-input border border-input bg-background px-3 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
                placeholder="Vaccination requests, delivery requirements..." 
              />
            </div>

            <div className="flex items-center justify-between rounded-button border border-border bg-muted/30 p-3 text-sm">
              <span className="font-medium text-muted-foreground">Est. Total Amount:</span>
              <span className="font-bold text-primary tabular-nums">KES {total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>

            <div className="rounded-button border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-foreground">Inventory assistant</span>
                <span className="font-mono font-semibold text-primary">
                  {projectedAvailableChicks.toLocaleString()} projected available
                </span>
              </div>
              <p className="mt-1.5">
                {readyNowChicks > 0
                  ? `${readyNowChicks.toLocaleString()} chicks are ready now. The system will auto-link this order if one batch can fulfill it.`
                  : 'The system will auto-link this order when a projected batch can fulfill the requested quantity.'}
              </p>
            </div>
          </div>
          
          <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} aria-busy={loading}>
              {loading ? 'Processing...' : 'Create Booking'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
