'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, HandCoins, Truck } from 'lucide-react'

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
import { completeOrderHandover } from '../actions'

export function CompleteHandoverDialog({
  orderId,
  customerName,
  customerPhone,
  customerLocation,
  remainingQuantity,
  compact = false,
}: {
  orderId: string
  customerName: string
  customerPhone?: string
  customerLocation?: string
  remainingQuantity?: number
  compact?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()
  const [handoverType, setHandoverType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP')
  const [contactName, setContactName] = useState(customerName || '')
  const [contactPhone, setContactPhone] = useState(customerPhone || '')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [handoverQuantity, setHandoverQuantity] = useState(remainingQuantity || 0)
  const [notes, setNotes] = useState('')

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!acquireSubmitLock()) return
    setLoading(true)
    setError(null)

    try {
      const result = await completeOrderHandover(orderId, {
        handoverType,
        contactName,
        contactPhone,
        vehicleNumber,
        handoverQuantity: remainingQuantity ? handoverQuantity : undefined,
        notes: buildHandoverNotes(notes, handoverType, customerLocation),
      })

      if (!result.success) {
        setError(result.error || 'Failed to complete pickup or delivery')
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
          <Button className={compact ? 'h-8 gap-2 rounded-button px-3 text-xs font-semibold' : 'gap-2'}>
            <HandCoins className="h-4 w-4" />
            Complete Pickup / Delivery
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground tracking-tight">
            <Truck className="h-4 w-4 text-primary" />
            Complete Pickup / Delivery
          </DialogTitle>
          <DialogDescription>
            Record who took the chicks and close this sale.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 py-2">
          {error ? (
            <div className="rounded-button border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 rounded-button border border-border bg-muted/20 p-1">
            <button
              type="button"
              onClick={() => setHandoverType('PICKUP')}
              className={`rounded-button px-3 py-2 text-sm font-semibold transition ${
                handoverType === 'PICKUP' ? 'bg-primary text-primary-foreground shadow-[var(--shadow-card)]' : 'text-muted-foreground'
              }`}
            >
              Pickup
            </button>
            <button
              type="button"
              onClick={() => setHandoverType('DELIVERY')}
              className={`rounded-button px-3 py-2 text-sm font-semibold transition ${
                handoverType === 'DELIVERY' ? 'bg-primary text-primary-foreground shadow-[var(--shadow-card)]' : 'text-muted-foreground'
              }`}
            >
              Delivery
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="handover_contact" className="text-xs font-semibold text-muted-foreground">
                {handoverType === 'PICKUP' ? 'Collected By' : 'Delivered To'}
              </label>
              <input
                id="handover_contact"
                required
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="handover_phone" className="text-xs font-semibold text-muted-foreground">Phone <span className="font-medium">(optional)</span></label>
              <input
                id="handover_phone"
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
            </div>
          </div>

          {remainingQuantity ? (
            <div className="space-y-1.5">
              <label htmlFor="handover_quantity" className="text-xs font-semibold text-muted-foreground">
                Chicks Handed Over
              </label>
              <input
                id="handover_quantity"
                type="number"
                min="1"
                max={remainingQuantity}
                required
                value={handoverQuantity || ''}
                onChange={(event) => setHandoverQuantity(Number(event.target.value))}
                className="h-9 w-full rounded-input border border-input bg-background px-3 font-mono text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
              <p className="text-xs text-muted-foreground">
                {remainingQuantity.toLocaleString()} chicks remain on this order. Enter a smaller number for partial pickup or delivery.
              </p>
            </div>
          ) : null}

          {handoverType === 'DELIVERY' ? (
            <>
              {customerLocation ? (
                <div className="rounded-button border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-primary">
                  Delivery location: <span className="font-semibold">{customerLocation}</span>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <label htmlFor="vehicle_number" className="text-xs font-semibold text-muted-foreground">Vehicle / Rider <span className="font-medium">(optional)</span></label>
                <input
                  id="vehicle_number"
                  value={vehicleNumber}
                  onChange={(event) => setVehicleNumber(event.target.value)}
                  placeholder="Vehicle number, rider, or delivery reference"
                  className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </div>
            </>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="handover_notes" className="text-xs font-semibold text-muted-foreground">Notes <span className="font-medium">(optional)</span></label>
            <textarea
              id="handover_notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Condition, packaging, delivery notes..."
              className="min-h-[72px] w-full rounded-input border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} aria-busy={loading}>
              {loading ? 'Completing...' : 'Close Sale'}
              {!loading ? <CheckCircle2 className="h-4 w-4" /> : null}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function buildHandoverNotes(notes: string, handoverType: 'PICKUP' | 'DELIVERY', customerLocation?: string) {
  const trimmedNotes = notes.trim()
  if (handoverType !== 'DELIVERY' || !customerLocation) return trimmedNotes

  const locationNote = `Delivery location: ${customerLocation}`
  return trimmedNotes ? `${locationNote}. ${trimmedNotes}` : locationNote
}
