'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useSubmitLock } from '@/hooks/use-submit-lock'
import { CheckCircle } from 'lucide-react'
import { markAlertResolved } from '../actions'

export function ResolveAlertButton({ alertId }: { alertId: string }) {
  const [loading, setLoading] = useState(false)
  const { acquireSubmitLock, releaseSubmitLock } = useSubmitLock()
  const router = useRouter()

  const handleResolve = async () => {
    if (!acquireSubmitLock()) return
    setLoading(true)
    try {
      const result = await markAlertResolved(alertId)
      if (result.success) {
        router.refresh()
      }
    } finally {
      releaseSubmitLock()
      setLoading(false)
    }
  }

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleResolve} 
      disabled={loading}
      aria-busy={loading}
      className="text-xs shrink-0"
    >
      <CheckCircle className="w-3 h-3 " />
      <span className="sr-only sm:not-sr-only sm:ml-2">Resolve</span>
    </Button>
  )
}
