import { addDays, isPast } from 'date-fns'

import {
  CANDLING_WINDOW_END_DAY,
  CANDLING_WINDOW_LABEL,
  CANDLING_WINDOW_START_DAY,
  LOCKDOWN_DAY,
} from '@/lib/incubation/rules'

type LifecycleAlertRow = {
  alert_key: string
  source: string
  tenant_id: string | null
  batch_id: string
  incubator_id: string | null
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  status: 'ACTIVE'
  title: string
  description: string
  triggered_at: string
  acknowledged_at: null
  acknowledged_by: null
  resolved_at: null
  resolved_by: null
  sync_version: number
}

const TERMINAL_BATCH_STATUSES = new Set(['COMPLETED', 'FAILED', 'DISCARDED', 'CANCELLED'])
const LIFECYCLE_ALERT_SOURCE = 'Batch Workflow'

export async function syncLifecycleAlerts(supabase: any) {
  const now = new Date()
  const { data: batches, error: batchError } = await supabase
    .from('egg_batches')
    .select('id, tenant_id, batch_number, status, set_date, expected_hatch_date, incubator_id, quantity_culled, created_at, updated_at, deleted_at')
    .is('deleted_at', null)

  if (batchError || !batches) {
    if (batchError) console.error('Failed to read batches for lifecycle alert sync:', batchError)
    return { synced: false, error: batchError?.message || 'No batch data' }
  }

  const expectedAlerts = batches.flatMap((batch: any) => buildExpectedLifecycleAlerts(batch, now))
  const expectedKeys = new Set(expectedAlerts.map((alert: LifecycleAlertRow) => alert.alert_key))

  const { data: existingAlerts, error: existingError } = await supabase
    .from('alert_events')
    .select('id, alert_key, status')
    .like('alert_key', 'batch:%')

  if (existingError) {
    console.error('Failed to read lifecycle alerts:', existingError)
    return { synced: false, error: existingError.message }
  }

  if (expectedAlerts.length > 0) {
    const { error: upsertError } = await supabase
      .from('alert_events')
      .upsert(expectedAlerts, { onConflict: 'alert_key' })

    if (upsertError) {
      console.error('Failed to upsert lifecycle alerts:', upsertError)
      return { synced: false, error: upsertError.message }
    }
  }

  const staleIds = (existingAlerts || [])
    .filter((alert: any) => alert.alert_key && !expectedKeys.has(alert.alert_key))
    .filter((alert: any) => ['ACTIVE', 'ACKNOWLEDGED', 'SILENCED'].includes(alert.status))
    .map((alert: any) => alert.id)

  if (staleIds.length > 0) {
    const { error: resolveError } = await supabase
      .from('alert_events')
      .update({
        status: 'RESOLVED',
        resolved_at: now.toISOString(),
      })
      .in('id', staleIds)

    if (resolveError) {
      console.error('Failed to resolve stale lifecycle alerts:', resolveError)
      return { synced: false, error: resolveError.message }
    }
  }

  return { synced: true, activeCount: expectedAlerts.length, resolvedCount: staleIds.length }
}

function buildExpectedLifecycleAlerts(batch: any, now: Date): LifecycleAlertRow[] {
  const alerts: LifecycleAlertRow[] = []
  const status = batch.status || ''
  const hasPlacement = Boolean(batch.incubator_id && batch.set_date && batch.expected_hatch_date)
  const base = {
    source: LIFECYCLE_ALERT_SOURCE,
    tenant_id: batch.tenant_id || null,
    batch_id: batch.id,
    incubator_id: batch.incubator_id || null,
    status: 'ACTIVE' as const,
    acknowledged_at: null,
    acknowledged_by: null,
    resolved_at: null,
    resolved_by: null,
    sync_version: 1,
  }

  if (status === 'LOGGED' || (['SETTER', 'HATCHER'].includes(status) && !hasPlacement)) {
    alerts.push({
      ...base,
      alert_key: `batch:${batch.id}:placement`,
      severity: status === 'LOGGED' ? 'MEDIUM' : 'HIGH',
      title: 'Batch needs incubator placement',
      description: `${batch.batch_number} has accepted eggs that are not fully assigned to a physical incubator machine and tray layout.`,
      triggered_at: batch.updated_at || batch.created_at || now.toISOString(),
    })
  }

  if (status === 'SETTER' && batch.set_date) {
    const candlingRecorded = batch.quantity_culled !== null && batch.quantity_culled !== undefined
    const setDate = new Date(batch.set_date)
    const candlingOpens = addDays(setDate, CANDLING_WINDOW_START_DAY)
    const candlingCloses = addDays(setDate, CANDLING_WINDOW_END_DAY)
    const lockdownDate = addDays(setDate, LOCKDOWN_DAY)

    if (!candlingRecorded && isPast(candlingCloses)) {
      alerts.push({
        ...base,
        alert_key: `batch:${batch.id}:candling`,
        severity: 'HIGH',
        title: 'Candling overdue',
        description: `${batch.batch_number} passed the candling window (${CANDLING_WINDOW_LABEL}). Candle eggs, remove infertile or bad eggs, then record the removed count.`,
        triggered_at: candlingCloses.toISOString(),
      })
    } else if (!candlingRecorded && isPast(candlingOpens)) {
      alerts.push({
        ...base,
        alert_key: `batch:${batch.id}:candling`,
        severity: 'MEDIUM',
        title: 'Candling window open',
        description: `${batch.batch_number} is in the candling window (${CANDLING_WINDOW_LABEL}). Candle eggs and record viability results.`,
        triggered_at: candlingOpens.toISOString(),
      })
    }

    if (isPast(lockdownDate)) {
      alerts.push({
        ...base,
        alert_key: `batch:${batch.id}:lockdown`,
        severity: 'HIGH',
        title: 'Move batch to hatch prep',
        description: `${batch.batch_number} has reached Day ${LOCKDOWN_DAY}. Stop turning and move trays into hatch preparation, then confirm the move.`,
        triggered_at: lockdownDate.toISOString(),
      })
    }
  }

  if (batch.expected_hatch_date && !TERMINAL_BATCH_STATUSES.has(status)) {
    const hatchDate = new Date(batch.expected_hatch_date)
    if (isPast(hatchDate)) {
      alerts.push({
        ...base,
        alert_key: `batch:${batch.id}:hatch`,
        severity: 'HIGH',
        title: 'Record hatch result',
        description: `${batch.batch_number} has reached the expected hatch date. Count chicks, record final losses, and close the cycle.`,
        triggered_at: hatchDate.toISOString(),
      })
    }
  }

  return alerts
}
