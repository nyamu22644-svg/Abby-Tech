// API: GET /api/v1/incubation/incubators - List incubators
// API: POST /api/v1/incubation/incubators - Create incubator
// API: POST /api/v1/incubation/environmental-log - Log environmental data

import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  successResponse,
  apiHandler,
  validateMethod,
  getJsonBody,
  getSearchParams,
  paginatedResponse,
} from '@/lib/api-response';
import { requireRole, requireAuth, canLogOperationalData } from '@/lib/rbac';
import { ApiError, ERROR_CODES } from '@/types/security.types';
import { logIncubatorCreated, logEnvironmentalDataLogged, logAlertTriggered } from '@/lib/audit';

const createIncubatorSchema = z.object({
  name: z.string().min(1, 'Incubator name is required'),
  model_number: z.string().optional(),
  controller_type: z.enum(['AUTOMATIC', 'MANUAL', 'HYBRID']).default('AUTOMATIC'),
  capacity: z.number().int().positive('Capacity must be > 0'),
});

const logEnvironmentalSchema = z.object({
  incubator_id: z.string().uuid('Invalid incubator ID'),
  temperature: z.number().min(-50).max(50).optional(),
  humidity: z.number().min(0).max(100).optional(),
  turning_status: z.string().optional(),
  power_source: z.string().optional(),
  notes: z.string().optional(),
});

// GET incubators
export const GET = apiHandler(async (req: NextRequest) => {
  validateMethod(req, ['GET']);

  const user = await requireAuth();
  const supabase = await createClient();
  const params = getSearchParams(req);

  let query = supabase
    .from('incubators')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(params.offset, params.offset + params.limit - 1);

  const { data: incubators, count, error } = await query;

  if (error) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, error.message, 500);
  }

  return paginatedResponse(
    incubators || [],
    count || 0,
    params.limit,
    params.offset,
    200
  );
});

// POST create incubator
export const POST = apiHandler(async (req: NextRequest) => {
  validateMethod(req, ['POST']);

  const user = await requireRole('MANAGER');
  const body = await getJsonBody(req);
  const validatedData = createIncubatorSchema.parse(body);

  const supabase = await createClient();

  const { data: newIncubator, error } = await supabase
    .from('incubators')
    .insert({
      name: validatedData.name,
      model_number: validatedData.model_number || null,
      controller_type: validatedData.controller_type,
      capacity: validatedData.capacity,
      automation_capable: true,
      operational_status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, error.message, 500);
  }

  await logIncubatorCreated(newIncubator.id, validatedData);

  return successResponse(newIncubator, 201);
});

// POST environmental log
export async function logEnvironmental(req: NextRequest) {
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

  // Verify incubator exists
  const { data: incubator, error: incError } = await supabase
    .from('incubators')
    .select('id')
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
      temperature: validatedData.temperature || null,
      humidity: validatedData.humidity || null,
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
    validatedData.temperature || null,
    validatedData.humidity || null
  );

  // Generate alerts if thresholds exceeded
  if (validatedData.temperature !== undefined) {
    if (validatedData.temperature > 38.0) {
      const { data: alert } = await supabase
        .from('incubation_alerts')
        .insert({
          incubator_id: validatedData.incubator_id,
          title: 'Critical Temperature - Overheating',
          description: `Temperature ${validatedData.temperature}°C exceeds safe threshold (38°C)`,
          severity: 'CRITICAL',
          status: 'ACTIVE',
          triggered_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (alert) {
        await logAlertTriggered(alert.id, 'CRITICAL', alert.title, alert.description);
      }
    } else if (validatedData.temperature < 35.0) {
      const { data: alert } = await supabase
        .from('incubation_alerts')
        .insert({
          incubator_id: validatedData.incubator_id,
          title: 'High Temperature - Low Incubation',
          description: `Temperature ${validatedData.temperature}°C below optimal range (35-38°C)`,
          severity: 'HIGH',
          status: 'ACTIVE',
          triggered_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (alert) {
        await logAlertTriggered(alert.id, 'HIGH', alert.title, alert.description);
      }
    }
  }

  if (validatedData.humidity !== undefined) {
    if (validatedData.humidity > 75.0 || validatedData.humidity < 35.0) {
      const { data: alert } = await supabase
        .from('incubation_alerts')
        .insert({
          incubator_id: validatedData.incubator_id,
          title: 'Humidity Out of Range',
          description: `Humidity ${validatedData.humidity}% outside optimal range (40-70%)`,
          severity: 'MEDIUM',
          status: 'ACTIVE',
          triggered_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (alert) {
        await logAlertTriggered(alert.id, 'MEDIUM', alert.title, alert.description);
      }
    }
  }

  return successResponse(newLog, 201);
}

export const POST_ENVIRONMENTAL = apiHandler(logEnvironmental);
