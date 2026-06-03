import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

const telemetrySchema = z.object({
  serial_number: z.string().trim().min(1),
  ingest_key: z.string().trim().min(8),
  temperature: z.coerce.number().min(-50).max(80).optional(),
  humidity: z.coerce.number().min(0).max(100).optional(),
  turning_status: z.string().trim().optional(),
  power_source: z.string().trim().optional(),
  alarm_state: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  recorded_at: z.string().datetime().optional(),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const parsed = telemetrySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid telemetry payload' }, { status: 400 })
  }

  let supabase: ReturnType<typeof createAdminClient>
  try {
    supabase = createAdminClient()
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const input = parsed.data
  const { data: device, error: deviceError } = await supabase
    .from('devices')
    .select('id, tenant_id, name, serial_number, ingest_token_hash, status')
    .eq('serial_number', input.serial_number)
    .is('deleted_at', null)
    .maybeSingle()

  if (deviceError || !device) {
    return NextResponse.json({ error: 'Device not registered' }, { status: 404 })
  }

  if (!device.ingest_token_hash || device.ingest_token_hash !== hashSecret(input.ingest_key)) {
    return NextResponse.json({ error: 'Invalid device key' }, { status: 401 })
  }

  if (device.status === 'DECOMMISSIONED') {
    return NextResponse.json({ error: 'Device is decommissioned' }, { status: 403 })
  }

  const { data: assignment } = await supabase
    .from('device_assignments')
    .select('incubator_id')
    .eq('device_id', device.id)
    .eq('is_active', true)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!assignment?.incubator_id) {
    return NextResponse.json({ error: 'Device is not assigned to an incubator' }, { status: 409 })
  }

  const recordedAt = input.recorded_at || new Date().toISOString()
  const { data: log, error: logError } = await supabase
    .from('incubator_environmental_logs')
    .insert({
      incubator_id: assignment.incubator_id,
      temperature: input.temperature ?? null,
      humidity: input.humidity ?? null,
      turning_status: input.turning_status || null,
      power_source: input.power_source || null,
      alarm_state: input.alarm_state || null,
      notes: input.notes || `ESP telemetry from ${device.name || device.serial_number}`,
      recorded_by: null,
      recorded_at: recordedAt,
      origin_device_id: device.id,
    })
    .select('id')
    .single()

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 })
  }

  await supabase
    .from('devices')
    .update({
      status: 'ONLINE',
      last_seen_at: recordedAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', device.id)

  await insertDeviceReadings({
    supabase,
    deviceId: device.id,
    incubatorId: assignment.incubator_id,
    recordedAt,
    temperature: input.temperature,
    humidity: input.humidity,
  })

  await createEnvironmentalAlerts({
    supabase,
    tenantId: device.tenant_id || null,
    incubatorId: assignment.incubator_id,
    temperature: input.temperature,
    humidity: input.humidity,
  })

  return NextResponse.json({
    success: true,
    log_id: log.id,
    device_id: device.id,
    incubator_id: assignment.incubator_id,
  })
}

async function insertDeviceReadings({
  supabase,
  deviceId,
  incubatorId,
  recordedAt,
  temperature,
  humidity,
}: {
  supabase: ReturnType<typeof createAdminClient>
  deviceId: string
  incubatorId: string
  recordedAt: string
  temperature?: number
  humidity?: number
}) {
  const readings: Array<{ metricName: string; unit: string; value: number }> = []
  if (temperature !== undefined) readings.push({ metricName: 'temperature', unit: 'C', value: temperature })
  if (humidity !== undefined) readings.push({ metricName: 'humidity', unit: '%', value: humidity })
  if (readings.length === 0) return

  for (const reading of readings) {
    const { data: metric, error: metricError } = await supabase
      .from('device_metrics')
      .upsert(
        {
          name: reading.metricName,
          unit: reading.unit,
          description: `${reading.metricName} telemetry`,
          is_alertable: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'name' }
      )
      .select('id')
      .single()

    if (metricError || !metric?.id) continue

    await supabase.from('device_readings').insert({
      device_id: deviceId,
      metric_id: metric.id,
      incubator_id: incubatorId,
      value: reading.value,
      recorded_at: recordedAt,
      origin_device_id: deviceId,
    })
  }
}

async function createEnvironmentalAlerts({
  supabase,
  tenantId,
  incubatorId,
  temperature,
  humidity,
}: {
  supabase: ReturnType<typeof createAdminClient>
  tenantId: string | null
  incubatorId: string
  temperature?: number
  humidity?: number
}) {
  const now = new Date().toISOString()
  const alerts: Array<{
    tenant_id: string | null
    incubator_id: string
    title: string
    description: string
    severity: 'MEDIUM' | 'HIGH' | 'CRITICAL'
    status: 'ACTIVE'
    triggered_at: string
    observed_value: number
    source: string
  }> = []

  if (temperature !== undefined) {
    if (temperature > 38) {
      alerts.push({
        tenant_id: tenantId,
        incubator_id: incubatorId,
        title: 'Critical Temperature - Overheating',
        description: `ESP telemetry reported ${temperature}C, above the safe incubation threshold.`,
        severity: 'CRITICAL',
        status: 'ACTIVE',
        triggered_at: now,
        observed_value: temperature,
        source: 'IOT',
      })
    } else if (temperature < 35) {
      alerts.push({
        tenant_id: tenantId,
        incubator_id: incubatorId,
        title: 'Low Temperature',
        description: `ESP telemetry reported ${temperature}C, below the safe incubation range.`,
        severity: 'HIGH',
        status: 'ACTIVE',
        triggered_at: now,
        observed_value: temperature,
        source: 'IOT',
      })
    }
  }

  if (humidity !== undefined && (humidity > 75 || humidity < 35)) {
    alerts.push({
      tenant_id: tenantId,
      incubator_id: incubatorId,
      title: 'Humidity Out of Range',
      description: `ESP telemetry reported ${humidity}% humidity.`,
      severity: 'MEDIUM',
      status: 'ACTIVE',
      triggered_at: now,
      observed_value: humidity,
      source: 'IOT',
    })
  }

  if (alerts.length > 0) {
    await supabase.from('alert_events').insert(alerts)
  }
}

function hashSecret(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}
