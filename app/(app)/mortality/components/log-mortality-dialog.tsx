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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { logMortalityEvent } from '../actions'

type BatchOption = {
  id: string
  batch_number: string
}

export function LogMortalityDialog({ batches }: { batches: BatchOption[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [selectedBatch, setSelectedBatch] = useState<string>('')
  const [stage, setStage] = useState<string>('')
  const [cause, setCause] = useState<string>('')
  const router = useRouter()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    const formData = new FormData(e.currentTarget)
    formData.set('batch_id', selectedBatch)
    formData.set('stage', stage)
    formData.set('cause', cause)

    const result = await logMortalityEvent(formData)
    
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
      <DialogTrigger render={<Button>Log Mortality Event</Button>} />
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Log Mortality</DialogTitle>
          <DialogDescription>
            Record a mortality event. This will automatically update operational losses.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 py-4">
          {error && (
            <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm">{error}</div>
          )}
          
          <div className="grid gap-2">
            <Label htmlFor="batch">Associated Batch</Label>
            <Select value={selectedBatch} onValueChange={(val) => setSelectedBatch(val || '')} required>
              <SelectTrigger>
                <SelectValue placeholder="Select a batch" />
              </SelectTrigger>
              <SelectContent>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.batch_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="stage">Mortality Stage</Label>
              <Select value={stage} onValueChange={(val) => setStage(val || '')} required>
                <SelectTrigger>
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCUBATION">Incubation</SelectItem>
                  <SelectItem value="HATCHING">Hatching</SelectItem>
                  <SelectItem value="BROODER">Brooder</SelectItem>
                  <SelectItem value="TRANSPORT">Transport</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cause">Suspected Cause</Label>
              <Select value={cause} onValueChange={(val) => setCause(val || '')} required>
                <SelectTrigger>
                  <SelectValue placeholder="Cause" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OVERHEATING">Overheating</SelectItem>
                  <SelectItem value="HUMIDITY_FAILURE">Humidity Failure</SelectItem>
                  <SelectItem value="POWER_FAILURE">Power Failure</SelectItem>
                  <SelectItem value="DISEASE">Disease</SelectItem>
                  <SelectItem value="WEAK_HATCH">Weak Hatch</SelectItem>
                  <SelectItem value="DEFORMITY">Deformity</SelectItem>
                  <SelectItem value="CRUSHING">Crushing</SelectItem>
                  <SelectItem value="UNKNOWN">Unknown</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="count">Mortality Count</Label>
            <Input id="count" name="count" type="number" min="1" required placeholder="Number of losses" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Notes & Observations</Label>
            <Textarea id="notes" name="notes" placeholder="Any additional context..." />
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={loading || !selectedBatch || !stage || !cause}>
              {loading ? 'Logging...' : 'Save Mortality Form'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
