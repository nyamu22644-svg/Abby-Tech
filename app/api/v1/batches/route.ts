// API: GET /api/v1/batches - List all egg batches with pagination
// API: POST /api/v1/batches - Create a new batch

import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  successResponse,
  errorResponse,
  apiHandler,
  validateMethod,
  getJsonBody,
  getSearchParams,
  paginatedResponse,
} from '@/lib/api-response';
import { requireRole } from '@/lib/rbac';
import { requireAuth, getCurrentUserProfile } from '@/lib/auth';
import { ApiError, ERROR_CODES } from '@/types/security.types';
import { logBatchCreated } from '@/lib/audit';

const createBatchSchema = z.object({
  batch_number: z.string().min(1, 'Batch number is required'),
  quantity_received: z.number().int().positive('Quantity must be > 0'),
  status: z.enum([
    'LOGGED',
    'SETTER',
    'HATCHER',
    'BROODER',
    'COMPLETED',
    'FAILED',
    'DISCARDED',
    'CANCELLED',
  ]),
  egg_purchase_cost: z.number().min(0).default(0),
  transport_cost: z.number().min(0).default(0),
  misc_initial_cost: z.number().min(0).default(0),
});

export const GET = apiHandler(async (req: NextRequest) => {
  validateMethod(req, ['GET']);

  // Require authentication
  const user = await requireAuth();

  const supabase = await createClient();
  const params = getSearchParams(req);

  // Build query with role-based filtering
  let query = supabase
    .from('egg_batches')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order(params.sort === 'created_at' ? 'created_at' : 'batch_number', {
      ascending: params.order === 'asc',
    })
    .range(params.offset, params.offset + params.limit - 1);

  const { data: batches, count, error } = await query;

  if (error) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, error.message, 500);
  }

  return paginatedResponse(
    batches || [],
    count || 0,
    params.limit,
    params.offset,
    200
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  validateMethod(req, ['POST']);

  // Require manager role or above
  const user = await requireRole('MANAGER');

  const body = await getJsonBody(req);
  const validatedData = createBatchSchema.parse(body);

  const supabase = await createClient();

  const total_initial_cost =
    validatedData.egg_purchase_cost +
    validatedData.transport_cost +
    validatedData.misc_initial_cost;

  const { data: newBatch, error } = await supabase
    .from('egg_batches')
    .insert({
      batch_number: validatedData.batch_number,
      quantity_received: validatedData.quantity_received,
      status: validatedData.status,
      egg_purchase_cost: validatedData.egg_purchase_cost,
      transport_cost: validatedData.transport_cost,
      misc_initial_cost: validatedData.misc_initial_cost,
      total_initial_cost,
      sync_version: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    if (error.message.includes('duplicate')) {
      throw new ApiError(
        ERROR_CODES.DUPLICATE_ENTRY,
        'Batch number already exists',
        409
      );
    }
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, error.message, 500);
  }

  // Log the creation
  await logBatchCreated(newBatch.id, validatedData);

  return successResponse(newBatch, 201);
});
