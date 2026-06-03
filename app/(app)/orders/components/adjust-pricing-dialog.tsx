'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BadgePercent } from 'lucide-react'

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
import { adjustOrderPricing } from '../actions'

export function AdjustPricingDialog({
  orderId,
  quantity,
  currentUnitPrice,
  currentDiscount,
}: {
  orderId: string
  quantity: number
  currentUnitPrice: number
  currentDiscount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()
  const [pricePerChick, setPricePerChick] = useState(currentUnitPrice)
  const [discountAmount, setDiscountAmount] = useState(currentDiscount)
  const [reason, setReason] = useState('')

  const subtotal = quantity * pricePerChick
  const safeDiscount = Math.min(discountAmount || 0, subtotal)
  const total = Math.max(0, subtotal - safeDiscount)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!acquireSubmitLock()) return
    setLoading(true)
    setError(null)

    try {
      const result = await adjustOrderPricing(orderId, {
        pricePerChick,
        discountAmount: safeDiscount,
        reason,
      })

      if (!result.success) {
        setError(result.error || 'Failed to adjust price')
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
          <Button variant="outline" className="h-8 gap-2 rounded-button px-3 text-xs font-semibold">
            <BadgePercent className="h-4 w-4" />
            Adjust Price
          </Button>
        }
      />
      <DialogContent className="border-border bg-popover sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-foreground tracking-tight">Adjust Sale Price</DialogTitle>
          <DialogDescription>
            Record a bargain or discount before the order is closed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 py-2">
          {error ? (
            <div className="rounded-button border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="adjust_price_per_chick" className="text-xs font-semibold text-muted-foreground">
                Price / Chick (KES)
              </label>
              <input
                id="adjust_price_per_chick"
                type="number"
                min="0"
                required
                value={pricePerChick}
                onChange={(event) => setPricePerChick(Number(event.target.value))}
                className="h-9 w-full rounded-input border border-input bg-background px-3 font-mono text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="adjust_discount" className="text-xs font-semibold text-muted-foreground">
                Discount (KES)
              </label>
              <input
                id="adjust_discount"
                type="number"
                min="0"
                max={subtotal}
                value={discountAmount}
                onChange={(event) => setDiscountAmount(Number(event.target.value))}
                className="h-9 w-full rounded-input border border-input bg-background px-3 font-mono text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="adjust_reason" className="text-xs font-semibold text-muted-foreground">
              Reason <span className="font-medium">(optional)</span>
            </label>
            <textarea
              id="adjust_reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Customer negotiated a lower price"
              className="min-h-[72px] w-full rounded-input border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
            />
          </div>

          <div className="rounded-button border border-border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-muted-foreground">New total</span>
              <span className="font-bold text-primary tabular-nums">KES {total.toLocaleString()}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {quantity.toLocaleString()} chicks x KES {pricePerChick.toLocaleString()} minus KES {safeDiscount.toLocaleString()} discount.
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} aria-busy={loading}>
              {loading ? 'Saving...' : 'Save Adjustment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
