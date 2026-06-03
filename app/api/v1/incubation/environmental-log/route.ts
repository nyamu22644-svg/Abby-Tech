// API: POST /api/v1/incubation/environmental-log - Log environmental data

import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import {
  apiHandler,
  getJsonBody,
  successResponse,
  validateMethod,
} from '@/lib/api-response';
import { requireAuth } from '@/lib/auth';
import { logAlertTriggered, logEnvironmentalDataLogged } from '@/lib/audit';
import { canLogOperationalData } from '@/lib/rbac';
import { ApiError, ERROR_CODES } from '@/types/security.types';

const logEnvironmentalSchema = z.object({
  incubator_id: z.string().uuid('Invalid incubator ID'),
  batch_id: z.string().uuid('Invalid batch ID').optional(),
  temperature: z.number().min(-50).max(50).optional(),
  humidity: z.number().min(0).max(100).optional(),
  turning_status: z.string().optional(),
  power_source: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = apiHandler(async (req: NextRequest) => {
  validateMethod(req, ['POST']);

  const user = await requireAuth();
  if (!canLogOperationalData(user.role)) {
    throw new ApiError(
      ERROR_CODES.FORBIDDEN,
      'You do not have permission to log environmental data',
      403
    );
  }

  const body = await getJsonBody(req);
  const validatedData = logEnvironmentalSchema.parse(body);
  const supabase = await createClient();

  const { data: incubator, error: incError } = await supabase
    .from('incubators')
    .select('id, tenant_id')
    .eq('id', validatedData.incubator_id)
    .is('deleted_at', null)
    .single();

  if (incError || !incubator) {
    throw new ApiError(ERROR_CODES.NOT_FOUND, 'Incubator not found', 404);
  }

  const { data: newLog, error } = await supabase
    .from('incubator_environmental_logs')
    .insert({
      incubator_id: validatedData.incubator_id,
      batch_id: validatedData.batch_id || null,
      temperature: validatedData.temperature ?? null,
      humidity: validatedData.humidity ?? null,
      turning_status: validatedData.turning_status || null,
      power_source: validatedData.power_source || null,
      notes: validatedData.notes || null,
      recorded_by: user.id,
      recorded_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, error.message, 500);
  }

  await logEnvironmentalDataLogged(
    newLog.id,
    validatedData.incubator_id,
    validatedData.temperature ?? null,
    validatedData.humidity ?? null
  );

  await createEnvironmentalAlerts({
    supabase,
    tenantId: (incubator as any).tenant_id || user.tenant_id || null,
    incubatorId: validatedData.incubator_id,
    batchId: validatedData.batch_id || null,
    temperature: validatedData.temperature,
    humidity: validatedData.humidity,
  });

  return successResponse(newLog, 201);
});

async function createEnvironmentalAlerts({
  supabase,
  tenantId,
  incubatorId,
  batchId,
  temperature,
  humidity,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  tenantId: string | null;
  incubatorId: string;
  batchId: string | null;
  temperature?: number;
  humidity?: number;
}) {
  const alerts: Array<{
    tenant_id: string | null;
    incubator_id: string;
    batch_id: string | null;
    title: string;
    description: string;
    severity: 'MEDIUM' | 'HIGH' | 'CRITICAL';
    status: 'ACTIVE';
    triggered_at: string;
    observed_value: number;
  }> = [];

  const now = new Date().toISOString();

  if (temperature !== undefined) {
    if (temperature > 38) {
      alerts.push({
        tenant_id: tenantId,
        incubator_id: incubatorId,
        batch_id: batchId,
        title: 'Critical Temperature - Overheating',
        description: `Temperature ${temperature}C exceeds safe threshold (38C).`,
        severity: 'CRITICAL',
        status: 'ACTIVE',
        triggered_at: now,
        observed_value: temperature,
      });
    } else if (temperature < 35) {
      alerts.push({
        tenant_id: tenantId,
        incubator_id: incubatorId,
        batch_id: batchId,
        title: 'Low Temperature',
        description: `Temperature ${temperature}C is below the safe incubation range.`,
        severity: 'HIGH',
        status: 'ACTIVE',
        triggered_at: now,
        observed_value: temperature,
      });
    }
  }

  if (humidity !== undefined && (humidity > 75 || humidity < 35)) {
    alerts.push({
      tenant_id: tenantId,
      incubator_id: incubatorId,
      batch_id: batchId,
      title: 'Humidity Out of Range',
      description: `Humidity ${humidity}% is outside the configured operating range.`,
      severity: 'MEDIUM',
      status: 'ACTIVE',
      triggered_at: now,
      observed_value: humidity,
    });
  }

  for (const alertInput of alerts) {
    const { data: alert } = await supabase
      .from('alert_events')
      .insert(alertInput)
      .select()
      .single();

    if (alert) {
      await logAlertTriggered(alert.id, alert.severity, alert.title, alert.description || '');
    }
  }
}
