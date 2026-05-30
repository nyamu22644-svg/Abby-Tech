'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle } from 'lucide-react'
import type { BatchReceptionInfo } from '@/types/batch-workflow.types'

interface ReceptionInfoStepProps {
  initialData: BatchReceptionInfo
  onComplete: (data: BatchReceptionInfo) => void
  formId: string
}

interface UserProfileOption {
  id: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
}

export function ReceptionInfoStep({ initialData, onComplete, formId }: ReceptionInfoStepProps) {
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

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!data.dateReceived) newErrors.dateReceived = 'Date received is required'
    if (!data.receivedBy?.trim()) newErrors.receivedBy = 'Received by is required'
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
    <form id={formId} onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dateReceived" className="text-sm font-medium">
            Date Received *
          </Label>
          <Input
            id="dateReceived"
            type="datetime-local"
            value={data.dateReceived ? new Date(data.dateReceived).toISOString().slice(0, 16) : ''}
            onChange={(e) => setData({ ...data, dateReceived: new Date(e.target.value) })}
            className={errors.dateReceived ? 'border-red-500' : ''}
          />
          {errors.dateReceived && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.dateReceived}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="receivedBy" className="text-sm font-medium">
            Received By (Staff) *
          </Label>
          <Select
            value={data.receivedBy}
            onValueChange={(value) => setData({ ...data, receivedBy: value })}
          >
            <SelectTrigger className={errors.receivedBy ? 'border-red-500' : ''}>
              <SelectValue
                placeholder={usersLoading ? 'Loading staff...' : 'Select staff member'}
              />
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
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {usersError}
            </p>
          )}
          {errors.receivedBy && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.receivedBy}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="breedType" className="text-sm font-medium">
            Breed / Type *
          </Label>
          <Input
            id="breedType"
            value={data.breedType}
            onChange={(e) => setData({ ...data, breedType: e.target.value })}
            placeholder="e.g. Layer, Broiler, Local"
            className={errors.breedType ? 'border-red-500' : ''}
          />
          {errors.breedType && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.breedType}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="totalEggsReceived" className="text-sm font-medium">
            Total Eggs Received *
          </Label>
          <Input
            id="totalEggsReceived"
            type="number"
            min="1"
            value={data.totalEggsReceived || ''}
            onChange={(e) => setData({ ...data, totalEggsReceived: parseInt(e.target.value) || 0 })}
            placeholder="e.g. 1000"
            className={errors.totalEggsReceived ? 'border-red-500' : ''}
          />
          {errors.totalEggsReceived && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.totalEggsReceived}
            </p>
          )}
        </div>

        <div className="col-span-2 space-y-2">
          <Label htmlFor="notes" className="text-sm font-medium">
            Reception Notes (Optional)
          </Label>
          <textarea
            id="notes"
            value={data.notes || ''}
            onChange={(e) => setData({ ...data, notes: e.target.value })}
            placeholder="Any special notes about the reception"
            className="w-full h-20 px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" className="bg-primary">
          Continue to Quality Inspection
        </Button>
      </div>
    </form>
  )
}
