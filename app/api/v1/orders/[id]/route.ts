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
import { requireAuth, requireRole } from '@/lib/auth';
import { ApiError, ERROR_CODES } from '@/types/security.types';
import { logOrderUpdated, logOrderBatchAllocated } from '@/lib/audit';

const updateOrderSchema = z.object({
  status: z
    .enum([
      'INQUIRY',
      'RESERVED',
      'CONFIRMED',
      'ALLOCATED',
      'READY_FOR_DISPATCH',
      'DISPATCHED',
      'DELIVERED',
      'CANCELLED',
    ])
    .optional(),
  payment_status: z.enum(['PENDING', 'PARTIAL', 'PAID', 'REFUNDED']).optional(),
  dispatch_status: z.enum(['PENDING', 'SCHEDULED', 'DISPATCHED', 'DELIVERED', 'FAILED']).optional(),
  batch_id: z.string().uuid().optional(),
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
  const db = supabase as any;

  const { data: order, error } = await db
    .from('orders')
    .select('*, customers(name, phone, address, city, country), order_items(id, batch_id, quantity, unit_price, total_price, status)')
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
  const db = supabase as any;

  // Get current order
  const { data: currentOrder, error: fetchError } = await db
    .from('orders')
    .select('*, order_items(id, batch_id, quantity)')
    .eq('id', orderId)
    .is('deleted_at', null)
    .single();

  if (fetchError || !currentOrder) {
    throw new ApiError(ERROR_CODES.NOT_FOUND, 'Order not found', 404);
  }

  const { batch_id, ...orderUpdates } = validatedData;

  const updateData: any = {
    ...orderUpdates,
    updated_at: new Date().toISOString(),
  };

  const { data: updatedOrder, error } = await db
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
  if (batch_id) {
    const currentItem = Array.isArray(currentOrder.order_items) ? currentOrder.order_items[0] : null;
    const { error: allocationError } = await db
      .from('order_items')
      .update({
        batch_id,
        status: 'ALLOCATED',
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', orderId);

    if (allocationError) {
      throw new ApiError(ERROR_CODES.INTERNAL_ERROR, allocationError.message, 500);
    }

    if (batch_id !== currentItem?.batch_id) {
      await logOrderBatchAllocated(orderId, batch_id, currentOrder.total_quantity || currentItem?.quantity || 0);
    }
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
