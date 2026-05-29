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
import { createIncubator } from '../actions'

export function RegisterIncubatorDialog() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    const formData = new FormData(e.currentTarget)
    const result = await createIncubator(formData)
    
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
      <DialogTrigger render={<Button>Register Incubator Unit</Button>} />
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Register Incubator Unit</DialogTitle>
          <DialogDescription>
            Add a new automatic or manual incubator to the registry.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 py-4">
          {error && (
            <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm">{error}</div>
          )}
          
          <div className="grid gap-2">
            <Label htmlFor="name">Incubator Unit Name</Label>
            <Input id="name" name="name" required placeholder="e.g. Main Automatic Incubator" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="controller_type">Controller Type</Label>
              <Select name="controller_type" defaultValue="AUTOMATIC" required>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTOMATIC">Automatic All-in-One</SelectItem>
                  <SelectItem value="HYBRID">Hybrid</SelectItem>
                  <SelectItem value="MANUAL">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="capacity">Egg Capacity</Label>
              <Input id="capacity" name="capacity" type="number" min="1" required placeholder="e.g. 1006" />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="model_number">Model Number <span className="text-muted-foreground font-normal">(Optional)</span></Label>
            <Input id="model_number" name="model_number" placeholder="e.g. XM-18D" />
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? 'Registering...' : 'Register Unit'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
