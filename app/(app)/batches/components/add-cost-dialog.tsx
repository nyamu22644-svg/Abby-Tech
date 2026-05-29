'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { addOperationalCost } from '../actions'

const CATEGORIES = [
  { value: 'ELECTRICITY', label: 'Electricity' },
  { value: 'GENERATOR_FUEL', label: 'Generator Fuel' },
  { value: 'LABOR', label: 'Labor' },
  { value: 'VACCINATION', label: 'Vaccination' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'PACKAGING', label: 'Packaging' },
  { value: 'TRANSPORT', label: 'Transport / Distribution' },
  { value: 'MEDICATION', label: 'Medication' },
  { value: 'OTHER', label: 'Other Operational Cost' },
]

export function AddCostDialog({ batchId }: { batchId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function onSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    
    try {
      const result = await addOperationalCost(formData)
      if (result.success) {
        setOpen(false)
        router.refresh()
      } else {
        setError(result.error || 'Failed to log cost')
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
        render={<Button variant="outline" size="sm" className="gap-2 h-8"><Plus className="w-3.5 h-3.5" />Log Expense</Button>} 
      />
      <DialogContent className="sm:max-w-[425px] border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-primary tracking-tight">Log Operational Expense</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Attribute an ongoing cost to this specific hatch batch.
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4 py-4">
          <input type="hidden" name="batch_id" value={batchId} />
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md border border-destructive/20 font-medium">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div className="space-y-1.5 flex flex-col">
              <label htmlFor="category" className="text-sm font-medium text-muted-foreground">Cost Category</label>
              <select
                id="category"
                name="category"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>
            
            <div className="space-y-1.5 flex flex-col">
              <label htmlFor="description" className="text-sm font-medium text-muted-foreground">Description</label>
              <input 
                id="description" 
                name="description"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="e.g. Diesel for standby power day 1-3" 
              />
            </div>
            
            <div className="space-y-1.5 flex flex-col">
              <label htmlFor="amount" className="text-sm font-medium text-muted-foreground">Amount (KES)</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input 
                  id="amount" 
                  name="amount"
                  type="number" 
                  step="0.01"
                  required
                  min="0.01"
                  className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                  placeholder="0.00" 
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-end pt-4 gap-2 border-t border-border mt-6">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading} className="text-muted-foreground hover:text-foreground">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {loading ? 'Logging...' : 'Log Expense'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
