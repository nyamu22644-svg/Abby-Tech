'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { logOrderCreated, logOrderPaymentReceived, logOrderBatchAllocated } from '@/lib/audit'

const createOrderSchema = z.object({
  customer_name: z.string().min(1, 'Customer name is required'),
  customer_phone: z.string().optional(),
  location: z.string().optional(),
  business_name: z.string().optional(),
  quantity: z.number().int().positive('Quantity must be greater than 0'),
  price_per_chick: z.number().min(0).default(130),
  expected_hatch_date: z.string().optional(),
  notes: z.string().optional(),
})

export async function createOrder(formData: FormData) {
  const result = createOrderSchema.safeParse({
    customer_name: formData.get('customer_name'),
    customer_phone: formData.get('customer_phone') || undefined,
    location: formData.get('location') || undefined,
    business_name: formData.get('business_name') || undefined,
    quantity: Number(formData.get('quantity')),
    price_per_chick: Number(formData.get('price_per_chick') || 130),
    expected_hatch_date: formData.get('expected_hatch_date') || undefined,
    notes: formData.get('notes') || undefined,
  })

  if (!result.success) {
    return { success: false, errors: result.error.flatten().fieldErrors, error: 'Invalid formulation' }
  }

  const supabase = await createClient()

  // 1. Try to find existing customer by phone or name, else create
  let customerId = null
  if (result.data.customer_phone) {
    const { data: existingPhone } = await supabase.from('customers').select('id').eq('phone', result.data.customer_phone).maybeSingle()
    if (existingPhone) customerId = existingPhone.id
  }
  if (!customerId) {
    const { data: existingName } = await supabase.from('customers').select('id').eq('name', result.data.customer_name).maybeSingle()
    if (existingName) customerId = existingName.id
  }

  if (!customerId) {
    const { data: newCust, error: custErr } = await supabase.from('customers').insert({
      name: result.data.customer_name,
      phone: result.data.customer_phone || null,
      location: result.data.location || null,
      business_name: result.data.business_name || null,
    }).select('id').single()
    if (!custErr && newCust) {
      customerId = newCust.id
    }
  }

  // Generate a sequential order number
  const order_number = `ORD-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`

  const total_amount = result.data.quantity * result.data.price_per_chick

  const { data: orderData, error } = await supabase.from('orders').insert({
    order_number,
    customer_name: result.data.customer_name,
    customer_phone: result.data.customer_phone || null,
    customer_id: customerId,
    quantity: result.data.quantity,
    price_per_chick: result.data.price_per_chick,
    total_amount,
    balance_due: total_amount,
    amount_paid: 0,
    status: 'INQUIRY',
    payment_status: 'UNPAID',
    dispatch_status: 'PENDING',
    expected_hatch_date: result.data.expected_hatch_date || null,
    notes: result.data.notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).select('id').single()

  if (error || !orderData) {
    console.error('Failed to create order:', error)
    return { success: false, error: error?.message || 'Failed to create order' }
  }

  await supabase.from('order_audit_logs').insert({
    order_id: orderData.id,
    action: 'CREATED',
    description: `Order requested for ${result.data.quantity} chicks.`
  })

  revalidatePath('/orders')
  return { success: true }
}

export async function updateOrderStatus(id: string, status: string, additionalUpdates: any = {}) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('orders')
    .update({ 
      status, 
      ...additionalUpdates,
      updated_at: new Date().toISOString() 
    })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message || 'Failed to update order status' }
  }

  await supabase.from('order_audit_logs').insert({
    order_id: id,
    action: 'STATUS_UPDATED',
    description: `Order status changed to ${status}.`
  })

  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
  return { success: true }
}

export async function deleteOrder(id: string) {
  const supabase = await createClient()

  // Soft delete: set deleted_at instead of hard delete
  const { error } = await supabase
    .from('orders')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) {
    return { success: false, error: 'Failed to delete order' }
  }

  revalidatePath('/orders')
  return { success: true }
}

