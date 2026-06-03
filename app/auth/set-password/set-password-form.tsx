'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Lock, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function SetPasswordForm() {
  const router = useRouter()
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setHasSession(Boolean(data.session))
    })

    return () => {
      mounted = false
    }
  }, [supabase])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)

    if (password.length < 8) {
      setMessage('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.')
      return
    }

    startTransition(async () => {
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        setMessage(error.message || 'Failed to set password.')
        return
      }

      router.replace('/dashboard')
      router.refresh()
    })
  }

  if (hasSession === false) {
    return (
      <div className="rounded-md border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
        This invite session is not active. Open the latest Supabase invite email again, or ask the manager to resend the invite.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-200">New Password</span>
        <div className="flex h-11 items-center gap-2 rounded-md border border-white/10 bg-slate-950 px-3 focus-within:border-cyan-300/60">
          <Lock className="h-4 w-4 text-slate-400" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            placeholder="At least 8 characters"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="text-slate-400 hover:text-white"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-200">Confirm Password</span>
        <input
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          minLength={8}
          required
          className="h-11 w-full rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/60"
          placeholder="Repeat the password"
        />
      </label>

      {message ? (
        <div className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-100">
          {message}
        </div>
      ) : null}

      <Button type="submit" disabled={isPending || hasSession === null} className="h-11 w-full gap-2 rounded-md">
        <Save className="h-4 w-4" />
        {isPending ? 'Saving...' : 'Save Password'}
      </Button>
    </form>
  )
}
