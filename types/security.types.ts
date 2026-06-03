// Security & RBAC Types
// Production-grade type definitions for user roles, permissions, and audit logging

export type UserRole = 'SUPER_ADMIN' | 'MANAGER' | 'TECHNICIAN' | 'FARM_WORKER';

export interface UserProfile {
  id: string;
  tenant_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name?: string | null;
  role: UserRole;
  role_name?: string | null;
  primary_role_id: string | null;
  phone: string | null;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  active?: boolean;
  created_at: string;
  updated_at: string;
}

export type AuditActionType = 
  | 'CREATE' 
  | 'UPDATE' 
  | 'DELETE' 
  | 'STATUS_CHANGE' 
  | 'ALLOCATION' 
  | 'PAYMENT'
  | 'LOG_RECORDED' 
  | 'ALERT_TRIGGERED';

export interface AuditLog {
  id: string;
  tenant_id: string | null;
  entity_type: string;
  entity_id: string;
  action: AuditActionType;
  performed_by: string | null;
  performed_at: string;
  created_at: string;
  changes?: Array<{
    field_name: string;
    old_value: string | null;
    new_value: string | null;
  }>;
}

// Role-based permission definitions
export const ROLE_PERMISSIONS: Record<UserRole, {
  readonly canCreate: readonly string[];
  readonly canRead: readonly string[];
  readonly canUpdate: readonly string[];
  readonly canDelete: readonly string[];
}> = {
  SUPER_ADMIN: {
    canCreate: ['batches', 'orders', 'incubators', 'customers', 'users', 'alerts'],
    canRead: ['batches', 'orders', 'incubators', 'customers', 'users', 'alerts', 'audit', 'settings'],
    canUpdate: ['batches', 'orders', 'incubators', 'customers', 'users', 'alerts', 'settings'],
    canDelete: ['batches', 'orders', 'incubators', 'customers', 'users', 'alerts'],
  },
  MANAGER: {
    canCreate: ['batches', 'orders', 'incubators', 'customers', 'alerts'],
    canRead: ['batches', 'orders', 'incubators', 'customers', 'alerts', 'audit'],
    canUpdate: ['batches', 'orders', 'incubators', 'customers', 'alerts'],
    canDelete: ['batches', 'orders', 'customers'],
  },
  TECHNICIAN: {
    canCreate: ['mortality', 'environmental_logs', 'cost_entries'],
    canRead: ['batches', 'orders', 'incubators', 'mortality', 'environmental_logs', 'alerts'],
    canUpdate: ['batches', 'orders', 'environmental_logs', 'alerts'],
    canDelete: [],
  },
  FARM_WORKER: {
    canCreate: ['mortality', 'environmental_logs'],
    canRead: ['batches', 'orders', 'incubators', 'alerts'],
    canUpdate: [],
    canDelete: [],
  },
};

// Routes and their required minimum roles
export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  '/': ['SUPER_ADMIN', 'MANAGER', 'TECHNICIAN', 'FARM_WORKER'],
  '/dashboard': ['SUPER_ADMIN', 'MANAGER', 'TECHNICIAN', 'FARM_WORKER'],
  '/batches': ['SUPER_ADMIN', 'MANAGER', 'TECHNICIAN', 'FARM_WORKER'],
  '/batches/[id]': ['SUPER_ADMIN', 'MANAGER', 'TECHNICIAN', 'FARM_WORKER'],
  '/orders': ['SUPER_ADMIN', 'MANAGER', 'TECHNICIAN', 'FARM_WORKER'],
  '/orders/[id]': ['SUPER_ADMIN', 'MANAGER', 'TECHNICIAN', 'FARM_WORKER'],
  '/incubation': ['SUPER_ADMIN', 'MANAGER', 'TECHNICIAN', 'FARM_WORKER'],
  '/mortality': ['SUPER_ADMIN', 'MANAGER', 'TECHNICIAN', 'FARM_WORKER'],
  '/alerts': ['SUPER_ADMIN', 'MANAGER', 'TECHNICIAN', 'FARM_WORKER'],
  '/settings': ['SUPER_ADMIN', 'MANAGER'],
  '/api/v1/.*': ['SUPER_ADMIN', 'MANAGER', 'TECHNICIAN', 'FARM_WORKER'],
};

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  metadata?: {
    timestamp: string;
    requestId: string;
    pagination?: {
      page: number;
      limit: number;
      offset: number;
      total: number;
      totalPages: number;
    };
  };
}

export class ApiError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 400,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Common API error codes
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  INVALID_STATE: 'INVALID_STATE',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;
