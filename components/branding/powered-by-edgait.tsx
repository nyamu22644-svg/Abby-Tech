import { ExternalLink } from 'lucide-react'

import { SYSTEM_BRANDING } from '@/lib/branding'
import { cn } from '@/lib/utils'

type PoweredByEdgaitProps = {
  className?: string
  variant?: 'sidebar' | 'dark'
}

export function PoweredByEdgait({ className, variant = 'dark' }: PoweredByEdgaitProps) {
  return (
    <a
      href={SYSTEM_BRANDING.vendorUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2',
        variant === 'sidebar'
          ? 'text-blue-100/75 hover:text-white focus-visible:ring-offset-primary'
          : 'text-slate-500 hover:text-cyan-200 focus-visible:ring-offset-background',
        className
      )}
    >
      <span>Powered by {SYSTEM_BRANDING.vendorName}</span>
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  )
}
