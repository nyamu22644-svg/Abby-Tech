'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { login, signup } from '../actions';

export function LoginForm() {
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();

  async function handleAction(actionType: 'login' | 'signup', formData: FormData) {
    setLoading(actionType);
    try {
      if (actionType === 'login') {
        const result = await login(formData);
        if (result?.error) {
          router.replace('/login?error=' + encodeURIComponent(result.error));
        } else {
          router.push('/batches');
        }
      } else {
        const result = await signup(formData);
        if (result?.error) {
          router.replace('/login?error=' + encodeURIComponent(result.error));
        } else {
          router.push('/batches');
        }
      }
    } catch (e) {
      console.error(e);
      router.replace('/login?error=' + encodeURIComponent('An unexpected error occurred.'));
    } finally {
      setLoading(null);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
      <div className="grid gap-2">
        <label htmlFor="email" className="text-sm font-medium leading-none">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="m@example.com"
          required
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      <div className="grid gap-2">
        <label htmlFor="password" className="text-sm font-medium leading-none">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Button 
          type="button" 
          disabled={loading !== null}
          onClick={(e) => {
            const form = e.currentTarget.closest('form');
            if (form && form.reportValidity()) {
              handleAction('login', new FormData(form));
            }
          }} 
          className="w-full"
        >
          {loading === 'login' ? 'Logging in...' : 'Login'}
        </Button>
        <Button 
          variant="outline" 
          type="button" 
          disabled={loading !== null}
          onClick={(e) => {
            const form = e.currentTarget.closest('form');
            if (form && form.reportValidity()) {
              handleAction('signup', new FormData(form));
            }
          }} 
          className="w-full"
        >
          {loading === 'signup' ? 'Signing up...' : 'Sign up'}
        </Button>
      </div>
    </form>
  )
}
