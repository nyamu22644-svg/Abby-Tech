import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const requestUrl = request.nextUrl
  const code = requestUrl.searchParams.get('code')
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null
  const next = requestUrl.searchParams.get('next') || '/auth/set-password'
  const redirectUrl = requestUrl.clone()

  redirectUrl.pathname = next
  redirectUrl.search = ''

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(redirectUrl)
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    })
    if (!error) return NextResponse.redirect(redirectUrl)
  }

  const loginUrl = requestUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.searchParams.set('error', 'Invite link could not be verified. Request a fresh staff invite.')
  return NextResponse.redirect(loginUrl)
}
