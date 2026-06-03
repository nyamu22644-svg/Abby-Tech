'use client'

import { useCallback, useRef } from 'react'

export function useSubmitLock() {
  const lockedRef = useRef(false)

  const acquireSubmitLock = useCallback(() => {
    if (lockedRef.current) return false
    lockedRef.current = true
    return true
  }, [])

  const releaseSubmitLock = useCallback(() => {
    lockedRef.current = false
  }, [])

  return { acquireSubmitLock, releaseSubmitLock }
}
