import { darkColors, lightColors } from './colors'

export const spacing = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  6: '24px',
  8: '32px',
} as const

export const typography = {
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headingWeight: 600,
  labelWeight: 500,
  bodyWeight: 400,
  scale: {
    caption: '12px',
    body: '14px',
    bodyLarge: '16px',
    title: '20px',
    pageTitle: '24px',
    metric: '32px',
  },
} as const

export const radius = {
  card: '16px',
  button: '12px',
  input: '12px',
  badge: '999px',
} as const

export const shadows = {
  lightCard: '0 1px 2px rgba(15, 23, 42, 0.04), 0 16px 40px rgba(15, 23, 42, 0.06)',
  lightElevated: '0 20px 50px rgba(15, 23, 42, 0.10)',
  darkCard: '0 1px 0 rgba(255, 255, 255, 0.03), 0 18px 48px rgba(0, 0, 0, 0.28)',
  darkElevated: '0 24px 60px rgba(0, 0, 0, 0.36)',
} as const

export const cssThemeVariables = {
  light: {
    '--background': lightColors.background,
    '--foreground': lightColors.textPrimary,
    '--card': lightColors.surface,
    '--card-foreground': lightColors.textPrimary,
    '--popover': lightColors.surface,
    '--popover-foreground': lightColors.textPrimary,
    '--primary': lightColors.primary,
    '--primary-foreground': lightColors.surface,
    '--secondary': '#EEF4FF',
    '--secondary-foreground': lightColors.textPrimary,
    '--muted': '#F1F5F9',
    '--muted-foreground': lightColors.textSecondary,
    '--accent': lightColors.warning,
    '--accent-foreground': '#111827',
    '--destructive': lightColors.danger,
    '--border': lightColors.border,
    '--input': lightColors.border,
    '--ring': lightColors.primary,
    '--sidebar': `linear-gradient(180deg, ${lightColors.sidebarStart} 0%, ${lightColors.sidebarEnd} 100%)`,
  },
  dark: {
    '--background': darkColors.background,
    '--foreground': darkColors.textPrimary,
    '--card': darkColors.surface,
    '--card-foreground': darkColors.textPrimary,
    '--popover': darkColors.elevated,
    '--popover-foreground': darkColors.textPrimary,
    '--primary': darkColors.primary,
    '--primary-foreground': darkColors.textPrimary,
    '--secondary': darkColors.elevated,
    '--secondary-foreground': darkColors.textPrimary,
    '--muted': darkColors.elevated,
    '--muted-foreground': darkColors.textSecondary,
    '--accent': darkColors.telemetryCyan,
    '--accent-foreground': darkColors.textPrimary,
    '--destructive': darkColors.danger,
    '--border': darkColors.border,
    '--input': darkColors.border,
    '--ring': darkColors.primary,
    '--sidebar': darkColors.sidebar,
  },
} as const

export const appShell = {
  root: 'min-h-screen bg-background font-sans text-foreground',
  sidebar:
    'app-sidebar fixed inset-y-0 left-0 z-20 hidden w-[260px] flex-col text-white shadow-[var(--shadow-sidebar)] lg:flex',
  sidebarHeader: 'border-b border-white/10 p-3',
  sidebarSectionLabel: 'px-2 pb-2.5 text-[11px] font-semibold uppercase text-blue-100/80',
  sidebarNav: 'flex-1 overflow-y-auto px-3 py-3',
  sidebarFooter: 'border-t border-white/10 p-2.5',
  content: 'flex min-h-screen min-w-0 flex-col lg:pl-[260px]',
  header:
    'sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8 lg:py-2',
  main: 'flex-1 overflow-y-auto px-4 py-3.5 sm:px-6 lg:px-8',
  pageCanvas: 'mx-auto max-w-[1520px] space-y-4',
} as const

export const componentStyles = {
  navItem:
    'flex items-center gap-3 rounded-button border px-3 py-2 text-[13px] font-medium transition-all',
  navItemLightActive: 'border-white bg-white text-primary shadow-[var(--shadow-nav-active)]',
  navItemDarkActive: 'dark:border-primary/40 dark:bg-primary dark:text-white dark:shadow-[var(--shadow-nav-active-dark)]',
  navItemInactive:
    'border-transparent text-white/80 hover:bg-white/10 hover:text-white dark:text-slate-300 dark:hover:bg-white/10',
  mobileNavItem:
    'flex shrink-0 items-center gap-2 rounded-button border px-3 py-2 text-xs font-medium transition-all',
  mobileNavActive: 'border-primary bg-primary text-white',
  mobileNavInactive: 'border-border bg-card text-muted-foreground',
  searchInput:
    'h-9 w-full rounded-input border border-input bg-background px-4 pl-9 text-[13px] font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10',
  iconButton:
    'relative flex h-9 w-9 items-center justify-center rounded-button border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground',
  kpiCard: 'rounded-card border border-border bg-card p-5 shadow-[var(--shadow-card)]',
  cardHeader: 'flex items-center justify-between border-b border-border px-5 py-4',
} as const

export const pageHierarchy = [
  'Header',
  'KPI Cards',
  'Primary Operational Content',
  'Secondary Insights',
  'Activity / Alerts',
] as const