export async function allocateOrder(orderId: string, batchId: string) {
  const supabase = await createClient()

  // 1. Get the order
  const { data: order } = await supabase.from('orders').select('quantity').eq('id', orderId).single()
  if (!order) return { success: false, error: 'Order not found' }

  // 2. Get the batch and its allocated orders
  // Using quantity_received instead of quantity_hatched for booking stage, but factoring in actuals if hatched
  const { data: batch } = await supabase.from('egg_batches').select('quantity_received, quantity_hatched, quantity_culled, mortality_count, status').eq('id', batchId).single()
  if (!batch) return { success: false, error: 'Batch not found' }

  const { data: allocatedOrders } = await supabase.from('orders').select('quantity').eq('allocated_batch_id', batchId).neq('id', orderId)
  
  const currentAllocated = (allocatedOrders || []).reduce((sum, o) => sum + o.quantity, 0)
  
  // Calculate projected available: received - culled - mortality
  const projectedLoss = (batch.quantity_culled || 0) + (batch.mortality_count || 0)
  const baseQuantity = ['COMPLETED', 'BROODER'].includes(batch.status) ? (batch.quantity_hatched || 0) : ((batch.quantity_received || 0) - projectedLoss)
  const available = baseQuantity - currentAllocated;

  if (order.quantity > available) {
    return { success: false, error: `Cannot allocate ${order.quantity} chicks. Only ${available} available in this batch.` }
  }

  // 3. Allocate
  const { error } = await supabase
    .from('orders')
    .update({ 
      allocated_batch_id: batchId,
      status: 'ALLOCATED',
      updated_at: new Date().toISOString() 
    })
    .eq('id', orderId)

  if (error) {
    return { success: false, error: error.message || 'Failed to allocate order' }
  }

  // Log batch allocation via audit system
  await logOrderBatchAllocated(orderId, batchId, order.quantity)

  await supabase.from('order_audit_logs').insert({
    order_id: orderId,
    action: 'STATUS_UPDATED',
    description: `Allocated to batch ${batchId}.`
  })

  revalidatePath('/orders')
  revalidatePath(`/orders/${orderId}`)
  revalidatePath(`/batches/${batchId}`)
  return { success: true }
}

export async function recordPayment(id: string, amount: number) {
  const supabase = await createClient()

  const { data: order } = await supabase
    .from('orders')
    .select('total_amount, balance_due, amount_paid')
    .eq('id', id)
    .single()

  if (!order) {
    return { success: false, error: 'Order not found' }
  }

  const newAmountPaid = (order.amount_paid || 0) + amount;
  const currentBalance = order.balance_due || 0;
  const totalAmount = order.total_amount || 0;
  const newBalance = Math.max(0, totalAmount - newAmountPaid);
  
  let newPaymentStatus = 'UNPAID';
  if (newBalance === 0 && totalAmount > 0) {
    newPaymentStatus = 'FULLY_PAID';
  } else if (newAmountPaid > 0) {
    newPaymentStatus = 'DEPOSIT_PAID';
  }

  // For orders marked 'INQUIRY' when a payment is made, they become 'RESERVED' generally
  const { error } = await supabase
    .from('orders')
    .update({ 
      amount_paid: newAmountPaid,
      balance_due: newBalance,
      payment_status: newPaymentStatus,
      status: newAmountPaid > 0 ? 'RESERVED' : 'INQUIRY',
      updated_at: new Date().toISOString() 
    })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message || 'Failed to record payment' }
  }

  // Log payment via audit system
  await logOrderPaymentReceived(id, amount, currentBalance, newBalance)

  await supabase.from('order_audit_logs').insert({
    order_id: id,
    action: 'PAYMENT_RECEIVED',
    description: `Payment of ${amount} KES received.`
  })

  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
  return { success: true }
}
