'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { type EmailOtpType } from '@supabase/supabase-js'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function AuthCallbackClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function completeInvite() {
      const supabase = createClient()
      const next = searchParams.get('next') || '/auth/set-password'
      const code = searchParams.get('code')
      const tokenHash = searchParams.get('token_hash')
      const type = searchParams.get('type') as EmailOtpType | null
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (!sessionError) {
          router.replace(next)
          router.refresh()
          return
        }

        if (mounted) setError(sessionError.message)
        return
      }

      if (code) {
        const { error: codeError } = await supabase.auth.exchangeCodeForSession(code)
        if (!codeError) {
          router.replace(next)
          router.refresh()
          return
        }

        if (mounted) setError(codeError.message)
        return
      }

      if (tokenHash && type) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        })

        if (!otpError) {
          router.replace(next)
          router.refresh()
          return
        }

        if (mounted) setError(otpError.message)
        return
      }

      if (mounted) setError('Invite link did not include a usable verification token.')
    }

    completeInvite()

    return () => {
      mounted = false
    }
  }, [router, searchParams])

  if (error) {
    return (
      <div className="mt-5 rounded-md border border-red-400/20 bg-red-400/10 px-4 py-3 text-left text-sm text-red-100">
        {error}. Request a fresh staff invite.
      </div>
    )
  }

  return (
    <div className="mt-5 flex items-center justify-center gap-2 text-sm text-cyan-100">
      <Loader2 className="h-4 w-4 animate-spin" />
      Checking invite link...
    </div>
  )
}
