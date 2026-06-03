import Link from 'next/link'
import { ArrowLeft, SearchX } from 'lucide-react'

import { Card } from '@/components/ui/card'

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <SearchX className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight text-foreground">Record not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The page or record may have been moved, deleted, or is not available to your account.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-button bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Overview
        </Link>
      </Card>
    </main>
  )
}
