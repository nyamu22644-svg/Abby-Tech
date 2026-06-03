'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'

const customerRelationshipSchema = z.object({
  name: z.string().min(1, 'Customer name is required'),
  phone: z.string().optional(),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  preferredBreed: z.string().optional(),
  preferredPaymentMethod: z.enum(['M_PESA', 'CASH', 'BANK_TRANSFER', 'CARD', 'OTHER']).optional().or(z.literal('')),
  relationshipNotes: z.string().optional(),
  followUpAt: z.string().optional(),
  followUpReason: z.string().optional(),
  customerStatus: z.enum(['ACTIVE', 'WATCHLIST', 'INACTIVE']).default('ACTIVE'),
})

export async function updateCustomerRelationship(customerId: string, formData: FormData) {
  const result = customerRelationshipSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone') || undefined,
    email: formData.get('email') || '',
    address: formData.get('address') || undefined,
    city: formData.get('city') || undefined,
    country: formData.get('country') || undefined,
    preferredBreed: formData.get('preferredBreed') || undefined,
    preferredPaymentMethod: formData.get('preferredPaymentMethod') || '',
    relationshipNotes: formData.get('relationshipNotes') || undefined,
    followUpAt: formData.get('followUpAt') || undefined,
    followUpReason: formData.get('followUpReason') || undefined,
    customerStatus: formData.get('customerStatus') || 'ACTIVE',
  })

  if (!result.success) {
    return { success: false, error: 'Check the customer fields and try again.' }
  }

  const supabase = await createClient()
  const db = supabase as any
  const now = new Date().toISOString()

  const { error } = await db
    .from('customers')
    .update({
      name: result.data.name,
      phone: result.data.phone || null,
      email: result.data.email || null,
      address: result.data.address || null,
      city: result.data.city || null,
      country: result.data.country || null,
      preferred_breed: result.data.preferredBreed || null,
      preferred_payment_method: result.data.preferredPaymentMethod || null,
      relationship_notes: result.data.relationshipNotes || null,
      follow_up_at: result.data.followUpAt ? new Date(result.data.followUpAt).toISOString() : null,
      follow_up_reason: result.data.followUpReason || null,
      customer_status: result.data.customerStatus,
      updated_at: now,
    })
    .eq('id', customerId)
    .is('deleted_at', null)

  if (error) {
    return { success: false, error: error.message || 'Failed to update customer' }
  }

  revalidatePath('/customers')
  revalidatePath(`/customers/${customerId}`)
  return { success: true }
}

export async function createCustomerRelationship(formData: FormData) {
  const result = customerRelationshipSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone') || undefined,
    email: formData.get('email') || '',
    address: formData.get('address') || undefined,
    city: formData.get('city') || undefined,
    country: formData.get('country') || undefined,
    preferredBreed: formData.get('preferredBreed') || undefined,
    preferredPaymentMethod: formData.get('preferredPaymentMethod') || '',
    relationshipNotes: formData.get('relationshipNotes') || undefined,
    followUpAt: formData.get('followUpAt') || undefined,
    followUpReason: formData.get('followUpReason') || undefined,
    customerStatus: formData.get('customerStatus') || 'ACTIVE',
  })

  if (!result.success) {
    return { success: false, error: 'Check the customer fields and try again.' }
  }

  const supabase = await createClient()
  const db = supabase as any
  const now = new Date().toISOString()

  if (result.data.phone) {
    const { data: existing } = await db
      .from('customers')
      .select('id')
      .eq('phone', result.data.phone)
      .is('deleted_at', null)
      .maybeSingle()

    if (existing) {
      return { success: false, error: 'A customer with this phone number already exists.' }
    }
  }

  const { error } = await db.from('customers').insert({
    name: result.data.name,
    phone: result.data.phone || null,
    email: result.data.email || null,
    address: result.data.address || null,
    city: result.data.city || null,
    country: result.data.country || null,
    preferred_breed: result.data.preferredBreed || null,
    preferred_payment_method: result.data.preferredPaymentMethod || null,
    relationship_notes: result.data.relationshipNotes || null,
    follow_up_at: result.data.followUpAt ? new Date(result.data.followUpAt).toISOString() : null,
    follow_up_reason: result.data.followUpReason || null,
    customer_status: result.data.customerStatus,
    created_at: now,
    updated_at: now,
  })

  if (error) {
    return { success: false, error: error.message || 'Failed to create customer' }
  }

  revalidatePath('/customers')
  return { success: true }
}
