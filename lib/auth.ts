// User & Auth Utilities
// Production helpers for authentication and authorization

import { createClient } from '@/lib/supabase/server';
import { UserProfile, UserRole } from '@/types/security.types';
import { ApiError, ERROR_CODES } from '@/types/security.types';

type RawProfile = Record<string, any>;

function normalizeRoleCode(roleCode: string | null | undefined): UserRole {
  const normalized = String(roleCode || 'FARM_WORKER').toUpperCase();

  if (normalized === 'SUPER_ADMIN') return 'SUPER_ADMIN';
  if (normalized === 'MANAGER') return 'MANAGER';
  if (normalized === 'TECHNICIAN') return 'TECHNICIAN';
  if (normalized === 'WORKER' || normalized === 'FARM_WORKER') return 'FARM_WORKER';

  return 'FARM_WORKER';
}

function toUserProfile(profile: RawProfile, roleCode?: string | null, roleName?: string | null): UserProfile {
  const firstName = profile.first_name || null;
  const lastName = profile.last_name || null;
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;
  const status = profile.status || 'INVITED';

  return {
    ...profile,
    tenant_id: profile.tenant_id || null,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    role: normalizeRoleCode(roleCode || profile.role),
    role_name: roleName || null,
    primary_role_id: profile.primary_role_id || null,
    phone: profile.phone || null,
    status,
    active: status === 'ACTIVE',
  } as UserProfile;
}

async function resolveProfileRole(supabase: Awaited<ReturnType<typeof createClient>>, profile: RawProfile) {
  if (profile.primary_role_id) {
    const { data: role } = await supabase
      .from('roles')
      .select('role_code, role_name')
      .eq('id', profile.primary_role_id)
      .maybeSingle();

    if (role?.role_code) {
      return role;
    }
  }

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('roles(role_code, role_name)')
    .eq('user_id', profile.id)
    .eq('is_primary', true)
    .maybeSingle();

  const joinedRole = Array.isArray((userRole as any)?.roles)
    ? (userRole as any).roles[0]
    : (userRole as any)?.roles;

  return joinedRole || null;
}

/**
 * Get the current authenticated user's profile with role
 * Returns null if not authenticated or profile not found
 */
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !profile) {
      console.error('Error fetching user profile:', error);
      return null;
    }

    const joinedRole = await resolveProfileRole(supabase, profile);
    return toUserProfile(profile, joinedRole?.role_code, joinedRole?.role_name);
  } catch (err) {
    console.error('Error getting current user profile:', err);
    return null;
  }
}

/**
 * Assert that a user is authenticated
 * Throws if not authenticated
 */
export async function requireAuth(): Promise<UserProfile> {
  const profile = await getCurrentUserProfile();
  
  if (!profile) {
    throw new ApiError(
      ERROR_CODES.UNAUTHORIZED,
      'Authentication required',
      401
    );
  }

  return profile;
}

/**
 * Assert that a user has a specific role or higher
 */
export async function requireRole(requiredRole: string): Promise<UserProfile> {
  const profile = await requireAuth();

  const roleHierarchy: Record<string, number> = {
    SUPER_ADMIN: 4,
    MANAGER: 3,
    TECHNICIAN: 2,
    FARM_WORKER: 1,
  };

  const userLevel = roleHierarchy[profile.role] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;

  if (userLevel < requiredLevel) {
    throw new ApiError(
      ERROR_CODES.FORBIDDEN,
      `This action requires ${requiredRole} role or higher`,
      403
    );
  }

  return profile;
}

/**
 * Get a user profile by ID (admin only)
 */
export async function getUserProfileById(userId: string): Promise<UserProfile | null> {
  try {
    const currentUser = await requireRole('SUPER_ADMIN');

    if (!currentUser) {
      return null;
    }

    const supabase = await createClient();

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }

    const primaryRole = await resolveProfileRole(supabase, profile);
    return toUserProfile(profile, primaryRole?.role_code, primaryRole?.role_name);
  } catch (err) {
    console.error('Error getting user profile by ID:', err);
    return null;
  }
}

/**
 * List all user profiles (admin only)
 */
export async function listUserProfiles(): Promise<UserProfile[]> {
  try {
    await requireRole('SUPER_ADMIN');

    const supabase = await createClient();

    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error listing user profiles:', error);
      return [];
    }

    return await Promise.all((profiles || []).map(async (profile: any) => {
      const primaryRole = await resolveProfileRole(supabase, profile);
      return toUserProfile(profile, primaryRole?.role_code, primaryRole?.role_name);
    }));
  } catch (err) {
    console.error('Error listing user profiles:', err);
    return [];
  }
}

/**
 * Check if a user is active
 */
export async function isUserActive(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('user_profiles')
      .select('status')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return false;
    }

    return data.status === 'ACTIVE';
  } catch (err) {
    console.error('Error checking user active status:', err);
    return false;
  }
}
