'use client'

import { useMemo, useState } from 'react'
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
  defaultChickPrice?: number
  breedOptions?: string[]
  customers?: CustomerOption[]
  allocationCandidates?: AllocationCandidate[]
}

type CustomerOption = {
  id: string
  name: string
  phone: string
  location: string
  preferredBreed: string
  preferredPaymentMethod: string
  notes: string
  lastPricePerChick: number | null
}

type AllocationCandidate = {
  id: string
  batchNumber: string
  breedType?: string | null
  status: string
  expectedHatchDate?: string | null
  available: number
  baseQuantity: number
  allocated: number
  estimatedCostPerChick: number | null
}

export function CreateOrderDialog({
  projectedAvailableChicks = 0,
  readyNowChicks = 0,
  defaultChickPrice = 130,
  breedOptions = [],
  customers = [],
  allocationCandidates = [],
}: CreateOrderDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()
  const router = useRouter()

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [location, setLocation] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [pricePerChick, setPricePerChick] = useState(defaultChickPrice)
  const [quantity, setQuantity] = useState<number>()
  const [discountAmount, setDiscountAmount] = useState(0)
  const [selectedBreed, setSelectedBreed] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const subtotal = (quantity || 0) * pricePerChick
  const safeDiscount = Math.min(discountAmount || 0, subtotal)
  const total = Math.max(0, subtotal - safeDiscount)
  const netPricePerChick = quantity && quantity > 0 ? total / quantity : 0
  const normalizedName = customerName.trim().toLowerCase()
  const normalizedPhone = normalizePhone(customerPhone)

  const exactPhoneMatch = useMemo(() => {
    if (!normalizedPhone) return null
    return customers.find((customer) => normalizePhone(customer.phone) === normalizedPhone) || null
  }, [customers, normalizedPhone])

  const customerSuggestions = useMemo(() => {
    const query = `${normalizedName} ${normalizedPhone}`.trim()
    if (!query) return []

    return customers
      .filter((customer) => {
        const customerPhoneValue = normalizePhone(customer.phone)
        const customerNameValue = customer.name.toLowerCase()
        return (
          (normalizedName && customerNameValue.includes(normalizedName)) ||
          (normalizedPhone && customerPhoneValue.includes(normalizedPhone))
        )
      })
      .slice(0, 4)
  }, [customers, normalizedName, normalizedPhone])

  const allocationPreview = useMemo(() => {
    if (!selectedBreed || !quantity || quantity <= 0) return null

    const requestedAt = targetDate ? new Date(targetDate).getTime() : null
    const matching = allocationCandidates
      .filter((batch) => batch.available >= quantity)
      .filter((batch) => isBreedMatch(batch.breedType, selectedBreed))

    const dateMatched = requestedAt
      ? matching.filter((batch) => {
          if (['COMPLETED', 'BROODER'].includes(batch.status || '')) return true
          if (!batch.expectedHatchDate) return false
          return new Date(batch.expectedHatchDate).getTime() <= requestedAt
        })
      : matching

    const pool = dateMatched.length > 0 ? dateMatched : matching
    return pool.sort((a, b) => {
      const aReady = ['COMPLETED', 'BROODER'].includes(a.status || '') ? 0 : 1
      const bReady = ['COMPLETED', 'BROODER'].includes(b.status || '') ? 0 : 1
      if (aReady !== bReady) return aReady - bReady

      const aDate = a.expectedHatchDate ? new Date(a.expectedHatchDate).getTime() : Number.MAX_SAFE_INTEGER
      const bDate = b.expectedHatchDate ? new Date(b.expectedHatchDate).getTime() : Number.MAX_SAFE_INTEGER
      if (aDate !== bDate) return aDate - bDate

      return a.available - b.available
    })[0] || null
  }, [allocationCandidates, quantity, selectedBreed, targetDate])

  const profitWarning = useMemo(() => {
    if (!allocationPreview || !quantity || quantity <= 0) return null
    const estimatedCost = Number(allocationPreview.estimatedCostPerChick || 0)
    if (estimatedCost <= 0) return null
    if (netPricePerChick >= estimatedCost) return null

    return {
      estimatedCost,
      shortfall: estimatedCost - netPricePerChick,
    }
  }, [allocationPreview, netPricePerChick, quantity])

  const selectCustomer = (customer: CustomerOption) => {
    setSelectedCustomerId(customer.id)
    setCustomerName(customer.name)
    setCustomerPhone(customer.phone || '')
    setLocation(customer.location || '')
    if (customer.preferredBreed && breedOptions.some((breed) => normalizeBreed(breed) === normalizeBreed(customer.preferredBreed))) {
      setSelectedBreed(breedOptions.find((breed) => normalizeBreed(breed) === normalizeBreed(customer.preferredBreed)) || customer.preferredBreed)
    }
    if (customer.lastPricePerChick) {
      setPricePerChick(customer.lastPricePerChick)
    }
  }

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
        setCustomerName('')
        setCustomerPhone('')
        setLocation('')
        setSelectedCustomerId('')
        setSelectedBreed('')
        setQuantity(undefined)
        setDiscountAmount(0)
        setTargetDate('')
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
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value)
                    setSelectedCustomerId('')
                  }}
                  className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
                  placeholder="e.g. John Doe Farms" 
                />
                {customerSuggestions.length > 0 && (
                  <div className="mt-2 rounded-button border border-border bg-card p-2">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Existing customers</p>
                    <div className="space-y-1">
                      {customerSuggestions.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => selectCustomer(customer)}
                          className="flex w-full items-center justify-between gap-3 rounded-button px-2 py-1.5 text-left text-xs hover:bg-muted/60"
                        >
                          <span>
                            <span className="block font-semibold text-foreground">{customer.name}</span>
                            <span className="text-muted-foreground">{[customer.phone, customer.location].filter(Boolean).join(' / ')}</span>
                          </span>
                          <span className="text-primary">Use</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {selectedCustomerId && (
                  <p className="mt-1 text-xs font-medium text-success">Existing customer selected. Details were filled automatically.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="customer_phone" className="text-xs font-semibold text-muted-foreground">Phone Number</label>
                <input 
                  id="customer_phone" 
                  name="customer_phone"
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value)
                    setSelectedCustomerId('')
                  }}
                  className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
                  placeholder="e.g. +254..." 
                />
                {exactPhoneMatch && !selectedCustomerId && (
                  <button
                    type="button"
                    onClick={() => selectCustomer(exactPhoneMatch)}
                    className="mt-1 text-left text-xs font-medium text-primary hover:underline"
                  >
                    Phone exists for {exactPhoneMatch.name}. Click to reuse this customer.
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="location" className="text-xs font-semibold text-muted-foreground">Location <span className="font-medium">(optional)</span></label>
                <input 
                  id="location" 
                  name="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
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
                <label htmlFor="breed_type" className="text-xs font-semibold text-muted-foreground">Breed / Type</label>
                <select
                  id="breed_type"
                  name="breed_type"
                  required
                  value={selectedBreed}
                  onChange={(event) => setSelectedBreed(event.target.value)}
                  className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
                >
                  <option value="" disabled>Select breed</option>
                  {breedOptions.map((breed) => (
                    <option key={breed} value={breed}>{breed}</option>
                  ))}
                </select>
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
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
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

            {profitWarning && (
              <div className="rounded-button border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                <div className="font-semibold">Low profit warning</div>
                <p className="mt-1">
                  This price is about KES {profitWarning.shortfall.toLocaleString(undefined, { maximumFractionDigits: 0 })} below the estimated cost per chick from {allocationPreview?.batchNumber}. Review the price before saving.
                </p>
              </div>
            )}

            <div className="rounded-button border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-foreground">Inventory assistant</span>
                <span className="font-mono font-semibold text-primary">
                  {projectedAvailableChicks.toLocaleString()} projected available
                </span>
              </div>
              <p className="mt-1.5">
                {allocationPreview
                  ? `${allocationPreview.batchNumber} will be linked automatically. It has ${allocationPreview.available.toLocaleString()} ${selectedBreed} chicks projected${allocationPreview.expectedHatchDate ? ` for ${formatDate(allocationPreview.expectedHatchDate)}` : ''}.`
                  : selectedBreed && quantity
                    ? `No single ${selectedBreed} batch can fully cover ${quantity.toLocaleString()} chicks yet. The order will need manual follow-up.`
                    : readyNowChicks > 0
                      ? `${readyNowChicks.toLocaleString()} chicks are ready now. Select breed and quantity to preview the batch.`
                      : 'Select breed and quantity to preview the exact batch allocation.'}
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

function normalizePhone(value?: string | null) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeBreed(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function isBreedMatch(batchBreed?: string | null, requestedBreed?: string | null) {
  const batchValue = normalizeBreed(batchBreed)
  const requestedValue = normalizeBreed(requestedBreed)
  if (!requestedValue) return true
  if (!batchValue) return false
  return batchValue === requestedValue || batchValue.includes(requestedValue) || requestedValue.includes(batchValue)
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'the expected hatch date' : date.toLocaleDateString()
}
