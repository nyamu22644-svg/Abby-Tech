'use client'

import {
  AlertTriangle,
  Bell,
  Bird,
  ChevronDown,
  Egg,
  LayoutDashboard,
  Moon,
  Search,
  Settings,
  ShoppingCart,
  Skull,
  Sun,
  Thermometer,
  UsersRound,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { appShell, componentStyles } from '@/lib/design/theme'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Egg Batches', href: '/batches', icon: Egg },
  { label: 'Incubation', href: '/incubation', icon: Thermometer },
  { label: 'Mortality', href: '/mortality', icon: Skull },
  { label: 'Orders', href: '/orders', icon: ShoppingCart },
  { label: 'Customers', href: '/customers', icon: UsersRound },
  { label: 'Alerts', href: '/alerts', icon: AlertTriangle },
  { label: 'Settings', href: '/settings', icon: Settings },
]

export function OperationalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const storedTheme = localStorage.getItem('abbye-theme') === 'dark' ? 'dark' : 'light'
      setTheme(storedTheme)
      document.documentElement.classList.toggle('dark', storedTheme === 'dark')
    })

    return () => window.cancelAnimationFrame(frame)
  }, [])

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    localStorage.setItem('abbye-theme', nextTheme)
    document.documentElement.classList.toggle('dark', nextTheme === 'dark')
  }

  return (
    <div className={appShell.root}>
      <aside className={appShell.sidebar}>
        <BrandBlock />

        <nav className={appShell.sidebarNav}>
          <div className={appShell.sidebarSectionLabel}>Hatchery Operations</div>
          <div className="space-y-2">
            {navItems.map((item) => (
              <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
            ))}
          </div>
        </nav>

        <div className={appShell.sidebarFooter}>
          <div className="flex items-center gap-3 rounded-card border border-white/10 bg-white/10 p-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white">
              EN
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <div className="truncate font-semibold text-white">Edwin N.</div>
              <div className="truncate text-xs text-blue-100/80">Manager</div>
            </div>
            <ChevronDown className="h-4 w-4 text-blue-100/70" />
          </div>

          <div className="mt-2 text-xs text-blue-100/70">Version 1.2.0</div>
        </div>
      </aside>

      <div className={appShell.content}>
        <header className={appShell.header}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center justify-between gap-4 lg:hidden">
              <BrandMark compact />
              <div className="flex items-center gap-2">
                <ThemeToggle theme={theme} onToggle={toggleTheme} />
                <NotificationButton />
              </div>
            </div>

            <div className="min-w-0 lg:min-w-[520px] lg:flex-1">
              <div className="hidden min-w-0 items-baseline gap-2 lg:flex">
                <span className="shrink-0 text-xs font-semibold uppercase text-destructive">
                  Premium Poultry Operations
                </span>
                <span className="shrink-0 text-[20px] font-semibold tracking-tight text-foreground">
                  Abbye Chicks Control Room
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  Real-time facility intelligence
                </span>
              </div>
              <div className="lg:hidden">
                <div className="text-xs font-semibold uppercase text-destructive">
                  Premium Poultry Operations
                </div>
                <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">
                  Abbye Chicks Control Room
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">Real-time facility intelligence</p>
              </div>
            </div>

            <div className="flex w-full items-center gap-2.5 lg:max-w-[650px]">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  placeholder="Search batches, telemetry, orders..."
                  className={componentStyles.searchInput}
                />
              </div>
              <div className="hidden items-center gap-2.5 lg:flex">
                <ThemeToggle theme={theme} onToggle={toggleTheme} />
                <NotificationButton />
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
                  EN
                </div>
              </div>
            </div>
          </div>

          <nav className="mt-4 flex gap-2 overflow-x-auto border-t border-border pt-3 lg:hidden">
            {navItems.map((item) => (
              <MobileNavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
            ))}
          </nav>
        </header>

        <main className={appShell.main}>
          <div className={appShell.pageCanvas}>{children}</div>
        </main>
      </div>
    </div>
  )
}

function BrandBlock() {
  return (
    <div className={appShell.sidebarHeader}>
      <BrandMark />
      <div className="mt-3 rounded-card border border-white/10 bg-white/10 p-2.5">
        <div className="flex items-center gap-2.5 text-[13px] font-semibold text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-button bg-amber-400/20 text-amber-200">
            <Bird className="h-4 w-4" />
          </span>
          Premium poultry starts here
        </div>
      </div>
    </div>
  )
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full border text-white',
        compact
          ? 'border-primary/20 bg-primary lg:border-white/25 lg:bg-white/10'
          : 'border-white/25 bg-white/10 dark:border-white/10'
      )}>
        <Bird className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className={cn('font-semibold text-white', compact && 'text-foreground lg:text-white')}>
          Abbye Chicks
        </div>
        <div className={cn('text-xs font-medium uppercase text-blue-100/85', compact && 'text-muted-foreground lg:text-blue-100/85')}>
          Smart Hatchery OS
        </div>
      </div>
    </div>
  )
}

