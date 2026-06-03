// API: GET /api/v1/alerts - List alerts with filtering

import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  apiHandler,
  validateMethod,
  getSearchParams,
  paginatedResponse,
} from '@/lib/api-response';
import { requireAuth } from '@/lib/auth';
import { syncLifecycleAlerts } from '@/lib/alerts/lifecycle-alerts';
import { ApiError, ERROR_CODES } from '@/types/security.types';

export const GET = apiHandler(async (req: NextRequest) => {
  validateMethod(req, ['GET']);

  const user = await requireAuth();
  const supabase = await createClient();
  await syncLifecycleAlerts(supabase);
  const params = getSearchParams(req);

  // Get filters
  const status = req.nextUrl.searchParams.get('status');
  const severity = req.nextUrl.searchParams.get('severity');
  const batchId = req.nextUrl.searchParams.get('batch_id');
  const incubatorId = req.nextUrl.searchParams.get('incubator_id');

  let query = supabase
    .from('alert_events')
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
