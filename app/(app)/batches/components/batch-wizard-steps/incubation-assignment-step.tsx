'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { BatchIncubationAssignment } from '@/types/batch-workflow.types'

interface IncubationAssignmentStepProps {
  initialData?: BatchIncubationAssignment
  onComplete: (data: BatchIncubationAssignment) => void
  onSkip: () => void
  formId: string
}

interface UserProfileOption {
  id: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
}

interface IncubatorOption {
  id: string
  name: string
  unit_code: string | null
  type: string
}

export function IncubationAssignmentStep({
  initialData,
  onComplete,
  onSkip,
  formId,
}: IncubationAssignmentStepProps) {
  const [data, setData] = useState<BatchIncubationAssignment>(
    initialData || {
      incubatorId: '',
      setDate: new Date(),
      expectedHatchDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 21 days default
    }
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [users, setUsers] = useState<UserProfileOption[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [incubators, setIncubators] = useState<IncubatorOption[]>([])
  const [incubatorsLoading, setIncubatorsLoading] = useState(true)
  const [incubatorsError, setIncubatorsError] = useState<string | null>(null)

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

  useEffect(() => {
    const loadIncubators = async () => {
      setIncubatorsLoading(true)
      setIncubatorsError(null)
      const supabase = createClient()
      const { data: incubatorRows, error } = await supabase
        .from('incubators')
        .select('id, name, unit_code, type')
        .is('deleted_at', null)
        .eq('operational_status', 'ACTIVE')
        .order('unit_code', { ascending: true })

      if (error) {
        setIncubatorsError(error.message)
        setIncubators([])
      } else {
        setIncubators((incubatorRows || []) as IncubatorOption[])
      }
      setIncubatorsLoading(false)
    }

    loadIncubators()
  }, [])

  const formatUserLabel = (user: UserProfileOption) => {
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
    return name || user.email || user.id
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!data.incubatorId?.trim()) newErrors.incubatorId = 'Incubator is required'
    if (!data.setDate) newErrors.setDate = 'Set date is required'
    if (!data.expectedHatchDate) newErrors.expectedHatchDate = 'Expected hatch date is required'
    if (data.expectedHatchDate <= data.setDate) {
      newErrors.expectedHatchDate = 'Hatch date must be after set date'
    }

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
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Optional Step</p>
          <p className="text-xs text-blue-800 dark:text-blue-200 mt-1">
            You can assign this batch to an incubator now or do it later. Skip this step if you want to assign
            later.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="incubatorId" className="text-sm font-medium">
            Incubator Unit *
          </Label>
          <Select
            value={data.incubatorId || ''}
            onValueChange={(value) =>
              setData({ ...data, incubatorId: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={incubatorsLoading ? 'Loading units...' : 'Select incubator'} />
            </SelectTrigger>
            <SelectContent>
              {incubators.length === 0 ? (
                <SelectItem value="__none" disabled>
                  {incubatorsLoading ? 'Loading units...' : 'No active incubators available'}
                </SelectItem>
              ) : (
                incubators.map((inc) => (
                  <SelectItem key={inc.id} value={inc.id}>
                    {inc.unit_code} - {inc.name} ({inc.type})
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {errors.incubatorId && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.incubatorId}
            </p>
          )}
          {incubatorsError && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {incubatorsError}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="responsibleTechnician" className="text-sm font-medium">
            Responsible Technician (Optional)
          </Label>
          <Select
            value={data.responsibleTechnician || ''}
            onValueChange={(value) =>
              setData({ ...data, responsibleTechnician: value || undefined })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={usersLoading ? 'Loading staff...' : 'Select technician'} />
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
        </div>

        <div className="space-y-2">
          <Label htmlFor="setDate" className="text-sm font-medium">
            Set Date *
          </Label>
          <Input
            id="setDate"
            type="datetime-local"
            value={data.setDate ? new Date(data.setDate).toISOString().slice(0, 16) : ''}
            onChange={(e) => setData({ ...data, setDate: new Date(e.target.value) })}
            className={errors.setDate ? 'border-red-500' : ''}
          />
          {errors.setDate && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.setDate}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="expectedHatchDate" className="text-sm font-medium">
            Expected Hatch Date *
          </Label>
          <Input
            id="expectedHatchDate"
            type="datetime-local"
            value={
              data.expectedHatchDate
                ? new Date(data.expectedHatchDate).toISOString().slice(0, 16)
                : ''
            }
            onChange={(e) => setData({ ...data, expectedHatchDate: new Date(e.target.value) })}
            className={errors.expectedHatchDate ? 'border-red-500' : ''}
          />
          {errors.expectedHatchDate && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.expectedHatchDate}
            </p>
          )}
        </div>

        <div className="col-span-2 space-y-2">
          <Label htmlFor="notes" className="text-sm font-medium">
            Assignment Notes (Optional)
          </Label>
          <textarea
            id="notes"
            value={data.assignmentNotes || ''}
            onChange={(e) => setData({ ...data, assignmentNotes: e.target.value })}
            placeholder="Any special instructions or notes for this batch..."
            className="w-full h-20 px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onSkip}>
          Skip for Now
        </Button>
        <Button type="submit" className="bg-primary">
          Continue to Review
        </Button>
      </div>
    </form>
  )
}
