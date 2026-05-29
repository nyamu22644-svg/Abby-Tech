'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function logMortalityEvent(formData: FormData) {
  const supabase = await createClient()

  // Input parsing
  const batchId = formData.get('batch_id') as string
  const stage = formData.get('stage') as any
  const cause = formData.get('cause') as any
  const count = parseInt(formData.get('count') as string, 10)
  const notes = formData.get('notes') as string || null

  if (!batchId || !stage || !cause || isNaN(count) || count <= 0) {
    return { error: 'Invalid input data' }
  }

  // Get user session
  const { data: { session } } = await supabase.auth.getSession()

  // Calculate estimated financial loss
  // First, get the batch details and operational costs
  const { data: batch, error: batchError } = await supabase
    .from('egg_batches')
    .select('quantity_received, quantity_hatched, total_initial_cost, mortality_count, total_financial_loss')
    .eq('id', batchId)
    .single()

  if (batchError || !batch) {
    return { error: 'Failed to fetch batch data' }
  }

  // Get operational costs for the batch
  const { data: opCosts, error: opCostsError } = await supabase
    .from('operational_costs')
    .select('amount')
    .eq('batch_id', batchId)

  const totalOpCosts = opCosts ? opCosts.reduce((sum, cost) => sum + Number(cost.amount), 0) : 0
  const totalBaseCost = Number(batch.total_initial_cost || 0) + totalOpCosts

  // Determine divisor for chick value
  // If hatched, use quantity_hatched or received. Usually mortality is based on cost per egg received, 
  // but to be safe we just use total costs / quantity_received.
  const divisor = batch.quantity_received > 0 ? batch.quantity_received : 1
  const costPerChick = totalBaseCost / divisor
  const estimatedLoss = costPerChick * count

  // Insert mortality event
  const { error: insertError } = await supabase
    .from('mortality_events')
    .insert({
      batch_id: batchId,
      stage,
      cause,
      count,
      notes,
      estimated_financial_loss: estimatedLoss,
      recorded_by: session?.user?.id || null
    })

  if (insertError) {
    console.error('Insert Error:', insertError)
    return { error: 'Failed to record mortality event: ' + insertError.message }
  }

  // Update batch totals
  const newMortalityCount = (batch.mortality_count || 0) + count
  const newTotalLoss = Number(batch.total_financial_loss || 0) + estimatedLoss

  const { error: updateError } = await supabase
    .from('egg_batches')
    .update({
      mortality_count: newMortalityCount,
      total_financial_loss: newTotalLoss
    })
    .eq('id', batchId)

  if (updateError) {
    console.error('Update Batch Error:', updateError)
    return { error: 'Failed to update batch totals' }
  }

  revalidatePath('/mortality')
  revalidatePath('/batches')
  revalidatePath(`/batches/${batchId}`)

  return { success: true }
}
