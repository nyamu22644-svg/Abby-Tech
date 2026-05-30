// API: GET /api/v1/orders - List orders with pagination
// API: POST /api/v1/orders - Create a new order

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
import { requireAuth } from '@/lib/auth';
import { ApiError, ERROR_CODES } from '@/types/security.types';
import { logOrderCreated } from '@/lib/audit';

const createOrderSchema = z.object({
  customer_name: z.string().min(1, 'Customer name is required'),
  customer_phone: z.string().optional(),
  location: z.string().optional(),
  business_name: z.string().optional(),
  quantity: z.number().int().positive('Quantity must be > 0'),
  price_per_chick: z.number().min(0).default(130),
  expected_hatch_date: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  validateMethod(req, ['GET']);

  const user = await requireAuth();
  const supabase = await createClient();
  const params = getSearchParams(req);

  let query = supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order(params.sort === 'created_at' ? 'created_at' : 'order_number', {
      ascending: params.order === 'asc',
    })
    .range(params.offset, params.offset + params.limit - 1);

  const { data: orders, count, error } = await query;

  if (error) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, error.message, 500);
  }

  return paginatedResponse(
    orders || [],
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
  const validatedData = createOrderSchema.parse(body);

  const supabase = await createClient();

  // Try to find or create customer
  let customerId = null;
  if (validatedData.customer_phone) {
    const { data: existingPhone } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', validatedData.customer_phone)
      .is('deleted_at', null)
      .maybeSingle();
    if (existingPhone) customerId = existingPhone.id;
  }

  if (!customerId) {
    const { data: existingName } = await supabase
      .from('customers')
      .select('id')
      .eq('name', validatedData.customer_name)
      .is('deleted_at', null)
      .maybeSingle();
    if (existingName) customerId = existingName.id;
  }

  if (!customerId) {
    const { data: newCust, error: custErr } = await supabase
      .from('customers')
      .insert({
        name: validatedData.customer_name,
        phone: validatedData.customer_phone || null,
        location: validatedData.location || null,
        business_name: validatedData.business_name || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (!custErr && newCust) {
      customerId = newCust.id;
    }
  }

  const order_number = `ORD-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0')}`;

  const total_amount = validatedData.quantity * validatedData.price_per_chick;

  const { data: newOrder, error } = await supabase
    .from('orders')
    .insert({
      order_number,
      customer_name: validatedData.customer_name,
      customer_phone: validatedData.customer_phone || null,
      customer_id: customerId,
      quantity: validatedData.quantity,
      price_per_chick: validatedData.price_per_chick,
      total_amount,
      balance_due: total_amount,
      amount_paid: 0,
      status: 'INQUIRY',
      payment_status: 'UNPAID',
      dispatch_status: 'PENDING',
      expected_hatch_date: validatedData.expected_hatch_date || null,
      notes: validatedData.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, error.message, 500);
  }

  await logOrderCreated(newOrder.id, validatedData);

  return successResponse(newOrder, 201);
});
