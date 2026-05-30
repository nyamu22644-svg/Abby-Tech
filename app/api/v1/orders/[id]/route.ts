// API: GET /api/v1/orders/[id] - Get specific order
// API: PATCH /api/v1/orders/[id] - Update order
// API: DELETE /api/v1/orders/[id] - Soft delete order

import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  successResponse,
  apiHandler,
  validateMethod,
  getJsonBody,
} from '@/lib/api-response';
import { requireRole, requireAuth } from '@/lib/rbac';
import { ApiError, ERROR_CODES } from '@/types/security.types';
import { logOrderUpdated, logOrderPaymentReceived, logOrderBatchAllocated } from '@/lib/audit';

const updateOrderSchema = z.object({
  status: z
    .enum([
      'INQUIRY',
      'RESERVED',
      'DEPOSIT_PAID',
      'ALLOCATED',
      'READY_FOR_DISPATCH',
      'DISPATCHED',
      'COMPLETED',
      'CANCELLED',
    ])
    .optional(),
  payment_status: z.enum(['UNPAID', 'DEPOSIT_PAID', 'FULLY_PAID', 'REFUNDED']).optional(),
  dispatch_status: z.enum(['PENDING', 'SCHEDULED', 'DISPATCHED', 'DELIVERED']).optional(),
  allocated_batch_id: z.string().uuid().optional(),
  notes: z.string().optional(),
});

export const GET = apiHandler(async (req: NextRequest, props: any) => {
  validateMethod(req, ['GET']);

  const user = await requireAuth();
  const orderId = props.params.id;

  if (!orderId) {
    throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 'Order ID is required', 400);
  }

  const supabase = await createClient();

  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .is('deleted_at', null)
    .single();

  if (error || !order) {
    throw new ApiError(ERROR_CODES.NOT_FOUND, 'Order not found', 404);
  }

  return successResponse(order, 200);
});

export const PATCH = apiHandler(async (req: NextRequest, props: any) => {
  validateMethod(req, ['PATCH']);

  const user = await requireRole('MANAGER');
  const orderId = props.params.id;

  if (!orderId) {
    throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 'Order ID is required', 400);
  }

  const body = await getJsonBody(req);
  const validatedData = updateOrderSchema.parse(body);

  const supabase = await createClient();

  // Get current order
  const { data: currentOrder, error: fetchError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .is('deleted_at', null)
    .single();

  if (fetchError || !currentOrder) {
    throw new ApiError(ERROR_CODES.NOT_FOUND, 'Order not found', 404);
  }

  const updateData: any = {
    ...validatedData,
    updated_at: new Date().toISOString(),
  };

  const { data: updatedOrder, error } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', orderId)
    .select()
    .single();

  if (error) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, error.message, 500);
  }

  // Log the update
  await logOrderUpdated(orderId, currentOrder, updateData);

  // Log specific actions
  if (validatedData.allocated_batch_id && validatedData.allocated_batch_id !== currentOrder.allocated_batch_id) {
    await logOrderBatchAllocated(orderId, validatedData.allocated_batch_id, currentOrder.quantity);
  }

  return successResponse(updatedOrder, 200);
});

export const DELETE = apiHandler(async (req: NextRequest, props: any) => {
  validateMethod(req, ['DELETE']);

  const user = await requireRole('MANAGER');
  const orderId = props.params.id;

  if (!orderId) {
    throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 'Order ID is required', 400);
  }

  const supabase = await createClient();

  const { data: deletedOrder, error } = await supabase
    .from('orders')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error || !deletedOrder) {
    throw new ApiError(ERROR_CODES.NOT_FOUND, 'Order not found', 404);
  }

  return successResponse({ id: orderId, deleted: true }, 200);
});
