'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, AlertCircle, Loader2, Wifi, WifiOff } from 'lucide-react'
import { login } from '../actions'
import { AUTH_MESSAGES } from '@/lib/branding'

export function PremiumLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  // Form state
  const [email, setEmail] = useState(() =>
    typeof localStorage === 'undefined' ? '' : localStorage.getItem('rememberedEmail') || ''
  )
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  // UI state
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(error)
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  )
  const [isValidating, setIsValidating] = useState(false)

  // Online status detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Clear error when user starts typing
  const handleEmailChange = (value: string) => {
    setEmail(value)
    if (localError) setLocalError(null)
  }

  const handlePasswordChange = (value: string) => {
    setPassword(value)
    if (localError) setLocalError(null)
  }

  // Form validation
  const isFormValid = email.trim() && password.trim() && !loading && isValidating === false

  // Handle login
  const handleLogin = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()

      if (!isFormValid) return

      setLoading(true)
      setIsValidating(true)
      setLocalError(null)

      try {
        const formData = new FormData()
        formData.append('email', email.trim())
        formData.append('password', password)

        const result = await login(formData)

        if (result?.error) {
          // User-friendly error messages
          let displayError = result.error
          
          if (result.error.includes('Invalid login credentials')) {
            displayError = AUTH_MESSAGES.invalidCredentials
          } else if (result.error.includes('Email not confirmed')) {
            displayError = AUTH_MESSAGES.emailNotConfirmed
          } else if (result.error.includes('User not found')) {
            displayError = AUTH_MESSAGES.accountNotFound
          }

          setLocalError(displayError)
        } else {
          // Success - redirect to dashboard
          if (rememberMe) {
            localStorage.setItem('rememberedEmail', email)
          } else {
            localStorage.removeItem('rememberedEmail')
          }
          router.push('/dashboard')
        }
      } catch (err: any) {
        setLocalError(AUTH_MESSAGES.errorOccurred)
        console.error('Login error:', err)
      } finally {
        setLoading(false)
        setIsValidating(false)
      }
    },
    [email, password, rememberMe, isFormValid, router]
  )

  return (
    <div className="w-full max-w-sm space-y-6">
      {/* Header */}
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
          Welcome back
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Sign in to access Abby Tech operations
        </p>
      </div>

      {/* Online/Offline Status */}
      <div
        className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
          isOnline
            ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-200'
            : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-200'
        }`}
      >
        {isOnline ? (
          <>
            <Wifi className="h-4 w-4" />
            <span>Connected to hatchery services</span>
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" />
            <span>Offline - limited functionality</span>
          </>
        )}
      </div>

      {/* Error Display */}
      {localError && (
        <div className="flex gap-3 rounded-lg bg-red-50 dark:bg-red-950 p-4 text-sm text-red-700 dark:text-red-200 border border-red-200 dark:border-red-800">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">{localError}</p>
            <p className="text-xs text-red-600 dark:text-red-300 mt-1">{AUTH_MESSAGES.tryAgain}</p>
          </div>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleLogin} className="space-y-4">
        {/* Email Field */}
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium text-slate-900 dark:text-slate-100">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            placeholder="operations@example.com"
            required
            disabled={loading}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-slate-900 dark:text-slate-100">
              Password
            </label>
            <button
              type="button"
              onClick={() => router.push('/login/forgot-password')}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              Forgot?
            </button>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={loading}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Remember Me */}
        <div className="flex items-center gap-2">
          <input
            id="remember"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            disabled={loading}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
          />
          <label htmlFor="remember" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            Remember me on this device
          </label>
        </div>

        {/* Login Button */}
        <button
          type="submit"
          disabled={!isFormValid || !isOnline}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-medium py-2.5 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {AUTH_MESSAGES.authenticating}
            </>
          ) : (
            'Access Hatchery Operations'
          )}
        </button>

        {!isOnline && (
          <p className="text-center text-xs text-slate-600 dark:text-slate-400">
            Internet connection required to sign in
          </p>
        )}
      </form>

      {/* Footer */}
      <div className="border-t border-slate-200 dark:border-slate-800 pt-4 text-center">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Account issues?{' '}
          <span className="text-blue-600 dark:text-blue-400 font-medium cursor-pointer hover:underline">
            Contact your administrator
          </span>
        </p>
      </div>
    </div>
  )
}
