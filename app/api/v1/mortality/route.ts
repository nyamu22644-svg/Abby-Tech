// API: POST /api/v1/mortality/events - Log mortality event
// API: GET /api/v1/mortality/events - List mortality events

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
import { canLogOperationalData } from '@/lib/rbac';
import { requireAuth } from '@/lib/auth';
import { ApiError, ERROR_CODES } from '@/types/security.types';
import { logMortalityLogged } from '@/lib/audit';

const logMortalitySchema = z.object({
  batch_id: z.string().uuid('Invalid batch ID'),
  stage: z.enum(['INCUBATION', 'HATCHING', 'BROODER', 'TRANSPORT']),
  cause: z.enum([
    'OVERHEATING',
    'HUMIDITY_FAILURE',
    'POWER_FAILURE',
    'DISEASE',
    'WEAK_HATCH',
    'DEFORMITY',
    'CRUSHING',
    'UNKNOWN',
    'OTHER',
  ]),
  count: z.number().int().positive('Count must be > 0'),
  notes: z.string().optional(),
  photo_url: z.string().url().optional(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  validateMethod(req, ['GET']);

  const user = await requireAuth();
  const supabase = await createClient();
  const params = getSearchParams(req);

  // Get batch_id filter if provided
  const batchId = req.nextUrl.searchParams.get('batch_id');
  const includeVoided = req.nextUrl.searchParams.get('include_voided') === 'true';

  let query = supabase
    .from('mortality_events')
    .select('*', { count: 'exact' })
    .order('recorded_at', { ascending: false })
    .range(params.offset, params.offset + params.limit - 1);

  if (batchId) {
    query = query.eq('batch_id', batchId);
  }

  if (!includeVoided) {
    query = query.is('voided_at', null);
  }

  const { data: events, count, error } = await query;

  if (error) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, error.message, 500);
  }

  return paginatedResponse(
    events || [],
    count || 0,
    params.limit,
    params.offset,
    200
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  validateMethod(req, ['POST']);

  const user = await requireAuth();

  if (!canLogOperationalData(user.role)) {
    throw new ApiError(
      ERROR_CODES.FORBIDDEN,
      'You do not have permission to log mortality events',
      403
    );
  }

  const body = await getJsonBody(req);
  const validatedData = logMortalitySchema.parse(body);

  const supabase = await createClient();

  const { data: results, error } = await (supabase as any).rpc('log_mortality_event_atomic', {
    p_batch_id: validatedData.batch_id,
    p_stage: validatedData.stage,
    p_cause: validatedData.cause,
    p_count: validatedData.count,
    p_notes: validatedData.notes || null,
    p_photo_url: validatedData.photo_url || null,
    p_recorded_by: user.id,
  });

  if (error) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, error.message, 500);
  }

  const result = Array.isArray(results) ? results[0] : results;
  if (!result?.event_id) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, 'Mortality event was not returned', 500);
  }

  await logMortalityLogged(result.event_id, validatedData.batch_id, validatedData.count, validatedData.cause);

  return successResponse(result, 201);
});
