'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CheckCircle } from 'lucide-react'
import { markAlertResolved } from '../actions'

export function ResolveAlertButton({ alertId }: { alertId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleResolve = async () => {
    setLoading(true)
    const result = await markAlertResolved(alertId)
    setLoading(false)
    if (result.success) {
      router.refresh()
    }
  }

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleResolve} 
      disabled={loading}
      className="text-xs shrink-0"
    >
      <CheckCircle className="w-3 h-3 " />
      <span className="sr-only sm:not-sr-only sm:ml-2">Resolve</span>
    </Button>
  )
}
