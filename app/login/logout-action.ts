'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function logout() {
  const supabase = await createClient()

  try {
    await supabase.auth.signOut()
    revalidatePath('/', 'layout')
    return { success: true }
  } catch (err: any) {
    console.error('Logout error:', err)
    return { error: 'Failed to logout' }
  }
}
