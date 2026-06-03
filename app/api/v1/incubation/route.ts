// API: GET /api/v1/incubation - List incubators
// API: POST /api/v1/incubation - Create incubator

import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import {
  apiHandler,
  getJsonBody,
  getSearchParams,
  paginatedResponse,
  successResponse,
  validateMethod,
} from '@/lib/api-response';
import { requireAuth, requireRole } from '@/lib/auth';
import { logIncubatorCreated } from '@/lib/audit';
import { ApiError, ERROR_CODES } from '@/types/security.types';

const createIncubatorSchema = z.object({
  name: z.string().min(1, 'Incubator name is required'),
  model_number: z.string().optional(),
  incubator_type: z.enum(['SETTER', 'HATCHER', 'BROODER']).default('SETTER'),
  capacity: z.number().int().positive('Capacity must be > 0'),
});

export const GET = apiHandler(async (req: NextRequest) => {
  validateMethod(req, ['GET']);

  await requireAuth();
  const supabase = await createClient();
  const params = getSearchParams(req);

  const { data: incubators, count, error } = await supabase
    .from('incubators')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(params.offset, params.offset + params.limit - 1);

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

export const POST = apiHandler(async (req: NextRequest) => {
  validateMethod(req, ['POST']);

  const user = await requireRole('MANAGER');
  const body = await getJsonBody(req);
  const validatedData = createIncubatorSchema.parse(body);
  const supabase = await createClient();

  const { data: newIncubator, error } = await supabase
    .from('incubators')
    .insert({
      tenant_id: user.tenant_id || null,
      name: validatedData.name,
      controller_model: validatedData.model_number || null,
      type: validatedData.incubator_type,
      capacity: validatedData.capacity,
      operational_status: 'ACTIVE',
      created_by: user.id,
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
