// Abby Tech Professional Branding System
// Deep operational blue + agricultural emerald

export const ABBY_TECH_COLORS = {
  // Primary operational blue
  primary: {
    950: '#0B1F3A', // deepest operational blue
    900: '#0f2847',
    800: '#132d52',
    700: '#1a3a65',
    600: '#254a8f',
    500: '#3563b8',
    400: '#5080d1',
    300: '#7aa4e0',
    200: '#a7c5f0',
    100: '#d4e1f7',
    50: '#eef2f9',
  },

  // Agricultural accent - emerald
  accent: {
    600: '#059669',
    500: '#10b981',
    400: '#34d399',
    300: '#6ee7b7',
    200: '#a7f3d0',
  },

  // Operational neutrals
  slate: {
    950: '#0f172a',
    900: '#0f172a',
    800: '#1e293b',
    700: '#334155',
    600: '#475569',
    500: '#64748b',
    400: '#94a3b8',
    300: '#cbd5e1',
    200: '#e2e8f0',
    100: '#f1f5f9',
    50: '#f8fafc',
  },

  // Semantic colors
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  offline: '#9ca3af',
}

export const BRANDING = {
  name: 'Abby Tech',
  tagline: 'Smart Hatchery Operations Platform',
  description: 'Enterprise-grade hatchery management and intelligence system',
  industry: 'Agricultural Technology',
  region: 'Kenya',
}

export const AUTH_MESSAGES = {
  // Loading states
  authenticating: 'Verifying credentials...',
  creatingAccount: 'Setting up your operational profile...',
  restoringSession: 'Restoring operational session...',
  reconnecting: 'Reconnecting to hatchery services...',
  
  // Offline states
  offlineMode: 'Offline operational mode',
  offlineDescription: 'Your session is cached. New features limited.',
  reconnected: 'Connection restored',
  
  // Success states
  loginSuccess: 'Access granted',
  logoutSuccess: 'Session ended',
  
  // Error states
  invalidCredentials: 'Invalid email or password',
  accountNotFound: 'Account not found',
  accountSuspended: 'This account has been suspended',
  accountDeactivated: 'This account is no longer active',
  passwordExpired: 'Your password has expired',
  sessionExpired: 'Your session has expired',
  unauthorized: 'Unauthorized access',
  emailNotConfirmed: 'Please confirm your email address',
  
  // Generic
  errorOccurred: 'An operational error occurred',
  tryAgain: 'Please try again',
  contactSupport: 'Contact your system administrator',
}

// Role-based color coding
export const ROLE_COLORS = {
  SUPER_ADMIN: 'text-red-600 bg-red-50 border-red-200',
  MANAGER: 'text-blue-600 bg-blue-50 border-blue-200',
  TECHNICIAN: 'text-amber-600 bg-amber-50 border-amber-200',
  FARM_WORKER: 'text-emerald-600 bg-emerald-50 border-emerald-200',
}

// Typing for roles
export type UserRole = keyof typeof ROLE_COLORS
