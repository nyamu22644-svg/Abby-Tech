'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, AlertCircle, Loader2, Wifi, WifiOff, ArrowRight } from 'lucide-react'
import { login } from '../actions'
import { AUTH_MESSAGES } from '@/lib/branding'

export function GlassmorphicLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(error)
  const [isOnline, setIsOnline] = useState(true)
  const [isValidating, setIsValidating] = useState(false)

  // Online status detection
  useEffect(() => {
    let cancelled = false
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) return
      setEmail(localStorage.getItem('rememberedEmail') || '')
      setIsOnline(navigator.onLine)
    })

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleEmailChange = (value: string) => {
    setEmail(value)
    if (localError) setLocalError(null)
  }

  const handlePasswordChange = (value: string) => {
    setPassword(value)
    if (localError) setLocalError(null)
  }

  const isFormValid = email.trim() && password.trim() && !loading && isValidating === false

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
      {/* Card with glassmorphism */}
      <div className="relative">
        {/* Glow effect behind card */}
        <div className="absolute -inset-2 bg-gradient-to-r from-blue-600/20 to-emerald-600/20 rounded-2xl blur-xl opacity-75 group-hover:opacity-100 transition duration-1000" />

        <div className="relative bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="space-y-2 text-center mb-8">
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-300 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">
              Hatchery Access
            </h1>
            <p className="text-sm text-slate-400">
              Abbye Chicks operations console
            </p>
          </div>

          {/* Connection Status */}
          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium mb-6 transition-all ${
              isOnline
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="h-3.5 w-3.5" />
                <span>System Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5" />
                <span>Offline Mode</span>
              </>
            )}
          </div>

          {/* Error Display */}
          {localError && (
            <div className="flex gap-3 rounded-lg bg-red-500/10 border border-red-500/30 p-3.5 text-sm text-red-300 mb-6">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{localError}</p>
                <p className="text-xs text-red-400/80 mt-1">{AUTH_MESSAGES.tryAgain}</p>
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-xs font-medium uppercase tracking-widest text-slate-300">
                Operations Email
              </label>
              <div className="relative group">
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder="admin@hatchery.local"
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group-hover:border-white/20"
                />
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-600/0 via-blue-600/0 to-blue-600/0 group-hover:from-blue-600/10 group-hover:to-blue-600/10 pointer-events-none" />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label htmlFor="password" className="block text-xs font-medium uppercase tracking-widest text-slate-300">
                Access Code
              </label>
              <div className="relative group">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  placeholder="************"
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group-hover:border-white/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-emerald-600/0 via-emerald-600/0 to-emerald-600/0 group-hover:from-emerald-600/10 group-hover:to-emerald-600/10 pointer-events-none" />
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-3 pt-2">
              <input
                id="remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/50 cursor-pointer disabled:opacity-50"
              />
              <label htmlFor="remember" className="text-sm text-slate-400 cursor-pointer select-none hover:text-slate-300 transition">
                Remember this terminal
              </label>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={!isFormValid || !isOnline}
              className="w-full relative group mt-6"
            >
              {/* Button glow effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-emerald-600 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-1000 disabled:opacity-25 group-disabled:opacity-25" />

              <div className="relative flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-slate-700 disabled:to-slate-800 disabled:cursor-not-allowed text-white font-medium py-3 transition-all">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Open Operations Console</span>
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition" />
                  </>
                )}
              </div>
            </button>

            {!isOnline && (
              <p className="text-center text-xs text-slate-500 mt-4">
                Internet connection required for operational access
              </p>
            )}
          </form>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center">
        <p className="text-xs text-slate-500">Abbye Chicks - Premium Hatchery OS v1.0</p>
      </div>
    </div>
  )
}
