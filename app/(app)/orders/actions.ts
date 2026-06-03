'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { logOrderCreated, logOrderPaymentReceived, logOrderBatchAllocated } from '@/lib/audit'

type BatchAvailabilityCandidate = {
  id: string
  batch_number: string
  breed_type?: string | null
  status: string
  expected_hatch_date?: string | null
  baseQuantity: number
  allocatedCount: number
  available: number
}

const createOrderSchema = z.object({
  customer_name: z.string().min(1, 'Customer name is required'),
  customer_phone: z.string().optional(),
  location: z.string().optional(),
  quantity: z.number().int().positive('Quantity must be greater than 0'),
  breed_type: z.string().optional(),
  price_per_chick: z.number().min(0).default(130),
  discount_amount: z.number().min(0).default(0),
  expected_hatch_date: z.string().optional(),
  notes: z.string().optional(),
})

export async function createOrder(formData: FormData) {
  const result = createOrderSchema.safeParse({
    customer_name: formData.get('customer_name'),
    customer_phone: formData.get('customer_phone') || undefined,
    location: formData.get('location') || undefined,
    quantity: Number(formData.get('quantity')),
    breed_type: normalizeOptionalText(formData.get('breed_type')),
    price_per_chick: Number(formData.get('price_per_chick') || 130),
    discount_amount: Number(formData.get('discount_amount') || 0),
    expected_hatch_date: formData.get('expected_hatch_date') || undefined,
    notes: formData.get('notes') || undefined,
  })

  if (!result.success) {
    return { success: false, errors: result.error.flatten().fieldErrors, error: 'Invalid formulation' }
  }

  const supabase = await createClient()
  const db = supabase as any

  const { data: rpcResult, error: rpcError } = await db.rpc('create_order_atomic', {
    p_customer_name: result.data.customer_name,
    p_customer_phone: result.data.customer_phone || null,
    p_location: result.data.location || null,
    p_quantity: result.data.quantity,
    p_breed_type: result.data.breed_type || null,
    p_price_per_chick: result.data.price_per_chick,
    p_discount_amount: result.data.discount_amount,
    p_expected_hatch_date: result.data.expected_hatch_date || null,
    p_notes: result.data.notes || null,
  })

  if (!rpcError) {
    const createdOrder = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult
    revalidatePath('/orders')
    if (createdOrder?.allocated_batch_id) {
      revalidatePath(`/batches/${createdOrder.allocated_batch_id}`)
    }
    return { success: true }
  }

  if (!isMissingRpcError(rpcError)) {
    console.error('Failed to create order:', rpcError)
    return { success: false, error: rpcError.message || 'Failed to create order' }
  }

  // 1. Try to find existing customer by phone or name, else create
  let customerId = null
  if (result.data.customer_phone) {
    const { data: existingPhone } = await db.from('customers').select('id').eq('phone', result.data.customer_phone).is('deleted_at', null).maybeSingle()
    if (existingPhone) customerId = existingPhone.id
  }
  if (!customerId) {
    const { data: existingName } = await db.from('customers').select('id').eq('name', result.data.customer_name).is('deleted_at', null).maybeSingle()
    if (existingName) customerId = existingName.id
  }

  if (!customerId) {
    const { data: newCust, error: custErr } = await db.from('customers').insert({
      name: result.data.customer_name,
      phone: result.data.customer_phone || null,
      address: result.data.location || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select('id').single()
    if (!custErr && newCust) {
      customerId = newCust.id
    }
  }

  if (!customerId) {
    return { success: false, error: 'Failed to create or find customer' }
  }

  // Generate a sequential order number
  const order_number = `ORD-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`

  const subtotal_amount = result.data.quantity * result.data.price_per_chick
  const discount_amount = Math.min(result.data.discount_amount, subtotal_amount)
  const total_amount = Math.max(0, subtotal_amount - discount_amount)

  const autoAllocation = await findBestBatchForOrder(
    db,
    result.data.quantity,
    result.data.expected_hatch_date,
    result.data.breed_type
  )
  const shouldAutoAllocate = Boolean(autoAllocation)

  const { data: orderData, error } = await db.from('orders').insert({
    order_number,
    customer_id: customerId,
    total_quantity: result.data.quantity,
    subtotal_amount,
    discount_amount,
    total_amount,
    balance_due: total_amount,
    amount_paid: 0,
    status: shouldAutoAllocate ? 'ALLOCATED' : 'INQUIRY',
    payment_status: 'PENDING',
    dispatch_status: 'PENDING',
    required_by_date: result.data.expected_hatch_date || null,
    notes: result.data.notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).select('id').single()

  if (error || !orderData) {
    console.error('Failed to create order:', error)
    return { success: false, error: error?.message || 'Failed to create order' }
  }

  const { error: itemError } = await db.from('order_items').insert({
    order_id: orderData.id,
    description: result.data.breed_type ? `Day-old chicks - ${result.data.breed_type}` : 'Day-old chicks',
    quantity: result.data.quantity,
    unit_price: result.data.price_per_chick,
    total_price: subtotal_amount,
    batch_id: autoAllocation?.id || null,
    status: shouldAutoAllocate ? 'ALLOCATED' : 'UNALLOCATED',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })

  if (itemError) {
    console.error('Failed to create order item:', itemError)
    return { success: false, error: itemError.message || 'Failed to create order item' }
  }

  await logOrderCreated(orderData.id, result.data)
  if (autoAllocation) {
    await logOrderBatchAllocated(orderData.id, autoAllocation.id, result.data.quantity)
  }

  revalidatePath('/orders')
  if (autoAllocation) {
    revalidatePath(`/batches/${autoAllocation.id}`)
  }
  return { success: true }
}

export async function updateOrderStatus(id: string, status: string, additionalUpdates: any = {}) {
  const supabase = await createClient()
  const db = supabase as any

  const { data: order } = await db
    .from('orders')
    .select('id, status, payment_status, balance_due, order_items(id, batch_id)')
    .eq('id', id)
    .single()

  if (!order) {
    return { success: false, error: 'Order not found' }
  }

  const currentStatus = order.status || 'INQUIRY'
  const hasAllocatedBatch = Array.isArray(order.order_items)
    ? order.order_items.some((item: any) => Boolean(item.batch_id))
    : false

  const validTransitions: Record<string, string[]> = {
    INQUIRY: ['RESERVED', 'CONFIRMED', 'CANCELLED'],
    RESERVED: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['READY_FOR_DISPATCH', 'CANCELLED'],
    ALLOCATED: ['READY_FOR_DISPATCH', 'CANCELLED'],
    READY_FOR_DISPATCH: ['DISPATCHED', 'CANCELLED'],
    DISPATCHED: ['DELIVERED'],
    DELIVERED: [],
    CANCELLED: [],
  }

  if (!(validTransitions[currentStatus] || []).includes(status)) {
    return { success: false, error: `Cannot move order from ${currentStatus} to ${status}.` }
  }

  if (['READY_FOR_DISPATCH', 'DISPATCHED', 'DELIVERED'].includes(status) && !hasAllocatedBatch) {
    return { success: false, error: 'Allocate this order to a batch before dispatch actions.' }
  }

  if (['READY_FOR_DISPATCH', 'DISPATCHED', 'DELIVERED'].includes(status) && order.payment_status !== 'PAID') {
    return { success: false, error: 'Customer must fully pay before pickup or dispatch.' }
  }

  const derivedUpdates: Record<string, any> = {}
  if (status === 'READY_FOR_DISPATCH') {
    derivedUpdates.dispatch_status = 'SCHEDULED'
  }
  if (status === 'DISPATCHED') {
    derivedUpdates.dispatch_status = 'DISPATCHED'
  }
  if (status === 'DELIVERED') {
    derivedUpdates.dispatch_status = 'DELIVERED'
  }

  const { error } = await db
    .from('orders')
    .update({ 
      status, 
      ...derivedUpdates,
      ...additionalUpdates,
      updated_at: new Date().toISOString() 
    })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message || 'Failed to update order status' }
  }

  if (status === 'DELIVERED') {
    await db
      .from('order_items')
      .update({ status: 'FULFILLED', updated_at: new Date().toISOString() })
      .eq('order_id', id)
  }

  if (status === 'CANCELLED') {
    await db
      .from('order_items')
      .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
      .eq('order_id', id)
  }

  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
  return { success: true }
}

export async function deleteOrder(id: string) {
  const supabase = await createClient()
  const db = supabase as any

  const { data: order } = await db
    .from('orders')
    .select('status')
    .eq('id', id)
    .single()

  if (!order) {
    return { success: false, error: 'Order not found' }
  }

  if (order.status !== 'CANCELLED') {
    return { success: false, error: 'Cancel the order before deleting it.' }
  }

  // Soft delete: set deleted_at instead of hard delete
  const { error } = await db
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
  const db = supabase as any

  const { data: result, error } = await db.rpc('allocate_order_to_batch_atomic', {
    p_order_id: orderId,
    p_batch_id: batchId,
  })

  if (error) {
    return { success: false, error: error.message || 'Failed to allocate order' }
  }

  const allocation = Array.isArray(result) ? result[0] : result
  await logOrderBatchAllocated(orderId, batchId, Number(allocation?.allocated_quantity || 0))

  revalidatePath('/orders')
  revalidatePath(`/orders/${orderId}`)
  revalidatePath(`/batches/${batchId}`)
  return { success: true }
}

async function findBestBatchForOrder(
  db: any,
  quantity: number,
  requiredByDate?: string,
  requestedBreed?: string
): Promise<BatchAvailabilityCandidate | null> {
  const candidates = await getBatchAvailabilityCandidates(db)
  const fulfillable = candidates.filter((batch) => {
    if (batch.available < quantity) return false
    if (!requestedBreed) return true
    return isBreedMatch(batch.breed_type, requestedBreed)
  })
  if (fulfillable.length === 0) return null

  const requiredAt = requiredByDate ? new Date(requiredByDate).getTime() : null
  const dateMatched = requiredAt
    ? fulfillable.filter((batch) => {
        if (!batch.expected_hatch_date) return batch.status === 'COMPLETED' || batch.status === 'BROODER'
        return new Date(batch.expected_hatch_date).getTime() <= requiredAt
      })
    : fulfillable

  const pool = dateMatched.length > 0 ? dateMatched : fulfillable
  return pool.sort((a, b) => {
    const aReady = a.status === 'COMPLETED' || a.status === 'BROODER' ? 0 : 1
    const bReady = b.status === 'COMPLETED' || b.status === 'BROODER' ? 0 : 1
    if (aReady !== bReady) return aReady - bReady

    const aDate = a.expected_hatch_date ? new Date(a.expected_hatch_date).getTime() : Number.MAX_SAFE_INTEGER
    const bDate = b.expected_hatch_date ? new Date(b.expected_hatch_date).getTime() : Number.MAX_SAFE_INTEGER
    if (aDate !== bDate) return aDate - bDate

    return a.available - b.available
  })[0]
}

async function getBatchAvailabilityCandidates(db: any, excludeOrderId?: string): Promise<BatchAvailabilityCandidate[]> {
  const [{ data: batches }, { data: allocatedItems }] = await Promise.all([
    db
      .from('egg_batches')
      .select('id, batch_number, breed_type, quantity_received, quantity_set, accepted_eggs, quantity_hatched, quantity_culled, mortality_count, status, expected_hatch_date')
      .not('status', 'eq', 'DISCARDED')
      .not('status', 'eq', 'FAILED')
      .not('status', 'eq', 'CANCELLED'),
    db
      .from('order_items')
      .select('batch_id, quantity, order_id, status')
      .not('batch_id', 'is', null),
  ])

  const allocatedByBatch = (allocatedItems || []).reduce((acc: Record<string, number>, item: any) => {
    if (!item.batch_id || (excludeOrderId && item.order_id === excludeOrderId)) return acc
    if (item.status === 'CANCELLED') return acc
    acc[item.batch_id] = (acc[item.batch_id] || 0) + Number(item.quantity || 0)
    return acc
  }, {})

  return (batches || [])
    .map((batch: any) => {
      const projectedLoss = Number(batch.quantity_culled || 0) + Number(batch.mortality_count || 0)
      const incubationBase = Number(batch.quantity_set ?? batch.accepted_eggs ?? batch.quantity_received ?? 0)
      const baseQuantity = ['COMPLETED', 'BROODER'].includes(batch.status || '')
        ? Number(batch.quantity_hatched || 0)
        : Math.max(0, incubationBase - projectedLoss)
      const allocatedCount = allocatedByBatch[batch.id] || 0
      const available = Math.max(0, baseQuantity - allocatedCount)

      return {
        id: batch.id,
        batch_number: batch.batch_number,
        breed_type: batch.breed_type,
        status: batch.status,
        expected_hatch_date: batch.expected_hatch_date,
        baseQuantity,
        allocatedCount,
        available,
      }
    })
    .filter((batch: BatchAvailabilityCandidate) => batch.available > 0)
}

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || undefined
}

