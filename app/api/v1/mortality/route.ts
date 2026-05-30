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
import { requireRole, requireAuth, canLogOperationalData } from '@/lib/rbac';
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

  let query = supabase
    .from('mortality_events')
    .select('*', { count: 'exact' })
    .order('recorded_at', { ascending: false })
    .range(params.offset, params.offset + params.limit - 1);

  if (batchId) {
    query = query.eq('batch_id', batchId);
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

  // Verify batch exists
  const { data: batch, error: batchError } = await supabase
    .from('egg_batches')
    .select('quantity_received, total_initial_cost, mortality_count, total_financial_loss')
    .eq('id', validatedData.batch_id)
    .is('deleted_at', null)
    .single();

  if (batchError || !batch) {
    throw new ApiError(ERROR_CODES.NOT_FOUND, 'Batch not found', 404);
  }

  // Calculate financial loss
  const { data: opCosts } = await supabase
    .from('operational_costs')
    .select('amount')
    .eq('batch_id', validatedData.batch_id);

  const totalOpCosts = opCosts
    ? opCosts.reduce((sum, cost) => sum + Number(cost.amount), 0)
    : 0;
  const totalBaseCost = Number(batch.total_initial_cost || 0) + totalOpCosts;
  const divisor = batch.quantity_received > 0 ? batch.quantity_received : 1;
  const costPerChick = totalBaseCost / divisor;
  const estimatedLoss = costPerChick * validatedData.count;

  // Insert mortality event
  const { data: newEvent, error } = await supabase
    .from('mortality_events')
    .insert({
      batch_id: validatedData.batch_id,
      stage: validatedData.stage,
      cause: validatedData.cause,
      count: validatedData.count,
      notes: validatedData.notes || null,
      photo_url: validatedData.photo_url || null,
      estimated_financial_loss: estimatedLoss,
      recorded_by: user.id,
      recorded_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, error.message, 500);
  }

  // Update batch totals
  const newMortalityCount = (batch.mortality_count || 0) + validatedData.count;
  const newTotalLoss = Number(batch.total_financial_loss || 0) + estimatedLoss;

  await supabase
    .from('egg_batches')
    .update({
      mortality_count: newMortalityCount,
      total_financial_loss: newTotalLoss,
      updated_at: new Date().toISOString(),
    })
    .eq('id', validatedData.batch_id);

  // Log the mortality event
  await logMortalityLogged(newEvent.id, validatedData.batch_id, validatedData.count, validatedData.cause);

  return successResponse(newEvent, 201);
});
