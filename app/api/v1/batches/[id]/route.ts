// API: GET /api/v1/batches/[id] - Get a specific batch
// API: PATCH /api/v1/batches/[id] - Update a batch
// API: DELETE /api/v1/batches/[id] - Soft delete a batch

import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  successResponse,
  errorResponse,
  apiHandler,
  validateMethod,
  getJsonBody,
} from '@/lib/api-response';
import { requireRole, requireAuth } from '@/lib/rbac';
import { ApiError, ERROR_CODES } from '@/types/security.types';
import { logBatchUpdated, logBatchStatusChange } from '@/lib/audit';

const updateBatchSchema = z.object({
  status: z
    .enum([
      'LOGGED',
      'SETTER',
      'HATCHER',
      'BROODER',
      'COMPLETED',
      'FAILED',
      'DISCARDED',
      'CANCELLED',
    ])
    .optional(),
  quantity_hatched: z.number().int().min(0).optional(),
  quantity_culled: z.number().int().min(0).optional(),
  actual_hatch_date: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export const GET = apiHandler(async (req: NextRequest, props: any) => {
  validateMethod(req, ['GET']);

  const user = await requireAuth();
  const batchId = props.params.id;

  if (!batchId) {
    throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 'Batch ID is required', 400);
  }

  const supabase = await createClient();

  const { data: batch, error } = await supabase
    .from('egg_batches')
    .select('*')
    .eq('id', batchId)
    .is('deleted_at', null)
    .single();

  if (error || !batch) {
    throw new ApiError(ERROR_CODES.NOT_FOUND, 'Batch not found', 404);
  }

  return successResponse(batch, 200);
});

export const PATCH = apiHandler(async (req: NextRequest, props: any) => {
  validateMethod(req, ['PATCH']);

  const user = await requireRole('MANAGER');
  const batchId = props.params.id;

  if (!batchId) {
    throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 'Batch ID is required', 400);
  }

  const body = await getJsonBody(req);
  const validatedData = updateBatchSchema.parse(body);

  const supabase = await createClient();

  // Get current batch for audit
  const { data: currentBatch, error: fetchError } = await supabase
    .from('egg_batches')
    .select('*')
    .eq('id', batchId)
    .is('deleted_at', null)
    .single();

  if (fetchError || !currentBatch) {
    throw new ApiError(ERROR_CODES.NOT_FOUND, 'Batch not found', 404);
  }

  const updateData: any = {
    ...validatedData,
    updated_at: new Date().toISOString(),
  };

  const { data: updatedBatch, error } = await supabase
    .from('egg_batches')
    .update(updateData)
    .eq('id', batchId)
    .select()
    .single();

  if (error) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, error.message, 500);
  }

  // Log the update
  await logBatchUpdated(batchId, currentBatch, updateData);

  // If status changed, log that specifically
  if (validatedData.status && validatedData.status !== currentBatch.status) {
    await logBatchStatusChange(batchId, currentBatch.status, validatedData.status);
  }

  return successResponse(updatedBatch, 200);
});

export const DELETE = apiHandler(async (req: NextRequest, props: any) => {
  validateMethod(req, ['DELETE']);

  const user = await requireRole('MANAGER');
  const batchId = props.params.id;

  if (!batchId) {
    throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 'Batch ID is required', 400);
  }

  const supabase = await createClient();

  // Soft delete: set deleted_at timestamp
  const { data: deletedBatch, error } = await supabase
    .from('egg_batches')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error || !deletedBatch) {
    throw new ApiError(ERROR_CODES.NOT_FOUND, 'Batch not found', 404);
  }

  return successResponse({ id: batchId, deleted: true }, 200);
});
