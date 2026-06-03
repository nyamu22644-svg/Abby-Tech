// API: PATCH /api/v1/alerts/[id] - Update alert status

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

const updateAlertSchema = z.object({
  status: z.enum(['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'SILENCED']),
});

export const PATCH = apiHandler(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  validateMethod(req, ['PATCH']);

  const user = await requireRole('MANAGER');
  const params = await props.params;
  const alertId = params.id;

  if (!alertId) {
    throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 'Alert ID is required', 400);
  }

  const body = await getJsonBody(req);
  const validatedData = updateAlertSchema.parse(body);
  const now = new Date().toISOString();

  const supabase = await createClient();
  const updates: Record<string, string | null> = {
    status: validatedData.status,
  };

  if (validatedData.status === 'ACKNOWLEDGED') {
    updates.acknowledged_at = now;
    updates.acknowledged_by = user.id;
  }

  if (validatedData.status === 'RESOLVED') {
    updates.resolved_at = now;
    updates.resolved_by = user.id;
  }

  const { data: updatedAlert, error } = await supabase
    .from('alert_events')
    .update(updates)
    .eq('id', alertId)
    .select()
    .single();

  if (error || !updatedAlert) {
    throw new ApiError(ERROR_CODES.NOT_FOUND, 'Alert not found', 404);
  }

  return successResponse(updatedAlert, 200);
});
