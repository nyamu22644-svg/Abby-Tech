// RBAC Enforcement & Permission Checking
// Production-grade authorization layer

import { UserRole, ROLE_PERMISSIONS, ApiError, ERROR_CODES } from '@/types/security.types';

/**
 * Check if a role has permission to perform an action on a resource
 */
export function hasPermission(
  role: UserRole | null,
  resource: string,
  action: 'create' | 'read' | 'update' | 'delete'
): boolean {
  if (!role) return false;

  const permissions = ROLE_PERMISSIONS[role];
  const actionKey = `can${action.charAt(0).toUpperCase()}${action.slice(1)}` as const;

  return permissions[actionKey].includes(resource);
}

/**
 * Assert that a role has permission; throw if not
 */
export function assertPermission(
  role: UserRole | null,
  resource: string,
  action: 'create' | 'read' | 'update' | 'delete'
): void {
  if (!hasPermission(role, resource, action)) {
    throw new ApiError(
      ERROR_CODES.FORBIDDEN,
      `User does not have ${action} permission on ${resource}`,
      403
    );
  }
}

/**
 * Check if a role can perform administrative actions
 */
export function isAdminRole(role: UserRole | null): boolean {
  return role === 'SUPER_ADMIN';
}

/**
 * Check if a role is manager or above
 */
export function isManagerOrAbove(role: UserRole | null): boolean {
  return role === 'SUPER_ADMIN' || role === 'MANAGER';
}

/**
 * Check if a role can log operational data
 */
export function canLogOperationalData(role: UserRole | null): boolean {
  return role === 'SUPER_ADMIN' || role === 'MANAGER' || role === 'TECHNICIAN';
}

/**
 * Get the role hierarchy level (higher = more permissions)
 */
export function getRoleHierarchy(role: UserRole): number {
  const hierarchy: Record<UserRole, number> = {
    SUPER_ADMIN: 4,
    MANAGER: 3,
    TECHNICIAN: 2,
    FARM_WORKER: 1,
  };
  return hierarchy[role];
}

/**
 * Check if one role can manage another role
 */
export function canManageRole(actorRole: UserRole | null, targetRole: UserRole): boolean {
  if (!actorRole) return false;
  return getRoleHierarchy(actorRole) > getRoleHierarchy(targetRole);
}

/**
 * Get readable role name for UI/logging
 */
export function getRoleDisplayName(role: UserRole): string {
  const names: Record<UserRole, string> = {
    SUPER_ADMIN: 'Super Administrator',
    MANAGER: 'Manager',
    TECHNICIAN: 'Technician',
    FARM_WORKER: 'Farm Worker',
  };
  return names[role];
}

/**
 * Get the default landing page for a role
 */
export function getDefaultRoutForRole(role: UserRole): string {
  const routes: Record<UserRole, string> = {
    SUPER_ADMIN: '/dashboard',
    MANAGER: '/dashboard',
    TECHNICIAN: '/incubation',
    FARM_WORKER: '/batches',
  };
  return routes[role];
}

/**
 * Filter a resource based on role (soft filtering for UI)
 * Note: RLS policies handle the hard enforcement
 */
export function filterByRole<T extends { [key: string]: any }>(
  items: T[],
  role: UserRole | null,
  resource: string
): T[] {
  if (!role) return [];
  if (!hasPermission(role, resource, 'read')) return [];
  return items;
}
