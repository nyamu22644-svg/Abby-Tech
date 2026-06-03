'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logIncubatorCreated, logAlertTriggered } from '@/lib/audit'

export async function createIncubator(formData: FormData) {
  const supabase = await createClient()
  
  const name = formData.get('name') as string
  const incubatorType = formData.get('incubator_type') as string || 'SETTER'
  const model_number = formData.get('model_number') as string || null
  const capacity = parseInt(formData.get('capacity') as string, 10)

  if (!name || isNaN(capacity) || capacity <= 0) {
    return { error: 'Invalid input data' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Login required' }
  }

  const { data: profile } = await (supabase as any)
    .from('user_profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle()

  let tenantId = profile?.tenant_id || null
  if (!tenantId) {
    const { data: tenant } = await (supabase as any)
      .from('tenants')
      .select('id')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    tenantId = tenant?.id || null
  }

  if (!tenantId) {
    return { error: 'Save facility settings before registering equipment.' }
  }

  const { data: newIncubator, error } = await supabase.from('incubators').insert({
    tenant_id: tenantId,
    name,
    type: incubatorType as any,
    controller_model: model_number,
    capacity,
    operational_status: 'ACTIVE',
    created_by: user.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).select().single()

  if (error) {
    return { error: error.message }
  }

  // Log incubator creation
  await logIncubatorCreated(newIncubator.id, { name, type: incubatorType, model_number, capacity })

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
      const { data: alert } = await supabase.from('alert_events').insert({
        incubator_id,
        title: 'Overheating Detected',
        description: `Temperature logged at ${temperature}°C, exceeding safety thresholds.`,
        severity: 'CRITICAL',
        status: 'ACTIVE',
        triggered_at: new Date().toISOString(),
      }).select().single()
      if (alert) {
        await logAlertTriggered(alert.id, 'CRITICAL', alert.title, alert.description)
      }
    } else if (temperature < 35.0) {
      const { data: alert } = await supabase.from('alert_events').insert({
        incubator_id,
        title: 'Low Temperature',
        description: `Temperature logged at ${temperature}°C.`,
        severity: 'HIGH',
        status: 'ACTIVE',
        triggered_at: new Date().toISOString(),
      }).select().single()
      if (alert) {
        await logAlertTriggered(alert.id, 'HIGH', alert.title, alert.description)
      }
    }
  }

  if (!isNaN(humidity)) {
    if (humidity > 70.0 || humidity < 40.0) {
      const { data: alert } = await supabase.from('alert_events').insert({
        incubator_id,
        title: 'Humidity Instability',
        description: `Humidity logged at ${humidity}%.`,
        severity: 'MEDIUM',
        status: 'ACTIVE',
        triggered_at: new Date().toISOString(),
      }).select().single()
      if (alert) {
        await logAlertTriggered(alert.id, 'MEDIUM', alert.title, alert.description)
      }
    }
  }

  revalidatePath('/incubation')
  return { success: true }
}

export async function assignBatchToIncubator(formData: FormData) {
  const supabase = await createClient()
  const batch_id = formData.get('batch_id') as string
  const incubator_id = formData.get('incubator_id') as string
  const phase = formData.get('phase') as string // SETTER, HATCHER, BROODER
  const actualSetDateInput = formData.get('actual_set_date') as string | null
  
  if (!batch_id) return { error: 'Missing batch' }
  if (!incubator_id) return { error: 'Missing incubator' }

  const targetStatus = phase || 'SETTER'
  if (targetStatus !== 'SETTER') {
    return { error: 'Use the lifecycle task controls to move placed batches into hatch prep or brooder.' }
  }

  const actualSetDate = actualSetDateInput ? new Date(actualSetDateInput) : null
  if (actualSetDateInput && (!actualSetDate || Number.isNaN(actualSetDate.getTime()))) {
    return { error: 'Invalid actual set date.' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await (supabase as any).rpc('place_batch_in_incubator_atomic', {
    p_batch_id: batch_id,
    p_incubator_id: incubator_id,
    p_set_date: (actualSetDate || new Date()).toISOString(),
    p_assigned_by: user?.id || null,
  })

  if (error) return { error: error.message }

  revalidatePath('/incubation')
  revalidatePath('/batches')
  revalidatePath(`/batches/${batch_id}`)
  return { success: true }
}

export async function markAlertResolved(alertId: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  const { error } = await supabase.from('alert_events').update({
    status: 'RESOLVED',
    resolved_at: new Date().toISOString(),
    resolved_by: session?.user?.id || null
  }).eq('id', alertId)

  if (error) return { error: error.message }
  revalidatePath('/incubation')
  return { success: true }
}
