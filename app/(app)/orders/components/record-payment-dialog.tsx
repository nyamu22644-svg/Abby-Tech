'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard } from 'lucide-react'
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
import { recordPayment } from '../actions'

export function RecordPaymentDialog({ orderId, balanceDue }: { orderId: string, balanceDue: number }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()
  const router = useRouter()

  const [amount, setAmount] = useState<number>(balanceDue)
  const [paymentMethod, setPaymentMethod] = useState('M_PESA')
  const [reference, setReference] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!acquireSubmitLock()) return
    setLoading(true)
    setError(null)
    
    try {
      const result = await recordPayment(orderId, amount, paymentMethod, reference)
      if (result.success) {
        setOpen(false)
        router.refresh()
      } else {
        setError(result.error || 'Failed to record payment')
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
        render={<Button variant="secondary" className="h-8 w-full gap-2 rounded-button px-3 text-xs font-semibold"><CreditCard className="h-4 w-4" />Log Payment</Button>}
      />
      <DialogContent className="border-border bg-popover sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-foreground tracking-tight">Record Payment</DialogTitle>
          <DialogDescription>
            Log a customer deposit or final payment.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 py-2">
          {error && (
            <div className="rounded-button border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div className="mb-4 flex items-center justify-between rounded-button border border-border bg-muted/30 p-3 text-sm">
              <span className="font-medium text-muted-foreground">Current Balance:</span>
              <span className="font-bold text-destructive tabular-nums">KES {balanceDue.toLocaleString()}</span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="amount" className="text-xs font-semibold text-muted-foreground">Amount Paid (KES)</label>
              <input 
                id="amount" 
                name="amount"
                type="number"
                required
                min="1"
                max={balanceDue}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="h-9 w-full rounded-input border border-input bg-background px-3 font-mono text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="payment_method" className="text-xs font-semibold text-muted-foreground">Payment Method</label>
                <select
                  id="payment_method"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                >
                  <option value="M_PESA">M-Pesa</option>
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CARD">Card</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="reference" className="text-xs font-semibold text-muted-foreground">Reference <span className="font-medium">(optional)</span></label>
                <input
                  id="reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="e.g. M-Pesa code"
                  className="h-9 w-full rounded-input border border-input bg-background px-3 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </div>
            </div>
            
          </div>
          
          <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} aria-busy={loading}>
              {loading ? 'Recording...' : 'Confirm Payment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