function normalizeBreed(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function isBreedMatch(batchBreed?: string | null, requestedBreed?: string | null) {
  const batchValue = normalizeBreed(batchBreed)
  const requestedValue = normalizeBreed(requestedBreed)
  if (!requestedValue) return true
  if (!batchValue) return false
  return batchValue === requestedValue || batchValue.includes(requestedValue) || requestedValue.includes(batchValue)
}

function isMissingRpcError(error: any) {
  const message = String(error?.message || '')
  return error?.code === 'PGRST202' || error?.code === '42883' || message.includes('Could not find the function')
}

const paymentMethodSchema = z.enum(['M_PESA', 'CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'])

export async function recordPayment(id: string, amount: number, paymentMethod = 'CASH', reference?: string) {
  const supabase = await createClient()
  const db = supabase as any

  const parsedMethod = paymentMethodSchema.safeParse(paymentMethod)
  if (!parsedMethod.success) {
    return { success: false, error: 'Select a valid payment method' }
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: 'Payment amount must be greater than zero' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  const { data: rpcResult, error } = await db.rpc('record_order_payment_atomic', {
    p_order_id: id,
    p_amount: amount,
    p_payment_method: parsedMethod.data,
    p_transaction_reference: reference || null,
    p_recorded_by: user?.id || null,
  })

  if (error) {
    return { success: false, error: error.message || 'Failed to record payment' }
  }

  const payment = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult
  const newBalance = Number(payment?.balance_due ?? 0)
  const previousBalance = newBalance + amount
  await logOrderPaymentReceived(id, amount, previousBalance, newBalance)

  revalidatePath('/orders')
  revalidatePath(`/orders/${id}`)
  return { success: true }
}

const pricingAdjustmentSchema = z.object({
  pricePerChick: z.number().min(0, 'Price per chick cannot be negative'),
  discountAmount: z.number().min(0, 'Discount cannot be negative').default(0),
  reason: z.string().optional(),
})

export async function adjustOrderPricing(orderId: string, input: z.infer<typeof pricingAdjustmentSchema>) {
  const result = pricingAdjustmentSchema.safeParse(input)
  if (!result.success) {
    return { success: false, error: 'Invalid price adjustment' }
  }

  const supabase = await createClient()
  const db = supabase as any

  const { data: order } = await db
    .from('orders')
    .select('id, status, total_quantity, amount_paid, notes, order_items(id, quantity)')
    .eq('id', orderId)
    .single()

  if (!order) {
    return { success: false, error: 'Order not found' }
  }

  if (['DELIVERED', 'CANCELLED'].includes(order.status || '')) {
    return { success: false, error: 'Closed orders cannot be repriced.' }
  }

  const quantity = Number(order.total_quantity || 0)
  const subtotalAmount = quantity * result.data.pricePerChick
  const discountAmount = Math.min(result.data.discountAmount, subtotalAmount)
  const totalAmount = subtotalAmount - discountAmount
  const amountPaid = Number(order.amount_paid || 0)

  if (amountPaid > totalAmount) {
    return {
      success: false,
      error: `This adjustment would make the order total lower than the amount already paid (${amountPaid.toLocaleString()} KES).`,
    }
  }

  const balanceDue = Math.max(0, totalAmount - amountPaid)
  const paymentStatus = balanceDue === 0 && totalAmount > 0 ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'PENDING'
  const now = new Date().toISOString()

  const { error: orderError } = await db
    .from('orders')
    .update({
      subtotal_amount: subtotalAmount,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      balance_due: balanceDue,
      payment_status: paymentStatus,
      notes: result.data.reason
        ? `${order.notes ? `${order.notes}\n` : ''}Price adjustment: ${result.data.reason}`
        : order.notes,
      updated_at: now,
    })
    .eq('id', orderId)

  if (orderError) {
    return { success: false, error: orderError.message || 'Failed to adjust pricing' }
  }

  const items = Array.isArray(order.order_items) ? order.order_items : []
  await Promise.all(
    items.map((item: any) =>
      db
        .from('order_items')
        .update({
          unit_price: result.data.pricePerChick,
          total_price: Number(item.quantity || 0) * result.data.pricePerChick,
          updated_at: now,
        })
        .eq('id', item.id)
    )
  )

  revalidatePath('/orders')
  revalidatePath(`/orders/${orderId}`)
  return { success: true }
}

const handoverSchema = z.object({
  handoverType: z.enum(['PICKUP', 'DELIVERY']),
  contactName: z.string().min(1, 'Collector or recipient name is required'),
  contactPhone: z.string().optional(),
  vehicleNumber: z.string().optional(),
  handoverQuantity: z.number().int().positive().optional(),
  notes: z.string().optional(),
})

export async function completeOrderHandover(orderId: string, input: z.infer<typeof handoverSchema>) {
  const result = handoverSchema.safeParse(input)
  if (!result.success) {
    return { success: false, error: 'Invalid pickup or delivery details' }
  }

  const supabase = await createClient()
  const db = supabase as any

  const { error } = await db.rpc('complete_order_handover_atomic', {
    p_order_id: orderId,
    p_handover_type: result.data.handoverType,
    p_contact_name: result.data.contactName,
    p_contact_phone: result.data.contactPhone || null,
    p_vehicle_number: result.data.vehicleNumber || null,
    p_handover_quantity: result.data.handoverQuantity || null,
    p_notes: result.data.notes || null,
  })

  if (error) return { success: false, error: error.message || 'Failed to record pickup or delivery' }

  revalidatePath('/orders')
  revalidatePath(`/orders/${orderId}`)
  return { success: true }
}
