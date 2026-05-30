'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useConnectionStatus } from '@/lib/use-session'
import { logout } from '@/app/login/logout-action'
import { AbbytechIcon } from '@/components/branding/logo'
import { LogOut, WifiOff } from 'lucide-react'

export function OperationalNavbar() {
  const router = useRouter()
  const { user, signOut, isOfflineMode } = useAuth()
  const { isOnline, wasOffline } = useConnectionStatus()

  const handleLogout = async () => {
    await logout()
    await signOut()
    router.push('/login')
  }

  if (!user) return null

  return (
    <nav className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-40">
      <div className="px-4 py-3 flex items-center justify-between">
        {/* Left: Logo & Brand */}
        <div className="flex items-center gap-3">
          <AbbytechIcon size="sm" />
        </div>

        {/* Center: Status */}
        <div className="flex items-center gap-4 text-sm">
          {isOfflineMode && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-200">
              <WifiOff className="h-4 w-4" />
              <span>Offline Mode</span>
            </div>
          )}
          {wasOffline && !isOfflineMode && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-200 animate-pulse">
              <span>Reconnected</span>
            </div>
          )}
        </div>

        {/* Right: User Menu */}
        <div className="flex items-center gap-4">
          <div className="text-right text-sm">
            <div className="font-medium text-slate-900 dark:text-white truncate max-w-xs">
              {user.email}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>
    </nav>
  )
}
