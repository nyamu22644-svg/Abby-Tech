'use client'

import { Activity, LayoutDashboard, Egg, Settings, Bell, Search, Hexagon, Bird, AlertTriangle, ShoppingCart, Cross, Skull, Thermometer } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function OperationalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const navItems = [
    { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Egg Batches', href: '/batches', icon: Egg },
    { label: 'Incubation', href: '/incubation', icon: Thermometer },
    { label: 'Mortality', href: '/mortality', icon: Skull },
    { label: 'Orders', href: '/orders', icon: ShoppingCart },
    { label: 'Alerts', href: '/alerts', icon: AlertTriangle },
    { label: 'Settings', href: '/settings', icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-background flex font-sans text-foreground">
      {/* Sidebar */}
      <aside className="w-64 bg-background text-foreground flex flex-col fixed inset-y-0 left-0 z-20 border-r border-border shadow-xl shadow-black/10">
        <div className="flex h-16 items-center px-6 gap-3 border-b border-border shrink-0">
          <Hexagon className="w-6 h-6 text-primary fill-primary/20" />
          <div className="font-semibold text-lg tracking-tight flex items-center gap-2">
            Abby Tech <span className="text-muted-foreground text-xs font-medium uppercase tracking-widest mt-0.5">OS</span>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-2">
            Core Operations
          </div>
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all group",
                  active 
                    ? "bg-primary/10 text-primary border border-primary/20" 
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                )}
              >
                <Icon className={cn("w-4 h-4", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors border border-transparent hover:border-border/50">
            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
              ED
            </div>
            <div className="flex flex-col text-sm overflow-hidden">
              <span className="font-medium text-foreground truncate">Edwin N.</span>
              <span className="text-muted-foreground text-xs truncate">Manager</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col pl-64 min-w-0">
        <header className="bg-card h-16 border-b border-border flex items-center justify-between px-8 sticky top-0 z-10">
          <div className="flex-1 flex items-center max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search telemetry, batches, or orders..."
                className="w-full h-9 bg-muted/30 border border-border rounded-md pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all font-medium placeholder:font-normal"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-5 ml-4 shrink-0">
            <button className="text-muted-foreground hover:text-foreground relative transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute 1 top-0 right-0 w-2 h-2 rounded-full bg-destructive border-2 border-card"></span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
