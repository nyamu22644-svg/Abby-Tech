'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Activity } from 'lucide-react'
import { assignBatchToIncubator } from '../actions'

export function AssignBatchDialog({ 
  incubators, 
  activeBatches, 
  unassignedBatches 
}: { 
  incubators: any[], 
  activeBatches: any[], 
  unassignedBatches: any[] 
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  // Combine batches for selector
  const allAvailableBatches = [...unassignedBatches, ...activeBatches]

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    const formData = new FormData(e.currentTarget)
    const result = await assignBatchToIncubator(formData)
    
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    } else {
      setLoading(false)
      setOpen(false)
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><Activity className="w-4 h-4 mr-2"/>Assign / Update Phase</Button>} />
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Assign Batch or Update Phase</DialogTitle>
          <DialogDescription>
            Assign a batch to an incubator unit or update its incubation phase.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 py-4">
          {error && (
            <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm">{error}</div>
          )}
          
          <div className="grid gap-2">
            <Label htmlFor="batch_id">Select Batch</Label>
            <Select name="batch_id" required>
              <SelectTrigger>
                <SelectValue placeholder="Select a batch" />
              </SelectTrigger>
              <SelectContent>
                {allAvailableBatches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.batch_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="phase">Incubation Phase</Label>
            <Select name="phase" defaultValue="SETTER" required>
              <SelectTrigger>
                <SelectValue placeholder="Phase" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SETTER">Setter (Incubation)</SelectItem>
                <SelectItem value="HATCHER">Hatcher (Lockdown / Hatch)</SelectItem>
                <SelectItem value="BROODER">Brooder (Post-hatch)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="incubator_id">Target Incubator Unit</Label>
            <Select name="incubator_id" required>
              <SelectTrigger>
                <SelectValue placeholder="Select equipment..." />
              </SelectTrigger>
              <SelectContent>
                {incubators.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name} ({i.controller_type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={loading || incubators.length === 0}>
              {loading ? 'Processing...' : 'Assign/Update'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
