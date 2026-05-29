'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createIncubator(formData: FormData) {
  const supabase = await createClient()
  
  const name = formData.get('name') as string
  const controller_type = formData.get('controller_type') as string || 'AUTOMATIC'
  const model_number = formData.get('model_number') as string || null
  const capacity = parseInt(formData.get('capacity') as string, 10)

  if (!name || isNaN(capacity) || capacity <= 0) {
    return { error: 'Invalid input data' }
  }

  const { error } = await supabase.from('incubators').insert({
    name,
    controller_type: controller_type as any,
    model_number,
    capacity,
    automation_capable: true
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/incubation')
  return { success: true }
}

export async function logEnvironmentInfo(formData: FormData) {
  const supabase = await createClient()

  const incubator_id = formData.get('incubator_id') as string
  const temperature = parseFloat(formData.get('temperature') as string)
  const humidity = parseFloat(formData.get('humidity') as string)
  const turning_status = formData.get('turning_status') as string || null
  const power_source = formData.get('power_source') as string || null
  const notes = formData.get('notes') as string || null

  if (!incubator_id) return { error: 'Incubator ID missing' }

  const { data: { session } } = await supabase.auth.getSession()

  const { error: logErr } = await supabase.from('incubator_environmental_logs').insert({
    incubator_id,
    temperature: isNaN(temperature) ? null : temperature,
    humidity: isNaN(humidity) ? null : humidity,
    turning_status,
    power_source,
    notes,
    recorded_by: session?.user?.id || null
  })

  if (logErr) return { error: logErr.message }

  // Generate simple alerts
  if (!isNaN(temperature)) {
    if (temperature > 38.0) {
      await supabase.from('incubation_alerts').insert({
        incubator_id,
        title: 'Overheating Detected',
        description: `Temperature logged at ${temperature}°C, exceeding safety thresholds.`,
        severity: 'CRITICAL',
      })
    } else if (temperature < 35.0) {
      await supabase.from('incubation_alerts').insert({
        incubator_id,
        title: 'Low Temperature',
        description: `Temperature logged at ${temperature}°C.`,
        severity: 'HIGH',
      })
    }
  }

  if (!isNaN(humidity)) {
    if (humidity > 70.0 || humidity < 40.0) {
      await supabase.from('incubation_alerts').insert({
        incubator_id,
        title: 'Humidity Instability',
        description: `Humidity logged at ${humidity}%.`,
        severity: 'MEDIUM',
      })
    }
  }

  revalidatePath('/incubation')
  return { success: true }
}

export async function assignBatchToIncubator(formData: FormData) {
  const supabase = await createClient()
  const batch_id = formData.get('batch_id') as string
  const incubator_id = formData.get('incubator_id') as string
  const phase = formData.get('phase') as string // EARLY_INCUBATION, CANDLING, LOCKDOWN, HATCHING
  
  if (!batch_id) return { error: 'Missing batch' }

  const targetStatus = phase || 'EARLY_INCUBATION'

  const { error } = await supabase.from('egg_batches').update({
    incubator_id: incubator_id || null,
    status: targetStatus as any,
    updated_at: new Date().toISOString()
  }).eq('id', batch_id)

  if (error) return { error: error.message }

  revalidatePath('/incubation')
  return { success: true }
}

export async function markAlertResolved(alertId: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  const { error } = await supabase.from('incubation_alerts').update({
    status: 'RESOLVED',
    resolved_at: new Date().toISOString(),
    resolved_by: session?.user?.id || null
  }).eq('id', alertId)

  if (error) return { error: error.message }
  revalidatePath('/incubation')
  return { success: true }
}
