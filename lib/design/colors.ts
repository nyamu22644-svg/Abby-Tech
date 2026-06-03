export const lightColors = {
  primary: '#2563EB',
  sidebarStart: '#1D4ED8',
  sidebarEnd: '#1E3A8A',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#0EA5E9',
} as const

export const darkColors = {
  background: '#030712',
  sidebar: 'linear-gradient(180deg, #063B9E 0%, #062056 45%, #030B1F 100%)',
  surface: '#071527',
  elevated: '#0B1A31',
  primary: '#1677FF',
  telemetryCyan: '#06B6D4',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  border: '#223557',
  success: '#2DD46F',
  warning: '#FBBF24',
  danger: '#FF3B5C',
  info: '#38BDF8',
} as const

export const chartColors = {
  blue: lightColors.primary,
  darkBlue: darkColors.primary,
  cyan: darkColors.telemetryCyan,
  success: lightColors.success,
  warning: lightColors.warning,
  danger: lightColors.danger,
} as const

export type LightColorToken = keyof typeof lightColors
export type DarkColorToken = keyof typeof darkColors
