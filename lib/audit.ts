// Audit Logging System
// Track all operational changes for compliance and debugging

import { createClient } from '@/lib/supabase/server';
import { AuditActionType, AuditLog } from '@/types/security.types';

interface AuditLogInput {
  entityType: string;
  entityId: string;
  action: AuditActionType;
  previousValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Log an operational action to the audit table
 * Should be called after any mutation (create, update, delete)
 */
export async function logAudit(input: AuditLogInput): Promise<AuditLog | null> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('audit_logs')
      .insert({
        entity_type: input.entityType,
        entity_id: input.entityId,
        action: input.action,
        performed_by: user?.id || null,
        previous_values: input.previousValues || null,
        new_values: input.newValues || null,
        metadata: input.metadata || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Audit logging error:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Unexpected audit logging error:', err);
    return null;
  }
}

/**
 * Log batch creation
 */
export async function logBatchCreated(batchId: string, batchData: any) {
  return logAudit({
    entityType: 'egg_batch',
    entityId: batchId,
    action: 'CREATE',
    newValues: batchData,
    metadata: {
      resource: 'egg_batches',
      operation: 'create',
    },
  });
}

/**
 * Log batch update with before/after values
 */
export async function logBatchUpdated(batchId: string, previousData: any, newData: any) {
  return logAudit({
    entityType: 'egg_batch',
    entityId: batchId,
    action: 'UPDATE',
    previousValues: previousData,
    newValues: newData,
    metadata: {
      resource: 'egg_batches',
      operation: 'update',
    },
  });
}

/**
 * Log batch status change specifically
 */
export async function logBatchStatusChange(
  batchId: string,
  fromStatus: string,
  toStatus: string
) {
  return logAudit({
    entityType: 'egg_batch',
    entityId: batchId,
    action: 'STATUS_CHANGE',
    previousValues: { status: fromStatus },
    newValues: { status: toStatus },
    metadata: {
      resource: 'egg_batches',
      operation: 'status_change',
      fromStatus,
      toStatus,
    },
  });
}

/**
 * Log order creation
 */
export async function logOrderCreated(orderId: string, orderData: any) {
  return logAudit({
    entityType: 'order',
    entityId: orderId,
    action: 'CREATE',
    newValues: orderData,
    metadata: {
      resource: 'orders',
      operation: 'create',
    },
  });
}

/**
 * Log order payment received
 */
export async function logOrderPaymentReceived(
  orderId: string,
  amount: number,
  previousBalance: number,
  newBalance: number
) {
  return logAudit({
    entityType: 'order',
    entityId: orderId,
    action: 'PAYMENT',
    previousValues: { balance_due: previousBalance, amount_paid: 0 },
    newValues: { balance_due: newBalance, amount_paid: amount },
    metadata: {
      resource: 'orders',
      operation: 'payment_received',
      amount,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log order batch allocation
 */
export async function logOrderBatchAllocated(
  orderId: string,
  batchId: string,
  quantity: number
) {
  return logAudit({
    entityType: 'order',
    entityId: orderId,
    action: 'ALLOCATION',
    newValues: { allocated_batch_id: batchId, quantity },
    metadata: {
      resource: 'orders',
      operation: 'batch_allocated',
      batchId,
      quantity,
    },
  });
}

/**
 * Log incubator registration
 */
export async function logIncubatorCreated(incubatorId: string, incubatorData: any) {
  return logAudit({
    entityType: 'incubator',
    entityId: incubatorId,
    action: 'CREATE',
    newValues: incubatorData,
    metadata: {
      resource: 'incubators',
      operation: 'create',
    },
  });
}

/**
 * Log mortality event
 */
export async function logMortalityLogged(
  mortalityId: string,
  batchId: string,
  count: number,
  cause: string
) {
  return logAudit({
    entityType: 'mortality_event',
    entityId: mortalityId,
    action: 'LOG_RECORDED',
    newValues: { batch_id: batchId, count, cause },
    metadata: {
      resource: 'mortality_events',
      operation: 'log_recorded',
      count,
      cause,
    },
  });
}

/**
 * Log environmental data logging (optional - can be high-volume)
 * Consider batching these if they're too frequent
 */
export async function logEnvironmentalDataLogged(
  logId: string,
  incubatorId: string,
  temperature: number | null,
  humidity: number | null
) {
  return logAudit({
    entityType: 'environmental_log',
    entityId: logId,
    action: 'LOG_RECORDED',
    newValues: { incubator_id: incubatorId, temperature, humidity },
    metadata: {
      resource: 'incubator_environmental_logs',
      operation: 'log_recorded',
      temperature,
      humidity,
    },
  });
}

/**
 * Log alert triggered
 */
export async function logAlertTriggered(
  alertId: string,
  severity: string,
  title: string,
  description: string
) {
  return logAudit({
    entityType: 'incubation_alert',
    entityId: alertId,
    action: 'ALERT_TRIGGERED',
    newValues: { severity, title, description },
    metadata: {
      resource: 'incubation_alerts',
      operation: 'alert_triggered',
      severity,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log operational cost addition
 */
export async function logOperationalCostAdded(
  costId: string,
  batchId: string,
  amount: number,
  category: string
) {
  return logAudit({
    entityType: 'operational_cost',
    entityId: costId,
    action: 'CREATE',
    newValues: { batch_id: batchId, amount, category },
    metadata: {
      resource: 'operational_costs',
      operation: 'cost_added',
      amount,
      category,
    },
  });
}

/**
 * Get audit logs for an entity
 */
export async function getAuditLogsForEntity(
  entityType: string,
  entityId: string,
  limit: number = 50
): Promise<AuditLog[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching audit logs:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Unexpected error fetching audit logs:', err);
    return [];
  }
}

/**
 * Get recent audit logs by action type
 */
export async function getRecentAuditLogs(
  action?: AuditActionType,
  limit: number = 100
): Promise<AuditLog[]> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (action) {
      query = query.eq('action', action);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching recent audit logs:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Unexpected error fetching recent audit logs:', err);
    return [];
  }
}
