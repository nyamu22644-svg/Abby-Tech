'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isOnline: boolean
  isOfflineMode: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  )
  const [isOfflineMode, setIsOfflineMode] = useState(false)

  const supabase = useMemo(() => createClient(), [])

  // Check online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      setIsOfflineMode(false)
    }

    const handleOffline = () => {
      setIsOnline(false)
      setIsOfflineMode(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        setUser(user)

        // If user exists but offline, enable offline mode
        if (user && !isOnline) {
          setIsOfflineMode(true)
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initializeAuth()
  }, [supabase, isOnline])

  // Listen for auth changes
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null)

      // Handle session expiration
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setIsOfflineMode(false)
      }

      // Refresh when session is restored
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (isOnline) {
          setIsOfflineMode(false)
        }
      }
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [supabase, isOnline])

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut()
      setUser(null)
      setIsOfflineMode(false)
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }, [supabase])

  const value = {
    user,
    isLoading,
    isOnline,
    isOfflineMode,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
