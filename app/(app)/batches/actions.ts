'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const createBatchSchema = z.object({
  batch_number: z.string().min(1, 'Batch number is required'),
  supplier_name: z.string().min(1, 'Supplier name is required'),
  quantity_received: z.number().int().positive('Quantity must be greater than 0'),
  status: z.enum(['RECEIVED', 'STORED', 'EARLY_INCUBATION', 'CANDLING', 'LOCKDOWN', 'HATCHING', 'COMPLETED', 'SOLD', 'ARCHIVED', 'DISCARDED']),
  egg_purchase_cost: z.number().min(0).default(0),
  transport_cost: z.number().min(0).default(0),
  misc_initial_cost: z.number().min(0).default(0),
})

export async function createBatch(formData: FormData) {
  const result = createBatchSchema.safeParse({
    batch_number: formData.get('batch_number'),
    supplier_name: formData.get('supplier_name'),
    quantity_received: Number(formData.get('quantity')),
    status: formData.get('status') || 'RECEIVED',
    egg_purchase_cost: Number(formData.get('egg_purchase_cost') || 0),
    transport_cost: Number(formData.get('transport_cost') || 0),
    misc_initial_cost: Number(formData.get('misc_initial_cost') || 0),
  })

  if (!result.success) {
    return { success: false, errors: result.error.flatten().fieldErrors }
  }

  const supabase = await createClient()

  const total_initial_cost = result.data.egg_purchase_cost + result.data.transport_cost + result.data.misc_initial_cost;

  const { error } = await supabase.from('egg_batches').insert({
    ...result.data,
    total_initial_cost,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })

  if (error) {
    console.error('Error creating batch:', error)
    return { success: false, error: error.message || 'Failed to create batch' }
  }

  revalidatePath('/batches')
  return { success: true }
}

export async function updateBatchStatus(id: string, status: string, additionalUpdates: any = {}) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('egg_batches')
    .update({ 
      status, 
      ...additionalUpdates,
      updated_at: new Date().toISOString() 
    })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message || 'Failed to update status' }
  }

  revalidatePath('/batches')
  revalidatePath(`/batches/${id}`)
  return { success: true }
}

export async function deleteBatch(id: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('egg_batches')
    .delete()
    .eq('id', id)

  if (error) {
    return { success: false, error: 'Failed to delete batch' }
  }

  revalidatePath('/batches')
  return { success: true }
}

export async function recordCandling(id: string,  culledCount: number) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('egg_batches')
    .update({ 
      status: 'LOCKDOWN',
      quantity_culled: culledCount,
      updated_at: new Date().toISOString() 
    })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message || 'Failed to record candling' }
  }

  revalidatePath('/batches')
  revalidatePath(`/batches/${id}`)
  return { success: true }
}

export async function recordHatch(id: string, hatchedCount: number) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('egg_batches')
    .update({ 
      status: 'COMPLETED',
      quantity_hatched: hatchedCount,
      actual_hatch_date: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString() 
    })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message || 'Failed to record hatch' }
  }

  revalidatePath('/batches')
  revalidatePath(`/batches/${id}`)
  return { success: true }
}

const operationalCostSchema = z.object({
  batch_id: z.string(),
  category: z.enum(['ELECTRICITY', 'GENERATOR_FUEL', 'LABOR', 'VACCINATION', 'MAINTENANCE', 'PACKAGING', 'TRANSPORT', 'MEDICATION', 'OTHER']),
  description: z.string().min(1, 'Description is required'),
  amount: z.number().positive('Amount must be greater than 0'),
})

export async function addOperationalCost(formData: FormData) {
  const result = operationalCostSchema.safeParse({
    batch_id: formData.get('batch_id'),
    category: formData.get('category'),
    description: formData.get('description'),
    amount: Number(formData.get('amount')),
  })

  if (!result.success) {
    return { success: false, errors: result.error.flatten().fieldErrors }
  }

  const supabase = await createClient()

  const { error } = await supabase.from('operational_costs').insert({
    ...result.data,
    created_at: new Date().toISOString()
  })

  if (error) {
    console.error('Error logging cost:', error)
    return { success: false, error: error.message || 'Failed to log cost' }
  }

  revalidatePath(`/batches/${result.data.batch_id}`)
  return { success: true }
}
