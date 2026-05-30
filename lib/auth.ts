// User & Auth Utilities
// Production helpers for authentication and authorization

import { createClient } from '@/lib/supabase/server';
import { UserProfile } from '@/types/security.types';
import { ApiError, ERROR_CODES } from '@/types/security.types';

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

    return profile as UserProfile;
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

    return profile as UserProfile;
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

    return (profiles || []) as UserProfile[];
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
      .select('active')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return false;
    }

    return data.active === true;
  } catch (err) {
    console.error('Error checking user active status:', err);
    return false;
  }
}
