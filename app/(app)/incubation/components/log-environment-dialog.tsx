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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useSubmitLock } from '@/hooks/use-submit-lock'
import { Thermometer } from 'lucide-react'
import { logEnvironmentInfo } from '../actions'

export function LogEnvironmentDialog({ incubators }: { incubators: any[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIncubator, setSelectedIncubator] = useState('')
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()
  
  const router = useRouter()
  const selectedIncubatorLabel = incubators.find((incubator) => incubator.id === selectedIncubator)?.name

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!acquireSubmitLock()) return
    setLoading(true)
    setError(null)
    
    const formData = new FormData(e.currentTarget)
    try {
      const result = await logEnvironmentInfo(formData)

      if (result?.error) {
        setError(result.error)
      } else {
        setOpen(false)
        router.refresh()
      }
    } finally {
      releaseSubmitLock()
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline"><Thermometer className="w-4 h-4 mr-2"/>Log Telemetry</Button>} />
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Log Environmental Data</DialogTitle>
          <DialogDescription>
            Record manual telemetry. Critical values will trigger alerts.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 py-4">
          {error && (
            <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm">{error}</div>
          )}
          
          <div className="grid gap-2">
            <Label htmlFor="incubator_id">Incubator Unit</Label>
            <Select
              name="incubator_id"
              value={selectedIncubator}
              onValueChange={(value) => setSelectedIncubator(value || '')}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Incubator">
                  {selectedIncubatorLabel || 'Select Incubator'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {incubators.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="temperature">Temperature (°C)</Label>
              <Input id="temperature" name="temperature" type="number" step="0.1" required placeholder="e.g. 37.5" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="humidity">Humidity (%)</Label>
              <Input id="humidity" name="humidity" type="number" step="0.1" required placeholder="e.g. 60.0" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="turning_status">Automatic Turning</Label>
              <Select name="turning_status" defaultValue="ACTIVE">
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active / On</SelectItem>
                  <SelectItem value="DISABLED">Disabled / Off</SelectItem>
                  <SelectItem value="FAULT">Fault</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="power_source">Power Source</Label>
              <Select name="power_source" defaultValue="GRID">
                <SelectTrigger>
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GRID">Grid AC</SelectItem>
                  <SelectItem value="GENERATOR">Generator</SelectItem>
                  <SelectItem value="BATTERY">Battery Backup</SelectItem>
                  <SelectItem value="SOLAR">Solar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Operational Notes</Label>
            <Textarea id="notes" name="notes" placeholder="Condition notes..." />
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={loading || incubators.length === 0} aria-busy={loading}>
              {loading ? 'Recording...' : 'Record Telemetry'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
