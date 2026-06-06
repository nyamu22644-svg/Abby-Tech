// API: GET /api/v1/orders - List orders with pagination
// API: POST /api/v1/orders - Create a new order

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
import { requireRole } from '@/lib/auth';
import { requireAuth } from '@/lib/auth';
import { ApiError, ERROR_CODES } from '@/types/security.types';

const createOrderSchema = z.object({
  customer_name: z.string().min(1, 'Customer name is required'),
  customer_phone: z.string().optional(),
  location: z.string().optional(),
  quantity: z.number().int().positive('Quantity must be > 0'),
  breed_type: z.string().min(1, 'Breed type is required'),
  price_per_chick: z.number().min(0).optional(),
  discount_amount: z.number().min(0).default(0),
  expected_hatch_date: z.string().optional(),
  notes: z.string().optional(),
});

const DEFAULT_BREEDS = [
  'KARI Improved Kienyeji',
  'Improved Kienyeji',
  'Broiler',
  'Layer',
  'Local Kienyeji',
];

export const GET = apiHandler(async (req: NextRequest) => {
  validateMethod(req, ['GET']);

  const user = await requireAuth();
  const supabase = await createClient();
  const db = supabase as any;
  const params = getSearchParams(req);

  let query = db
    .from('orders')
    .select('*, customers(name, phone, address, city, country), order_items(id, batch_id, quantity, unit_price, total_price, status)', { count: 'exact' })
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
  const body = await getJsonBody<Record<string, any>>(req);

  const supabase = await createClient();
  const db = supabase as any;
  const { data: settings } = await db
    .from('business_settings')
    .select('default_chick_price, breed_options')
    .limit(1)
    .maybeSingle();
  const breedOptions = Array.isArray(settings?.breed_options) && settings.breed_options.length > 0
    ? settings.breed_options
    : DEFAULT_BREEDS;

  const validatedData = createOrderSchema.parse({
    ...body,
    price_per_chick: body?.price_per_chick ?? Number(settings?.default_chick_price ?? 130),
  });
  const catalogBreed = findCatalogBreed(validatedData.breed_type, breedOptions);

  if (!catalogBreed) {
    throw new ApiError(
      ERROR_CODES.VALIDATION_ERROR,
      'breed_type must match one of the configured breed catalog options.',
      400,
      { allowedBreeds: breedOptions }
    );
  }

  const { data: newOrder, error } = await db.rpc('create_order_atomic', {
    p_customer_name: validatedData.customer_name,
    p_customer_phone: validatedData.customer_phone || null,
    p_location: validatedData.location || null,
    p_quantity: validatedData.quantity,
    p_breed_type: catalogBreed,
    p_price_per_chick: validatedData.price_per_chick,
    p_discount_amount: validatedData.discount_amount,
    p_expected_hatch_date: validatedData.expected_hatch_date || null,
    p_notes: validatedData.notes || null,
    p_created_by: user.id,
  });

  if (error) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, error.message, 500);
  }

  const createdOrder = Array.isArray(newOrder) ? newOrder[0] : newOrder;
  return successResponse(createdOrder, 201);
});

function normalizeBreed(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function findCatalogBreed(value: string, breedOptions: string[]) {
  const requestedValue = normalizeBreed(value);
  if (!requestedValue) return null;
  return breedOptions.find((breed) => normalizeBreed(breed) === requestedValue) || null;
}
