'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { isManagerOrAbove } from '@/lib/rbac'

export async function logMortalityEvent(formData: FormData) {
  const supabase = await createClient()

  // Input parsing
  const batchId = formData.get('batch_id') as string
  const stage = formData.get('stage') as any
  const cause = formData.get('cause') as any
  const count = parseInt(formData.get('count') as string, 10)
  const notes = formData.get('notes') as string || null

  if (!batchId || !stage || !cause || isNaN(count) || count <= 0) {
    return { error: 'Invalid input data' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await (supabase as any).rpc('log_mortality_event_atomic', {
    p_batch_id: batchId,
    p_stage: stage,
    p_cause: cause,
    p_count: count,
    p_notes: notes,
    p_photo_url: null,
    p_recorded_by: user?.id || null,
  })

  if (error) {
    console.error('Mortality RPC error:', error)
    return { error: error.message || 'Failed to record mortality event' }
  }

  revalidatePath('/mortality')
  revalidatePath('/batches')
  revalidatePath(`/batches/${batchId}`)
  revalidatePath('/dashboard')
  revalidatePath('/alerts')

  return { success: true }
}

export async function voidMortalityEvent(formData: FormData) {
  const user = await requireAuth()

  if (!isManagerOrAbove(user.role)) {
    return { error: 'Only a manager can void a mortality record.' }
  }

  const eventId = String(formData.get('event_id') || '')
  const reason = String(formData.get('reason') || '').trim()

  if (!eventId) {
    return { error: 'Mortality event is required.' }
  }

  if (reason.length < 8) {
    return { error: 'Enter a clear correction reason before voiding this record.' }
  }

  const supabase = await createClient()
  const { data: results, error } = await (supabase as any).rpc('void_mortality_event_atomic', {
    p_event_id: eventId,
    p_reason: reason,
    p_voided_by: user.id,
  })

  if (error) {
    console.error('Void mortality RPC error:', error)
    return { error: error.message || 'Failed to void mortality event' }
  }

  const result = Array.isArray(results) ? results[0] : results
  const batchId = result?.batch_id

  revalidatePath('/mortality')
  revalidatePath('/batches')
  if (batchId) revalidatePath(`/batches/${batchId}`)
  revalidatePath('/dashboard')
  revalidatePath('/alerts')

  return { success: true }
}
