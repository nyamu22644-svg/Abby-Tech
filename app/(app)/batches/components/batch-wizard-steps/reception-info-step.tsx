'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle } from 'lucide-react'
import type { BatchReceptionInfo } from '@/types/batch-workflow.types'
import { cn } from '@/lib/utils'

interface ReceptionInfoStepProps {
  initialData: BatchReceptionInfo
  breedOptions?: string[]
  onComplete: (data: BatchReceptionInfo) => void
  formId: string
}

interface UserProfileOption {
  id: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
}

const BREED_OPTIONS = [
  'KARI Improved Kienyeji',
  'Improved Kienyeji',
  'Broiler',
  'Layer',
  'Local Kienyeji',
]

function toLocalInputValue(value?: Date) {
  if (!value) return ''
  const date = new Date(value)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

export function ReceptionInfoStep({
  initialData,
  breedOptions = BREED_OPTIONS,
  onComplete,
  formId,
}: ReceptionInfoStepProps) {
  const [data, setData] = useState<BatchReceptionInfo>(initialData)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [users, setUsers] = useState<UserProfileOption[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState<string | null>(null)

  useEffect(() => {
    const loadUsers = async () => {
      setUsersLoading(true)
      setUsersError(null)
      const supabase = createClient()
      const { data: userRows, error } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, email')
        .order('first_name', { ascending: true })

      if (error) {
        setUsersError(error.message)
        setUsers([])
      } else {
        setUsers((userRows || []) as UserProfileOption[])
      }
      setUsersLoading(false)
    }

    loadUsers()
  }, [])

  const formatUserLabel = (user: UserProfileOption) => {
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
    return name || user.email || user.id
  }
  const selectedStaffLabel = users.find((user) => user.id === data.receivedBy)
  const staffSelectPlaceholder = usersLoading ? 'Loading staff...' : 'Optional staff account'

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!data.dateReceived) newErrors.dateReceived = 'Date and time received is required'
    if (!data.receivedByName?.trim()) newErrors.receivedByName = 'Receiver name is required'
    if (!data.breedType?.trim()) newErrors.breedType = 'Breed/Type is required'
    if (data.totalEggsReceived <= 0) newErrors.totalEggsReceived = 'Must be greater than 0'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) {
      onComplete(data)
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="dateReceived" className="text-xs font-semibold text-muted-foreground">
            Date & Time Received *
          </Label>
          <Input
            id="dateReceived"
            type="datetime-local"
            step={60}
            value={toLocalInputValue(data.dateReceived)}
            onChange={(e) => setData({ ...data, dateReceived: new Date(e.target.value) })}
            className={cn('h-9 bg-background text-sm', errors.dateReceived && 'border-destructive focus-visible:ring-destructive/20')}
          />
          <p className="text-xs text-muted-foreground">
            Use the exact local time the eggs arrived.
          </p>
          {errors.dateReceived && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.dateReceived}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="receivedByName" className="text-xs font-semibold text-muted-foreground">
            Received By *
          </Label>
          <Input
            id="receivedByName"
            value={data.receivedByName || ''}
            onChange={(e) => setData({ ...data, receivedByName: e.target.value })}
            placeholder="e.g. Receiving staff name"
            className={cn('h-9 bg-background text-sm', errors.receivedByName && 'border-destructive focus-visible:ring-destructive/20')}
          />
          {errors.receivedByName && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.receivedByName}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="receivedBy" className="text-xs font-semibold text-muted-foreground">
            Link Staff Account (Optional)
          </Label>
          <Select
            value={data.receivedBy || ''}
            onValueChange={(value) => setData({ ...data, receivedBy: value || '' })}
          >
            <SelectTrigger className={cn('h-9 w-full rounded-input border-input bg-background text-sm', errors.receivedBy && 'border-destructive focus-visible:ring-destructive/20')}>
              <SelectValue
                className={selectedStaffLabel ? undefined : 'text-muted-foreground'}
                placeholder={staffSelectPlaceholder}
              >
                {selectedStaffLabel ? formatUserLabel(selectedStaffLabel) : staffSelectPlaceholder}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {users.length === 0 ? (
                <SelectItem value="__none" disabled>
                  {usersLoading ? 'Loading staff...' : 'No staff profiles available'}
                </SelectItem>
              ) : (
                users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {formatUserLabel(user)}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {usersError && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {usersError}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="breedType" className="text-xs font-semibold text-muted-foreground">
            Breed / Type *
          </Label>
          <select
            id="breedType"
            required
            value={data.breedType}
            onChange={(e) => setData({ ...data, breedType: e.target.value })}
            className={cn(
              'h-9 w-full rounded-input border border-input bg-background px-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10',
              errors.breedType && 'border-destructive focus-visible:ring-destructive/20'
            )}
          >
            <option value="" disabled>Select breed</option>
            {breedOptions.map((breed) => (
              <option key={breed} value={breed}>{breed}</option>
            ))}
          </select>
          {errors.breedType && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.breedType}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="totalEggsReceived" className="text-xs font-semibold text-muted-foreground">
            Total Eggs Received *
          </Label>
          <Input
            id="totalEggsReceived"
            type="number"
            min="1"
            value={data.totalEggsReceived || ''}
            onChange={(e) => setData({ ...data, totalEggsReceived: parseInt(e.target.value) || 0 })}
            placeholder="e.g. 1000"
            className={cn('h-9 bg-background text-sm', errors.totalEggsReceived && 'border-destructive focus-visible:ring-destructive/20')}
          />
          {errors.totalEggsReceived && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.totalEggsReceived}
            </p>
          )}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes" className="text-xs font-semibold text-muted-foreground">
            Reception Notes (Optional)
          </Label>
          <textarea
            id="notes"
            value={data.notes || ''}
            onChange={(e) => setData({ ...data, notes: e.target.value })}
            placeholder="Any special notes about the reception"
            className="h-20 w-full rounded-input border border-input bg-background px-3 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit">
          Continue to Quality Inspection
        </Button>
      </div>
    </form>
  )
}
