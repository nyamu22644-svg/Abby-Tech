// API: DELETE /api/v1/mortality/[id] - Void and reverse a mortality event

import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  apiHandler,
  getJsonBody,
  successResponse,
  validateMethod,
} from '@/lib/api-response';
import { requireRole } from '@/lib/auth';
import { ApiError, ERROR_CODES } from '@/types/security.types';

const voidMortalitySchema = z.object({
  reason: z.string().trim().min(8, 'Correction reason is required'),
});

export const DELETE = apiHandler(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  validateMethod(req, ['DELETE']);

  const user = await requireRole('MANAGER');
  const params = await props.params;
  const eventId = params.id;

  if (!eventId) {
    throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 'Mortality event ID is required', 400);
  }

  const body = await getJsonBody(req);
  const validatedData = voidMortalitySchema.parse(body);

  const supabase = await createClient();
  const { data: results, error } = await (supabase as any).rpc('void_mortality_event_atomic', {
    p_event_id: eventId,
    p_reason: validatedData.reason,
    p_voided_by: user.id,
  });

  if (error) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, error.message, 500);
  }

  const result = Array.isArray(results) ? results[0] : results;
  if (!result?.event_id) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, 'Mortality event correction was not returned', 500);
  }

  return successResponse(result, 200);
});
