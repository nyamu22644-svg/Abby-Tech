'use client'

import { useEffect, useState } from 'react'
import { useAuth } from './auth-context'

interface CachedSession {
  sessionId: string
  email: string
  timestamp: number
}

const SESSION_CACHE_KEY = 'abby_tech_session_cache'
const SESSION_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

export function useSessionPersistence() {
  const { user, isOnline, isOfflineMode } = useAuth()
  const [hasValidCache, setHasValidCache] = useState(() => {
    if (typeof localStorage === 'undefined') return false
    return Boolean(localStorage.getItem(SESSION_CACHE_KEY))
  })

  // Save session to cache when user logs in
  useEffect(() => {
    if (user) {
      const sessionData: CachedSession = {
        sessionId: user.id,
        email: user.email || '',
        timestamp: Date.now(),
      }
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(sessionData))
      queueMicrotask(() => setHasValidCache(true))
    } else {
      localStorage.removeItem(SESSION_CACHE_KEY)
      queueMicrotask(() => setHasValidCache(false))
    }
  }, [user])

  // Check for valid cached session
  const getValidCachedSession = (): CachedSession | null => {
    try {
      const cached = localStorage.getItem(SESSION_CACHE_KEY)
      if (!cached) return null

      const session: CachedSession = JSON.parse(cached)
      const age = Date.now() - session.timestamp

      // Check if cache is still valid
      if (age > SESSION_CACHE_TTL) {
        localStorage.removeItem(SESSION_CACHE_KEY)
        return null
      }

      return session
    } catch (error) {
      console.error('Error reading session cache:', error)
      return null
    }
  }

  // Clear cache
  const clearCache = () => {
    localStorage.removeItem(SESSION_CACHE_KEY)
    setHasValidCache(false)
  }

  return {
    hasValidCache,
    getValidCachedSession,
    clearCache,
    isOfflineMode,
  }
}

// Hook for connection state with debounce
export function useConnectionStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  )
  const [wasOffline, setWasOffline] = useState(false)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)

  useEffect(() => {
    let offlineTimer: NodeJS.Timeout

    const handleOnline = () => {
      // Debounce reconnection
      clearTimeout(offlineTimer)
      setIsOnline(true)
      setWasOffline(true)
      setReconnectAttempts((prev) => prev + 1)

      // Reset after showing reconnection message
      offlineTimer = setTimeout(() => {
        setWasOffline(false)
      }, 3000)
    }

    const handleOffline = () => {
      clearTimeout(offlineTimer)
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      clearTimeout(offlineTimer)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return {
    isOnline,
    wasOffline,
    reconnectAttempts,
  }
}
