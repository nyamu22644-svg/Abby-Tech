// API: GET /api/v1/alerts - List alerts with filtering
// API: PATCH /api/v1/alerts/[id] - Update alert status

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
import { requireRole, requireAuth } from '@/lib/rbac';
import { ApiError, ERROR_CODES } from '@/types/security.types';

const updateAlertSchema = z.object({
  status: z.enum(['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED']),
});

export const GET = apiHandler(async (req: NextRequest) => {
  validateMethod(req, ['GET']);

  const user = await requireAuth();
  const supabase = await createClient();
  const params = getSearchParams(req);

  // Get filters
  const status = req.nextUrl.searchParams.get('status');
  const severity = req.nextUrl.searchParams.get('severity');
  const batchId = req.nextUrl.searchParams.get('batch_id');
  const incubatorId = req.nextUrl.searchParams.get('incubator_id');

  let query = supabase
    .from('incubation_alerts')
    .select('*', { count: 'exact' })
    .order('triggered_at', { ascending: false })
    .range(params.offset, params.offset + params.limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  if (severity) {
    query = query.eq('severity', severity);
  }

  if (batchId) {
    query = query.eq('batch_id', batchId);
  }

  if (incubatorId) {
    query = query.eq('incubator_id', incubatorId);
  }

  const { data: alerts, count, error } = await query;

  if (error) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, error.message, 500);
  }

  return paginatedResponse(
    alerts || [],
    count || 0,
    params.limit,
    params.offset,
    200
  );
});

// Patch individual alert
export async function patchAlert(req: NextRequest, props: any) {
  validateMethod(req, ['PATCH']);

  const user = await requireRole('MANAGER');
  const alertId = props.params.id;

  if (!alertId) {
    throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 'Alert ID is required', 400);
  }

  const body = await getJsonBody(req);
  const validatedData = updateAlertSchema.parse(body);

  const supabase = await createClient();

  const { data: updatedAlert, error } = await supabase
    .from('incubation_alerts')
    .update({
      status: validatedData.status,
      ...(validatedData.status === 'RESOLVED' && {
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
      }),
    })
    .eq('id', alertId)
    .select()
    .single();

  if (error || !updatedAlert) {
    throw new ApiError(ERROR_CODES.NOT_FOUND, 'Alert not found', 404);
  }

  return successResponse(updatedAlert, 200);
}

export const PATCH = apiHandler(patchAlert);
