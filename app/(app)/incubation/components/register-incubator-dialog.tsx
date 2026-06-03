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
import { useSubmitLock } from '@/hooks/use-submit-lock'
import { createIncubator } from '../actions'

const XD_COLUMNS = 6
const XD_ROWS = 2
const XD_EGGS_PER_SLOT = 88
const XD_CAPACITY = XD_COLUMNS * XD_ROWS * XD_EGGS_PER_SLOT

export function RegisterIncubatorDialog() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()
  
  const router = useRouter()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!acquireSubmitLock()) return
    setLoading(true)
    setError(null)
    
    const formData = new FormData(e.currentTarget)
    try {
      const result = await createIncubator(formData)

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
      <DialogTrigger render={<Button>Register Incubator Machine</Button>} />
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Register Incubator Machine</DialogTitle>
          <DialogDescription>
            Add the physical machine. Its internal tray layout is used automatically during placement.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 py-4">
          <input type="hidden" name="incubator_type" value="SETTER" />
          <input type="hidden" name="capacity" value={XD_CAPACITY} />

          {error && (
            <div className="rounded-card bg-destructive/15 p-3 text-sm text-destructive">{error}</div>
          )}
          
          <div className="grid gap-2">
            <Label htmlFor="name">Machine Name</Label>
            <Input id="name" name="name" required placeholder="e.g. Automatic XD 18" />
          </div>

          <div className="rounded-card border border-border bg-muted/20 p-3">
            <div className="mb-3">
              <p className="text-sm font-medium text-foreground">Internal Egg Layout</p>
              <p className="text-xs text-muted-foreground">
                This is the tray map inside the machine, not separate incubator units.
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-button border border-border bg-background p-2">
                <p className="text-lg font-semibold text-primary">{XD_COLUMNS}</p>
                <p className="text-[11px] text-muted-foreground">columns</p>
              </div>
              <div className="rounded-button border border-border bg-background p-2">
                <p className="text-lg font-semibold text-primary">{XD_ROWS}</p>
                <p className="text-[11px] text-muted-foreground">rows</p>
              </div>
              <div className="rounded-button border border-border bg-background p-2">
                <p className="text-lg font-semibold text-primary">{XD_EGGS_PER_SLOT}</p>
                <p className="text-[11px] text-muted-foreground">per slot</p>
              </div>
              <div className="rounded-button border border-border bg-background p-2">
                <p className="text-lg font-semibold text-primary">{XD_CAPACITY}</p>
                <p className="text-[11px] text-muted-foreground">eggs</p>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="model_number">Model Number <span className="text-muted-foreground font-normal">(Optional)</span></Label>
            <Input id="model_number" name="model_number" placeholder="e.g. XD 18" />
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={loading} aria-busy={loading}>
              {loading ? 'Registering...' : 'Register Machine'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