function NavLink({
  item,
  active,
}: {
  item: (typeof navItems)[number]
  active: boolean
}) {
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      className={cn(
        componentStyles.navItem,
        active
          ? `${componentStyles.navItemLightActive} ${componentStyles.navItemDarkActive}`
          : componentStyles.navItemInactive
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
      <span>{item.label}</span>
    </Link>
  )
}

function MobileNavLink({
  item,
  active,
}: {
  item: (typeof navItems)[number]
  active: boolean
}) {
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      className={cn(
        componentStyles.mobileNavItem,
        active ? componentStyles.mobileNavActive : componentStyles.mobileNavInactive
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  )
}

function NotificationButton() {
  const [activeCount, setActiveCount] = useState(0)
  const [latestAlert, setLatestAlert] = useState<{
    title: string
    source: string
    severity: string
  } | null>(null)
  const [open, setOpen] = useState(false)
  const [notificationStatus, setNotificationStatus] = useState<'unsupported' | NotificationPermission>('default')
  const [osAlertsEnabled, setOsAlertsEnabled] = useState(false)
  const latestAlertKeyRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) return

      if ('Notification' in window) {
        setNotificationStatus(window.Notification.permission)
        setOsAlertsEnabled(localStorage.getItem('abbye-os-alerts') === 'enabled')
        latestAlertKeyRef.current = localStorage.getItem('abbye-last-os-alert')
      } else {
        setNotificationStatus('unsupported')
      }
    })

    async function loadSummary() {
      try {
        const response = await fetch('/api/v1/system-alerts/summary', {
          cache: 'no-store',
        })
        if (!response.ok) return
        const summary = await response.json()
        if (!cancelled) {
          const nextActiveCount = Number(summary.activeCount || 0)
          const nextLatestAlert = summary.latest || null
          setActiveCount(nextActiveCount)
          setLatestAlert(nextLatestAlert)

          maybeNotify({
            activeCount: nextActiveCount,
            latestAlert: nextLatestAlert,
          })
        }
      } catch {
        if (!cancelled) {
          setActiveCount(0)
          setLatestAlert(null)
        }
      }
    }

    function maybeNotify({
      activeCount,
      latestAlert,
    }: {
      activeCount: number
      latestAlert: { title: string; source: string; severity: string } | null
    }) {
      if (!('Notification' in window)) return
      if (window.Notification.permission !== 'granted') return
      if (localStorage.getItem('abbye-os-alerts') !== 'enabled') return
      if (!latestAlert || activeCount <= 0) return

      const alertKey = `${latestAlert.source}:${latestAlert.severity}:${latestAlert.title}`
      if (latestAlertKeyRef.current === alertKey) return

      latestAlertKeyRef.current = alertKey
      localStorage.setItem('abbye-last-os-alert', alertKey)

      new window.Notification('Abbye Chicks system alert', {
        body: `${latestAlert.source}: ${latestAlert.title}`,
        tag: alertKey,
      })
    }

    loadSummary()
    const interval = window.setInterval(loadSummary, 60_000)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      window.clearInterval(interval)
    }
  }, [])

  const label = activeCount > 0
    ? `${activeCount} active system alert${activeCount === 1 ? '' : 's'}`
    : 'No active system alerts'

  async function enableOsAlerts() {
    if (!('Notification' in window)) {
      setNotificationStatus('unsupported')
      return
    }

    const permission = await window.Notification.requestPermission()
    setNotificationStatus(permission)

    if (permission === 'granted') {
      localStorage.setItem('abbye-os-alerts', 'enabled')
      setOsAlertsEnabled(true)

      if (latestAlert && activeCount > 0) {
        const alertKey = `${latestAlert.source}:${latestAlert.severity}:${latestAlert.title}`
        latestAlertKeyRef.current = alertKey
        localStorage.setItem('abbye-last-os-alert', alertKey)
        new window.Notification('Abbye Chicks system alert', {
          body: `${latestAlert.source}: ${latestAlert.title}`,
          tag: alertKey,
        })
      }
    }
  }

  function disableOsAlerts() {
    localStorage.setItem('abbye-os-alerts', 'disabled')
    setOsAlertsEnabled(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        className={componentStyles.iconButton}
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className="h-[18px] w-[18px]" />
        {activeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full border-2 border-card bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
            {activeCount > 9 ? '9+' : activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[280px] overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow-elevated)]">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-semibold text-foreground">System alerts</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {activeCount > 0 ? `${activeCount} active alert${activeCount === 1 ? '' : 's'}` : 'No active alerts'}
            </div>
          </div>

          {latestAlert && (
            <div className="border-b border-border px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Latest
              </div>
              <div className="mt-1 text-sm font-medium text-foreground">{latestAlert.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {latestAlert.source} - {latestAlert.severity}
              </div>
            </div>
          )}

          <div className="space-y-2 px-4 py-3">
            <Link
              href="/alerts"
              className="flex h-9 items-center justify-center rounded-button bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              onClick={() => setOpen(false)}
            >
              View all alerts
            </Link>

            {notificationStatus === 'unsupported' ? (
              <div className="rounded-button border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                OS notifications are not supported in this browser.
              </div>
            ) : notificationStatus === 'denied' ? (
              <div className="rounded-button border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                Browser notifications are blocked. Enable them in browser settings to receive OS alerts.
              </div>
            ) : notificationStatus === 'granted' && osAlertsEnabled ? (
              <button
                type="button"
                onClick={disableOsAlerts}
                className="h-9 w-full rounded-button border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted/50"
              >
                Disable OS alerts
              </button>
            ) : (
              <button
                type="button"
                onClick={enableOsAlerts}
                className="h-9 w-full rounded-button border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted/50"
              >
                Enable OS alerts
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: 'light' | 'dark'
  onToggle: () => void
}) {
  const Icon = theme === 'dark' ? Sun : Moon
  const label = theme === 'dark' ? 'Use light theme' : 'Use dark theme'

  return (
    <button type="button" onClick={onToggle} className={componentStyles.iconButton} aria-label={label} title={label}>
      <Icon className="h-5 w-5" />
    </button>
  )
}
