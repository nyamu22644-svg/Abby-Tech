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
import { createOrder } from '../actions'

export function CreateOrderDialog() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const [pricePerChick, setPricePerChick] = useState(130)
  const [quantity, setQuantity] = useState<number>()

  async function onSubmit(formData: FormData) {
    setLoading(true)
    setError(null)

    try {
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
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger 
        render={<Button className="h-9 px-4 rounded-md font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm gap-2"><Plus className="w-4 h-4" />Create Order</Button>}
      />
      <DialogContent className="sm:max-w-[425px] border-border bg-card max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-primary tracking-tight">New Booking / Order</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Create a new chick reservation.
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4 py-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md border border-destructive/20 font-medium">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <label htmlFor="customer_name" className="text-sm font-medium text-muted-foreground">Customer Name</label>
                <input 
                  id="customer_name" 
                  name="customer_name"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="e.g. John Doe Farms" 
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="customer_phone" className="text-sm font-medium text-muted-foreground">Phone Number</label>
                <input 
                  id="customer_phone" 
                  name="customer_phone"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="e.g. +254..." 
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="location" className="text-sm font-medium text-muted-foreground">Location (<span className="text-[10px] uppercase">optional</span>)</label>
                <input 
                  id="location" 
                  name="location"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="e.g. Kiambu" 
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="quantity" className="text-sm font-medium text-muted-foreground">Chick Quantity</label>
                <input 
                  id="quantity" 
                  name="quantity"
                  type="number" 
                  required
                  min="1"
                  value={quantity || ''}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                  placeholder="0" 
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="price_per_chick" className="text-sm font-medium text-muted-foreground">Price/Chick (KES)</label>
                <input 
                  id="price_per_chick" 
                  name="price_per_chick"
                  type="number" 
                  required
                  min="1"
                  value={pricePerChick}
                  onChange={(e) => setPricePerChick(Number(e.target.value))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                  placeholder="0" 
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="expected_hatch_date" className="text-sm font-medium text-muted-foreground">Target Date / Hatch Date (<span className="text-[10px] uppercase">optional</span>)</label>
              <input 
                id="expected_hatch_date" 
                name="expected_hatch_date"
                type="date"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="notes" className="text-sm font-medium text-muted-foreground">Notes</label>
              <textarea 
                id="notes" 
                name="notes"
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Vaccination requests, delivery requirements..." 
              />
            </div>

            <div className="bg-muted/30 border border-border p-3 rounded-md flex justify-between items-center text-sm">
              <span className="font-medium text-muted-foreground">Est. Total Amount:</span>
              <span className="font-bold text-primary tabular-nums">KES {((quantity || 0) * pricePerChick).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
          </div>
          
          <div className="flex justify-end pt-4 gap-2 border-t border-border mt-6">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading} className="text-muted-foreground hover:text-foreground">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {loading ? 'Processing...' : 'Create Booking'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
