'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  // Validate input
  if (!data.email || !data.password) {
    return { error: 'Email and password are required' }
  }

  try {
    const { error } = await supabase.auth.signInWithPassword(data)

    if (error) {
      let msg = error.message
      if (msg.includes('Invalid login credentials')) {
        msg = 'Invalid email or password'
      } else if (msg.includes('Email not confirmed')) {
        msg = 'Please confirm your email address'
      } else if (msg.includes('User not found')) {
        msg = 'Account not found'
      }
      return { error: msg }
    }

    revalidatePath('/', 'layout')
    return { success: true }
  } catch (err: any) {
    console.error('Login error:', err)
    return { error: 'Failed to connect to authentication service' }
  }
}

