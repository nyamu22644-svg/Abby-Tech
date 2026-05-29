'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createBatch } from '../actions'
import { toast } from 'sonner'

export function CreateBatchDialog() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  
  // Real-time calculation state
  const [qty, setQty] = useState<number>(0)
  const [eggCost, setEggCost] = useState<number>(0)
  const [transportCost, setTransportCost] = useState<number>(0)
  const [miscCost, setMiscCost] = useState<number>(0)
  
  const totalCost = eggCost + transportCost + miscCost
  const costPerEgg = qty > 0 ? totalCost / qty : 0
  
  const router = useRouter()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    
    const formData = new FormData(e.currentTarget)
    
    try {
      const result = await createBatch(formData)
      if (result.success) {
        toast.success('Egg batch created successfully')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to create batch')
      }
    } catch (err) {
      console.error(err)
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger 
        render={<Button className="h-9 px-4 rounded-md font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm gap-2"><Plus className="w-4 h-4" />New Batch</Button>} 
      />
      <DialogContent className="sm:max-w-[550px] border-border bg-card max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-primary tracking-tight">Log New Egg Batch</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Enter supplier details and initial financial economics.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-6 py-4">
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground border-b border-border pb-2">Operational Details</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 flex flex-col">
                <Label htmlFor="batch_number" className="text-sm font-medium text-muted-foreground">Batch ID</Label>
                <Input 
                  id="batch_number" 
                  name="batch_number"
                  required
                  className="h-10 w-full"
                  placeholder="e.g. BCH-2026-004" 
                />
              </div>
              <div className="space-y-1.5 flex flex-col">
                <Label htmlFor="supplier_name" className="text-sm font-medium text-muted-foreground">Supplier Name</Label>
                <Input 
                  id="supplier_name" 
                  name="supplier_name"
                  required
                  className="h-10 w-full"
                  placeholder="e.g. Kenchic Ltd" 
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 flex flex-col">
                <Label htmlFor="quantity" className="text-sm font-medium text-muted-foreground">Egg Quantity</Label>
                <Input 
                  id="quantity" 
                  name="quantity"
                  type="number" 
                  required
                  min="1"
                  value={qty || ''}
                  onChange={(e) => setQty(Number(e.target.value))}
                  className="h-10 w-full"
                  placeholder="0" 
                />
              </div>
              <div className="space-y-1.5 flex flex-col">
                <Label htmlFor="status" className="text-sm font-medium text-muted-foreground">Initial Status</Label>
                <select 
                  id="status" 
                  name="status"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:opacity-50"
                  defaultValue="RECEIVED"
                >
                  <option value="RECEIVED">Received</option>
                  <option value="STORED">Stored</option>
                  <option value="EARLY_INCUBATION">Early Incubation</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground border-b border-border pb-2">Financial Initial Investment</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5 flex flex-col">
                <Label htmlFor="egg_purchase_cost" className="text-sm font-medium text-muted-foreground">Egg Cost (KES)</Label>
                <Input 
                  id="egg_purchase_cost" 
                  name="egg_purchase_cost"
                  type="number" 
                  min="0"
                  step="0.01"
                  value={eggCost || ''}
                  onChange={(e) => setEggCost(Number(e.target.value))}
                  className="h-10 w-full"
                  placeholder="0" 
                />
              </div>
              <div className="space-y-1.5 flex flex-col">
                <Label htmlFor="transport_cost" className="text-sm font-medium text-muted-foreground">Transport (KES)</Label>
                <Input 
                  id="transport_cost" 
                  name="transport_cost"
                  type="number" 
                  min="0"
                  step="0.01"
                  value={transportCost || ''}
                  onChange={(e) => setTransportCost(Number(e.target.value))}
                  className="h-10 w-full"
                  placeholder="0" 
                />
              </div>
              <div className="space-y-1.5 flex flex-col">
                <Label htmlFor="misc_initial_cost" className="text-sm font-medium text-muted-foreground">Misc (KES)</Label>
                <Input 
                  id="misc_initial_cost" 
                  name="misc_initial_cost"
                  type="number" 
                  min="0"
                  step="0.01"
                  value={miscCost || ''}
                  onChange={(e) => setMiscCost(Number(e.target.value))}
                  className="h-10 w-full"
                  placeholder="0" 
                />
              </div>
            </div>

            <div className="bg-muted/30 border border-border p-3 rounded-md flex justify-between items-center text-sm">
              <span className="font-medium text-muted-foreground">Total Initial Cost:</span>
              <span className="font-bold text-primary tabular-nums">KES {totalCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
            <div className="bg-muted/30 border border-border p-3 rounded-md flex justify-between items-center text-sm">
              <span className="font-medium text-muted-foreground">Avg Cost Per Egg:</span>
              <span className="font-mono font-medium text-foreground tabular-nums">KES {costPerEgg.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
          </div>
          
          <div className="flex justify-end pt-4 gap-2 border-t border-border mt-6">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading} className="text-muted-foreground hover:text-foreground">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {loading ? 'Creating...' : 'Log Batch & Costs'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
