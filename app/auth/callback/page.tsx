import { Metadata } from 'next'
import { Suspense } from 'react'
import { AbbytechLogo } from '@/components/branding/logo'
import { AuthCallbackClient } from './auth-callback-client'

export const metadata: Metadata = {
  title: 'Verifying Invite | Abbye Chicks',
  description: 'Completing staff invite verification.',
}

export default function AuthCallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-slate-900/95 p-6 text-center shadow-2xl">
        <div className="mb-5 flex justify-center">
          <AbbytechLogo size="md" showText variant="dark" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-white">Verifying staff invite</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Keep this window open while the system prepares password setup.
        </p>
        <Suspense fallback={null}>
          <AuthCallbackClient />
        </Suspense>
      </div>
    </main>
  )
}
