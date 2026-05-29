'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  try {
    const { data: signUpData, error } = await supabase.auth.signUp(data)

    if (error) {
      return { error: error.message }
    }

    if (signUpData.user && !signUpData.session) {
      // Supabase requires email confirmation by default. 
      return { error: 'Sign up successful! Please check your email to confirm your account (or disable Email Confirmations in Supabase Auth settings).' }
    }

    revalidatePath('/', 'layout')
    return { success: true }
  } catch (err: any) {
    return { error: 'Failed to connect to Supabase: ' + err.message }
  }
}

export async function login(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  try {
    const { error } = await supabase.auth.signInWithPassword(data)

    if (error) {
      let msg = error.message;
      if (msg.includes('Email not confirmed')) {
        msg = 'Email not confirmed. Please check your email or disable Email Confirmations in your Supabase Auth settings.'
      }
      return { error: msg }
    }

    revalidatePath('/', 'layout')
    return { success: true }
  } catch (err: any) {
    return { error: 'Failed to connect to Supabase: ' + err.message }
  }
}
