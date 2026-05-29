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
import { recordPayment } from '../actions'

export function RecordPaymentDialog({ orderId, balanceDue }: { orderId: string, balanceDue: number }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const [amount, setAmount] = useState<number>(balanceDue)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      const result = await recordPayment(orderId, amount)
      if (result.success) {
        setOpen(false)
        router.refresh()
      } else {
        setError(result.error || 'Failed to record payment')
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
        render={<Button variant="secondary" className="gap-2 h-9 px-4 rounded-md font-medium shadow-sm w-full"><CreditCard className="h-4 w-4" />Log Payment</Button>}
      />
      <DialogContent className="sm:max-w-[425px] border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-primary tracking-tight">Record Payment</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Log a customer deposit or final payment.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 py-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md border border-destructive/20 font-medium">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div className="bg-muted/30 border border-border p-3 rounded-md flex justify-between items-center text-sm mb-4">
              <span className="font-medium text-muted-foreground">Current Balance:</span>
              <span className="font-bold text-destructive tabular-nums">KES {balanceDue.toLocaleString()}</span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="amount" className="text-sm font-medium text-muted-foreground">Amount Paid (KES)</label>
              <input 
                id="amount" 
                name="amount"
                type="number"
                required
                min="1"
                max={balanceDue}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
              />
            </div>
            
          </div>
          
          <div className="flex justify-end pt-4 gap-2 border-t border-border mt-6">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading} className="text-muted-foreground hover:text-foreground">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {loading ? 'Recording...' : 'Confirm Payment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
