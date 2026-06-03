import { Metadata } from 'next'
import { Suspense } from 'react'
import { AbbytechLogo } from '@/components/branding/logo'
import { SetPasswordForm } from './set-password-form'

export const metadata: Metadata = {
  title: 'Set Password | Abbye Chicks',
  description: 'Create your staff login password.',
}

export default function SetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-slate-900/95 p-6 shadow-2xl">
        <div className="mb-6">
          <AbbytechLogo size="md" showText variant="dark" />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-white">Create your password</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Use a private password for this staff account. Do not use another operator&apos;s testing password.
          </p>
        </div>
        <Suspense fallback={null}>
          <SetPasswordForm />
        </Suspense>
      </div>
    </main>
  )
}
