'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const markVaccinationDoneSchema = z.object({
  batch_id: z.string().uuid(),
  vaccine_name: z.string().trim().min(1),
  due_day: z.coerce.number().int().min(0),
  due_date: z.string().trim().min(1),
  cost_per_chick: z.coerce.number().min(0),
  notes: z.string().trim().optional(),
})

export async function markVaccinationDone(input: {
  batchId: string
  vaccineName: string
  dueDay: number
  dueDate: string
  costPerChick: number
  notes?: string
}) {
  const parsed = markVaccinationDoneSchema.safeParse({
    batch_id: input.batchId,
    vaccine_name: input.vaccineName,
    due_day: input.dueDay,
    due_date: input.dueDate,
    cost_per_chick: input.costPerChick,
    notes: input.notes,
  })

  if (!parsed.success) {
    return { success: false, error: 'Check the vaccination details and try again.' }
  }

  const supabase = await createClient()
  const db = supabase as any
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { success: false, error: 'Sign in again before recording vaccination.' }

  const { data: profile } = await db
    .from('user_profiles')
    .select('id, tenant_id')
    .eq('id', user.id)
    .maybeSingle()

  const { data: batch, error: batchError } = await db
    .from('egg_batches')
    .select('id, tenant_id')
    .eq('id', parsed.data.batch_id)
    .maybeSingle()

  if (batchError || !batch?.id) {
    return { success: false, error: batchError?.message || 'Batch was not found.' }
  }

  const now = new Date().toISOString()
  const { error } = await db
    .from('batch_vaccination_records')
    .upsert(
      {
        tenant_id: batch.tenant_id || profile?.tenant_id || null,
        batch_id: parsed.data.batch_id,
        vaccine_name: parsed.data.vaccine_name,
        due_day: parsed.data.due_day,
        due_date: parsed.data.due_date,
        cost_per_chick: parsed.data.cost_per_chick,
        completed_at: now,
        notes: parsed.data.notes || null,
        recorded_by: profile?.id || user.id,
        updated_at: now,
      },
      { onConflict: 'batch_id,vaccine_name,due_day' }
    )

  if (error) return { success: false, error: error.message || 'Failed to record vaccination.' }

  revalidatePath('/vaccinations')
  revalidatePath('/dashboard')
  revalidatePath('/batches')
  revalidatePath(`/batches/${parsed.data.batch_id}`)

  return { success: true }
}
